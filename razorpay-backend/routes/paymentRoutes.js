/**
 * Payment Order Creation, Status Verification & Refund Routes
 */

const express = require("express");
const router = express.Router();
const { db, admin } = require("../config/firebase");
const { optionalAuth, verifyAuth } = require("../middleware/authMiddleware");
const cashfreeMarketplaceService = require("../services/cashfreeMarketplaceService");
const { calculateSplit } = require("../services/paymentCalculationService");
const { isProduction } = require("../config/cashfree");

/**
 * Resolves an owner document from a service document.
 * Looks up by service.ownerIds, service.ownerId, or shop.ownerId.
 */
async function resolveOwnerForService(serviceData) {
  let ownerId = null;

  // 1. Direct ownerIds array or ownerId field on service
  if (Array.isArray(serviceData.ownerIds) && serviceData.ownerIds.length > 0) {
    ownerId = serviceData.ownerIds[0];
  } else if (serviceData.ownerId) {
    ownerId = serviceData.ownerId;
  }

  // 2. If not found on service, resolve via shopId
  if (!ownerId && (serviceData.shopId || (Array.isArray(serviceData.shopIds) && serviceData.shopIds.length > 0))) {
    const shopId = serviceData.shopId || serviceData.shopIds[0];
    const shopDoc = await db.collection("shops").doc(shopId).get();
    if (shopDoc.exists) {
      ownerId = shopDoc.data().ownerId;
    }
  }

  if (!ownerId) {
    return { ownerId: null, ownerDoc: null };
  }

  const ownerDoc = await db.collection("barberowner").doc(ownerId).get();
  return { ownerId, ownerDoc: ownerDoc.exists ? ownerDoc : null };
}

// 1️⃣ PHASE 2: Create Payment Order with 10%/90% Split
router.post("/create-order", optionalAuth, async (req, res) => {
  try {
    const {
      serviceId,
      bookingId,
      appointmentId,
      notes = {},
      // Fallback for transition phase if client passes amount
      amount: fallbackAmount
    } = req.body;

    const targetServiceId = serviceId || notes.service_id;
    const targetBookingId = bookingId || appointmentId || notes.booking_id || notes.appointment_id || `bk_${Date.now()}`;
    const customerId = req.user?.uid || notes.customer_id || notes.user_id || "guest";
    const customerPhone = notes.phone || req.user?.phone_number || "9999999999";

    let servicePrice = null;
    let serviceData = null;
    let ownerId = null;
    let ownerData = null;

    // Load service from Firestore if serviceId provided
    if (targetServiceId) {
      let serviceDoc = await db.collection("services").doc(targetServiceId).get();
      if (!serviceDoc.exists) {
        // Try pending_services
        serviceDoc = await db.collection("pending_services").doc(targetServiceId).get();
      }

      if (serviceDoc.exists) {
        serviceData = serviceDoc.data();
        const priceNum = Number(serviceData.price);
        if (!isNaN(priceNum) && priceNum > 0) {
          servicePrice = priceNum;
        }

        // Resolve owner
        const resolved = await resolveOwnerForService(serviceData);
        ownerId = resolved.ownerId;
        if (resolved.ownerDoc) {
          ownerData = resolved.ownerDoc.data();
        }
      }
    }

    // Determine definitive total amount: DB price is prioritized over client amount
    const totalAmount = servicePrice !== null ? servicePrice : Number(fallbackAmount);

    if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Unable to determine a valid positive service price for this order."
      });
    }

    // Calculate 10% Platform / 90% Owner split
    const split = calculateSplit(totalAmount);

    // Resolve owner's Cashfree vendor ID
    let cashfreeVendorId = null;
    if (ownerData) {
      cashfreeVendorId = ownerData.cashfreeVendorId;
      
      // Auto-onboard owner to Cashfree if they have bank details but no vendorId yet
      if (!cashfreeVendorId && ownerData.bankAccountNumber && ownerData.bankIfscCode) {
        try {
          const generatedVendorId = cashfreeMarketplaceService.constructor.generateVendorId(ownerId);
          await cashfreeMarketplaceService.createVendor({
            vendorId: generatedVendorId,
            name: ownerData.name || "Shop Owner",
            email: ownerData.email || `${customerPhone}@mybarber.co.in`,
            phone: ownerData.phoneNumber || customerPhone,
            bankAccountNumber: ownerData.bankAccountNumber,
            bankIfscCode: ownerData.bankIfscCode,
            bankAccountHolderName: ownerData.bankAccountHolderName || ownerData.name
          });
          cashfreeVendorId = generatedVendorId;
          await db.collection("barberowner").doc(ownerId).update({
            cashfreeVendorId: generatedVendorId,
            cashfreeVendorStatus: "ACTIVE",
            cashfreeOnboardingStatus: "COMPLETED",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (onboardErr) {
          console.warn(`⚠️ Automatic owner onboarding failed: ${onboardErr.message}`);
        }
      }
    }

    // Create unique order ID
    const orderReceipt = `bk_${Date.now()}`;
    const orderId = `${orderReceipt}_${Math.floor(1000 + Math.random() * 9000)}`;

    // Call Cashfree PGCreateOrder with order_splits
    const cashfreeOrder = await cashfreeMarketplaceService.createOrder({
      orderId,
      amount: split.totalAmount,
      currency: "INR",
      customerDetails: {
        customer_id: customerId,
        customer_phone: customerPhone,
        customer_name: req.user?.name || notes.customer_name || "Customer",
        customer_email: req.user?.email || notes.customer_email || "customer@mybarber.co.in"
      },
      vendorId: cashfreeVendorId,
      ownerAmount: split.ownerAmount,
      platformAmount: split.platformAmount,
      notes: {
        ...notes,
        booking_id: targetBookingId,
        service_id: targetServiceId || "custom",
        owner_id: ownerId || "platform",
        vendor_id: cashfreeVendorId || "none"
      }
    });

    // Store payment audit record in Firestore
    const paymentDocData = {
      orderId,
      bookingId: targetBookingId,
      serviceId: targetServiceId || null,
      serviceName: serviceData?.name || notes.service || "Service",
      customerId,
      ownerId: ownerId || null,
      cashfreeVendorId: cashfreeVendorId || null,

      totalAmount: split.totalAmount,
      platformPercentage: split.platformPercentage,
      platformAmount: split.platformAmount,

      ownerPercentage: split.ownerPercentage,
      ownerAmount: split.ownerAmount,

      cashfreeOrderId: cashfreeOrder.order_id,
      cashfreePaymentSessionId: cashfreeOrder.payment_session_id,

      paymentStatus: "PENDING",
      splitStatus: cashfreeVendorId ? "PENDING" : "NOT_STARTED",

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("payments").doc(orderId).set(paymentDocData);

    // Return only the session data required by React Native checkout
    return res.json({
      success: true,
      orderId: cashfreeOrder.order_id,
      paymentSessionId: cashfreeOrder.payment_session_id,
      currency: cashfreeOrder.order_currency || "INR",
      amount: cashfreeOrder.order_amount,
      environment: isProduction ? "PRODUCTION" : "SANDBOX",
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ /api/payments/create-order failed:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create payment order"
    });
  }
});

// 2️⃣ PHASE 3: Authoritative Payment Verification
router.post("/verify-status", async (req, res) => {
  const { order_id, orderId } = req.body;
  const targetOrderId = order_id || orderId;

  if (!targetOrderId) {
    return res.status(400).json({
      success: false,
      message: "Missing order_id parameter"
    });
  }

  try {
    // 1. Fetch payments directly from Cashfree
    const payments = await cashfreeMarketplaceService.fetchPayments(targetOrderId);
    if (!payments || payments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No payment attempts found for this order"
      });
    }

    const successfulPayment = payments.find(p => p.payment_status === "SUCCESS");
    const paymentDocRef = db.collection("payments").doc(targetOrderId);
    const paymentDocSnap = await paymentDocRef.get();

    if (successfulPayment) {
      // Update payment document in Firestore
      if (paymentDocSnap.exists) {
        await paymentDocRef.update({
          paymentStatus: "SUCCESS",
          cashfreePaymentId: String(successfulPayment.cf_payment_id),
          paymentMethod: successfulPayment.payment_group || "online",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      return res.json({
        success: true,
        orderId: targetOrderId,
        paymentId: String(successfulPayment.cf_payment_id),
        paymentStatus: "SUCCESS",
        splitStatus: paymentDocSnap.exists ? paymentDocSnap.data().splitStatus : "COMPLETED",
        paymentMethod: successfulPayment.payment_group,
        amount: successfulPayment.payment_amount
      });
    } else {
      const lastPayment = payments[payments.length - 1];
      return res.status(400).json({
        success: false,
        orderId: targetOrderId,
        paymentStatus: lastPayment.payment_status,
        message: `Payment status: ${lastPayment.payment_status}`
      });
    }
  } catch (error) {
    console.error("❌ Payment verification error:", error);
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: error.message
    });
  }
});

