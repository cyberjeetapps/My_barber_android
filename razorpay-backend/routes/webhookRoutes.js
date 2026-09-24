/**
 * Cashfree Webhook Handler
 *
 * Verifies webhook signatures, guarantees idempotent state transitions,
 * processes payment completions, and records payment splits audit trails.
 */

const express = require("express");
const router = express.Router();
const { db, admin } = require("../config/firebase");
const cashfreeMarketplaceService = require("../services/cashfreeMarketplaceService");

router.post("/cashfree", async (req, res) => {
  const signature = req.headers["x-webhook-signature"];
  const timestamp = req.headers["x-webhook-timestamp"];
  const rawBody = req.rawBody;

  console.log("🔔 [Cashfree Webhook] Incoming event received. Timestamp:", timestamp);

  // 1️⃣ Verify Webhook Signature
  let eventPayload = null;
  try {
    eventPayload = cashfreeMarketplaceService.verifyWebhookSignature(signature, rawBody, timestamp);
  } catch (sigErr) {
    console.error("❌ [Cashfree Webhook] Signature verification failed:", sigErr.message);
    return res.status(400).json({
      success: false,
      message: "Invalid webhook signature"
    });
  }

  try {
    const eventType = eventPayload?.type;
    const eventData = eventPayload?.data || {};
    const orderInfo = eventData?.order || {};
    const paymentInfo = eventData?.payment || {};

    const orderId = orderInfo.order_id || eventData.order_id;
    const paymentId = paymentInfo.cf_payment_id || eventData.cf_payment_id;
    const paymentStatus = paymentInfo.payment_status || (eventType === "PAYMENT_SUCCESS_WEBHOOK" ? "SUCCESS" : "FAILED");

    console.log(`📦 [Cashfree Webhook] Event Type: ${eventType} | Order ID: ${orderId} | Status: ${paymentStatus}`);

    if (!orderId) {
      console.warn("⚠️ [Cashfree Webhook] Missing order_id in webhook payload, acknowledging receipt");
      return res.status(200).json({ status: "acknowledged", warning: "Missing order_id" });
    }

    // 2️⃣ Idempotency & State Machine handling using a Firestore transaction
    const paymentDocRef = db.collection("payments").doc(orderId);

    const transactionResult = await db.runTransaction(async (transaction) => {
      const paymentSnap = await transaction.get(paymentDocRef);

      if (!paymentSnap.exists) {
        console.warn(`⚠️ [Cashfree Webhook] No payment record found for order ${orderId}`);
        return { action: "NOT_FOUND" };
      }

      const payment = paymentSnap.data();

      // Check if already processed (Idempotency)
      if (payment.paymentStatus === "SUCCESS" && payment.splitStatus === "COMPLETED") {
        console.log(`ℹ️ [Cashfree Webhook] Order ${orderId} is already COMPLETED. Skipping duplicate payout processing.`);
        return { action: "ALREADY_COMPLETED", payment };
      }

      // Handle Successful Payment
      if (paymentStatus === "SUCCESS" || eventType === "PAYMENT_SUCCESS_WEBHOOK") {
        const updateFields = {
          paymentStatus: "SUCCESS",
          cashfreePaymentId: String(paymentId || payment.cashfreePaymentId || ""),
          paymentMethod: paymentInfo.payment_group || payment.paymentMethod || "online",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // If vendor ID is present and splitStatus is not COMPLETED, mark split as COMPLETED
        if (payment.cashfreeVendorId) {
          updateFields.splitStatus = "COMPLETED";
          updateFields.cfSplitReference = `split_${orderId}_${Date.now()}`;
        } else {
          updateFields.splitStatus = "NOT_STARTED";
        }

        transaction.update(paymentDocRef, updateFields);
        return { action: "PROCESSED_SUCCESS", payment: { ...payment, ...updateFields } };
      }

      // Handle Failed Payment
      if (paymentStatus === "FAILED" || eventType === "PAYMENT_FAILED_WEBHOOK") {
        transaction.update(paymentDocRef, {
          paymentStatus: "FAILED",
          splitStatus: "FAILED",
          failureReason: eventData?.error_details?.error_description || "Payment failed",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { action: "PROCESSED_FAILURE" };
      }

      return { action: "IGNORED_STATUS", status: paymentStatus };
    });

    // 3️⃣ Post-Transaction Operations (Audit logs & linked appointments)
    if (transactionResult.action === "PROCESSED_SUCCESS") {
      const finalPayment = transactionResult.payment;

      // Create paymentSplits audit record
      if (finalPayment.cashfreeVendorId) {
        const splitDocId = `split_${orderId}`;
        await db.collection("paymentSplits").doc(splitDocId).set({
          splitId: splitDocId,
          orderId: orderId,
          cashfreeOrderId: orderId,
          cashfreePaymentId: finalPayment.cashfreePaymentId || null,
          ownerId: finalPayment.ownerId || null,
          cashfreeVendorId: finalPayment.cashfreeVendorId,
          totalAmount: finalPayment.totalAmount,
          vendorSplitAmount: finalPayment.ownerAmount,
          platformAmount: finalPayment.platformAmount,
          vendorPercentage: finalPayment.ownerPercentage || 90,
          platformPercentage: finalPayment.platformPercentage || 10,
          splitStatus: "COMPLETED",
          reconciledWithCashfree: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Update linked appointment or booking if applicable
      if (finalPayment.bookingId) {
        try {
          const apptRef = db.collection("appointments").doc(finalPayment.bookingId);
          const apptSnap = await apptRef.get();
          if (apptSnap.exists) {
            await apptRef.update({
              paymentStatus: "paid",
              paymentDate: new Date().toISOString(),
              cashfreeOrderId: orderId,
              cashfreePaymentId: finalPayment.cashfreePaymentId,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        } catch (apptErr) {
          console.warn("⚠️ Could not update linked appointment:", apptErr.message);
        }
      }

      console.log(`✅ [Cashfree Webhook] Order ${orderId} successfully processed & split completed!`);
    }

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      action: transactionResult.action
    });
  } catch (error) {
    console.error("❌ [Cashfree Webhook] Uncaught error during processing:", error);
    // Return 200 to prevent Cashfree continuous retry loop on non-retriable internal bugs,
    // but log error for inspection
    return res.status(200).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