// 3️⃣ PHASE 7: Process Refund with Vendor Reversal
router.post("/refund", verifyAuth, async (req, res) => {
  try {
    const { orderId, amount, reason } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: "Missing orderId" });
    }

    const paymentDocSnap = await db.collection("payments").doc(orderId).get();
    if (!paymentDocSnap.exists) {
      return res.status(404).json({ success: false, message: "Payment record not found" });
    }

    const payment = paymentDocSnap.data();
    if (payment.paymentStatus !== "SUCCESS") {
      return res.status(400).json({
        success: false,
        message: `Cannot refund order with payment status: ${payment.paymentStatus}`
      });
    }

    const refundAmount = amount ? Number(amount) : payment.totalAmount;
    if (refundAmount > payment.totalAmount) {
      return res.status(400).json({ success: false, message: "Refund amount exceeds total payment amount" });
    }

    const isFullRefund = refundAmount === payment.totalAmount;

    // Calculate vendor reversal amount (90% of refunded amount)
    let vendorRefundAmount = 0;
    if (payment.cashfreeVendorId) {
      vendorRefundAmount = Math.round(refundAmount * 0.90 * 100) / 100;
    }

    const refundId = `ref_${orderId}_${Date.now()}`;

    // Execute Cashfree refund with vendor reversal
    const refundResult = await cashfreeMarketplaceService.createRefund({
      orderId,
      refundId,
      amount: refundAmount,
      vendorId: payment.cashfreeVendorId,
      vendorRefundAmount,
      refundNote: reason || "Customer refund"
    });

    const newPaymentStatus = isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED";
    const newSplitStatus = "REVERSED";

    await db.collection("payments").doc(orderId).update({
      paymentStatus: newPaymentStatus,
      splitStatus: newSplitStatus,
      refundId,
      refundAmount,
      vendorRefundAmount,
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: "Refund processed successfully",
      refundId,
      paymentStatus: newPaymentStatus,
      splitStatus: newSplitStatus,
      refundResult
    });
  } catch (error) {
    console.error("❌ Refund processing failed:", error);
    res.status(500).json({
      success: false,
      message: "Refund processing failed",
      error: error.message
    });
  }
});

// 4️⃣ Get Payment Audit Record
router.get("/:orderId", verifyAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const paymentDoc = await db.collection("payments").doc(orderId).get();
    if (!paymentDoc.exists) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    res.json({
      success: true,
      payment: paymentDoc.data()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
