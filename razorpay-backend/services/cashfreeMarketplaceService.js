/**
 * Cashfree Marketplace & Easy Split Service
 *
 * Implements official Cashfree Marketplace/Easy Split APIs for:
 * - Vendor Onboarding & Status Management
 * - Order Creation with Vendor Splits
 * - Post-Payment Split Execution & Reconciliation
 * - Refunds with Vendor Payout Reversals
 * - Webhook Signature Verification
 */

const crypto = require("crypto");
const { cashfreeInstance, Cashfree, CASHFREE_API_VERSION } = require("../config/cashfree");

class CashfreeMarketplaceService {
  /**
   * Sanitizes phone number to 10 digits as expected by Cashfree India.
   * @param {string} phone
   * @returns {string}
   */
  static cleanPhoneNumber(phone) {
    if (!phone) return "9999999999";
    const cleaned = String(phone).replace(/[^0-9]/g, "");
    return cleaned.slice(-10) || "9999999999";
  }

  /**
   * Generates a unique vendor ID compatible with Cashfree (alphanumeric + underscore).
   * @param {string} ownerId
   * @returns {string}
   */
  static generateVendorId(ownerId) {
    const sanitized = String(ownerId).replace(/[^a-zA-Z0-9_]/g, "_");
    return `vendor_${sanitized}`.slice(0, 40);
  }

  /**
   * PHASE 1: Registers a barber/shop owner as an Easy Split vendor on Cashfree.
   *
   * @param {Object} params
   * @param {string} params.vendorId - Unique identifier (e.g. vendor_<ownerId>)
   * @param {string} params.name - Account holder / Barber shop owner name
   * @param {string} params.email - Contact email
   * @param {string} params.phone - 10-digit Indian phone number
   * @param {string} params.bankAccountNumber - Bank account number
   * @param {string} params.bankIfscCode - Bank IFSC code
   * @param {string} params.bankAccountHolderName - Name as registered with bank
   * @returns {Promise<Object>} Vendor entity from Cashfree
   */
  async createVendor({
    vendorId,
    name,
    email,
    phone,
    bankAccountNumber,
    bankIfscCode,
    bankAccountHolderName
  }) {
    if (!vendorId || !name || !bankAccountNumber || !bankIfscCode) {
      throw new Error("Missing required vendor details (vendorId, name, bankAccountNumber, bankIfscCode)");
    }

    const cleanPhone = CashfreeMarketplaceService.cleanPhoneNumber(phone);
    const validEmail = email && email.includes("@") ? email : `${cleanPhone}@mybarber.co.in`;
    const cleanHolderName = bankAccountHolderName || name;

    const createVendorRequest = {
      vendor_id: vendorId,
      name: name.replace(/[^a-zA-Z0-9 .\/&-]/g, "").trim(),
      email: validEmail,
      phone: cleanPhone,
      status: "ACTIVE",
      verify_account: false,
      dashboard_access: false,
      bank: {
        account_number: String(bankAccountNumber).trim(),
        account_holder: cleanHolderName.replace(/[^a-zA-Z0-9 .\/&-]/g, "").trim(),
        ifsc: String(bankIfscCode).trim().toUpperCase()
      },
      kyc_details: {
        account_type: "INDIVIDUAL",
        business_type: "Miscellaneous"
      }
    };

    const requestId = `req_vnd_${Date.now()}`;
    const idempotencyKey = `idemp_vnd_${vendorId}`;

    try {
      console.log(`🚀 [Cashfree] Creating vendor: ${vendorId}`);
      const response = await cashfreeInstance.PGESCreateVendors(
        requestId,
        idempotencyKey,
        createVendorRequest
      );
      console.log(`✅ [Cashfree] Vendor created successfully: ${vendorId}`, response.data);
      return response.data;
    } catch (error) {
      const errData = error.response?.data;
      console.error(`❌ [Cashfree] Failed to create vendor ${vendorId}:`, errData || error.message);
      
      // If vendor already exists, fetch the existing vendor details instead of hard failing
      if (errData?.message?.toLowerCase().includes("already exists") || error.response?.status === 409) {
        console.log(`🔄 [Cashfree] Vendor ${vendorId} already exists, fetching existing vendor...`);
        return await this.getVendor(vendorId);
      }
      
      const err = new Error(errData?.message || error.message || "Cashfree vendor onboarding failed");
      err.response = error.response;
      throw err;
    }
  }

  /**
   * Retrieves vendor details from Cashfree.
   * @param {string} vendorId
   * @returns {Promise<Object>}
   */
  async getVendor(vendorId) {
    const requestId = `req_get_vnd_${Date.now()}`;
    try {
      const response = await cashfreeInstance.PGESFetchVendors(vendorId, requestId);
      return response.data;
    } catch (error) {
      console.error(`❌ [Cashfree] Failed to fetch vendor ${vendorId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Updates existing vendor details on Cashfree.
   * @param {string} vendorId
   * @param {Object} updateData
   * @returns {Promise<Object>}
   */
  async updateVendor(vendorId, updateData) {
    const requestId = `req_upd_vnd_${Date.now()}`;
    const idempotencyKey = `idemp_upd_${vendorId}_${Date.now()}`;

    try {
      console.log(`🔄 [Cashfree] Updating vendor: ${vendorId}`);
      const response = await cashfreeInstance.PGESUpdateVendors(
        vendorId,
        requestId,
        idempotencyKey,
        updateData
      );
      return response.data;
    } catch (error) {
      console.error(`❌ [Cashfree] Failed to update vendor ${vendorId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Helper to inspect vendor status.
   * @param {string} vendorId
   * @returns {Promise<string>}
   */
  async getVendorStatus(vendorId) {
    try {
      const vendor = await this.getVendor(vendorId);
      return vendor.status || "UNKNOWN";
    } catch (error) {
      if (error.response?.status === 404) {
        return "NOT_FOUND";
      }
      throw error;
    }
  }

  /**
   * PHASE 2: Creates a Cashfree payment order with static vendor split configured upfront.
   * 
   * When order_splits is included, Cashfree automatically allocates the specified 90%
   * to the vendor and 10% to the platform merchant upon payment success.
   *
   * @param {Object} params
   * @param {string} params.orderId - Unique order id
   * @param {number} params.amount - Total order amount in INR
   * @param {string} params.currency - e.g. "INR"
   * @param {Object} params.customerDetails - { customer_id, customer_phone, customer_name, customer_email }
   * @param {string} params.vendorId - Cashfree vendor id for 90% payout
   * @param {number} params.ownerAmount - Exact 90% amount in INR
   * @param {number} params.platformAmount - Exact 10% amount in INR
   * @param {Object} [params.notes] - Custom tags & metadata
   * @param {string} [params.returnUrl] - Optional redirect URL
   * @returns {Promise<Object>} Cashfree order response with payment_session_id
   */
  async createOrder({
    orderId,
    amount,
    currency = "INR",
    customerDetails,
    vendorId,
    ownerAmount,
    platformAmount,
    notes = {},
    returnUrl = "https://mybarber.co.in/return?order_id={order_id}"
  }) {
    const orderRequest = {
      order_id: orderId,
      order_amount: Number(amount),
      order_currency: currency,
      customer_details: {
        customer_id: customerDetails?.customer_id || "guest",
        customer_phone: CashfreeMarketplaceService.cleanPhoneNumber(customerDetails?.customer_phone),
        customer_name: customerDetails?.customer_name || "Customer",
        customer_email: customerDetails?.customer_email || "customer@mybarber.co.in"
      },
      order_meta: {
        return_url: returnUrl
      },
      order_tags: {
        ...notes,
        platform: "react-native-expo"
      }
    };

    // Attach Easy Split if a vendorId is provided
    // Note: Cashfree requires ONLY ONE of amount or percentage to be present in order_splits
    if (vendorId) {
      orderRequest.order_splits = [
        {
          vendor_id: vendorId,
          percentage: 90
        }
      ];
    }

    try {
      console.log(`🛒 [Cashfree] Creating Order: ${orderId} | Total: ₹${amount} | Vendor Split: ₹${ownerAmount} (vendor: ${vendorId})`);
      const response = await cashfreeInstance.PGCreateOrder(orderRequest);
      return response.data;
    } catch (error) {
      const errData = error.response?.data;
      console.error(`❌ [Cashfree] Order creation failed for ${orderId}:`, errData || error.message);
      const err = new Error(errData?.message || error.message || "Order creation failed");
      err.response = error.response;
      throw err;
    }
  }

  /**
   * Executes post-payment split via Easy Split API (for dynamic splits if not done at order creation).
   *
   * @param {Object} params
   * @param {string} params.orderId - Cashfree order ID
   * @param {string} params.vendorId - Cashfree vendor ID
   * @param {number} params.amount - 90% vendor amount
   * @param {number} params.percentage - Split percentage (90)
   * @param {string} [params.idempotencyKey]
   * @returns {Promise<Object>}
   */
  async createSplitAfterPayment({
    orderId,
    vendorId,
    amount,
    percentage = 90,
    idempotencyKey
  }) {
    const requestId = `req_split_${Date.now()}`;
    const idempKey = idempotencyKey || `idemp_split_${orderId}_${vendorId}`;

    const splitObj = { vendor_id: vendorId };
    if (percentage != null) {
      splitObj.percentage = Number(percentage);
    } else {
      splitObj.amount = Number(amount);
    }

    const splitRequest = {
      split: [splitObj],
      disable_split: true
    };

    try {
      console.log(`💸 [Cashfree] Executing Split After Payment on order: ${orderId}`);
      const response = await cashfreeInstance.PGOrderSplitAfterPayment(
        orderId,
        requestId,
        idempKey,
        splitRequest
      );
      return response.data;
    } catch (error) {
      console.error(`❌ [Cashfree] Split after payment failed on ${orderId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetches split and settlement reconciliation details for an order.
   * @param {string} orderId
   * @returns {Promise<Object>}
   */
  async getOrderSplitRecon(orderId) {
    const requestId = `req_recon_${Date.now()}`;
    try {
      const response = await cashfreeInstance.PGSplitOrderRecon(orderId, requestId);
      return response.data;
    } catch (error) {
      console.error(`❌ [Cashfree] Split Order Recon failed for ${orderId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Fetches payment attempts and status for an order.
   * @param {string} orderId
   * @returns {Promise<Array>} List of payment attempts
   */
  async fetchPayments(orderId) {
    try {
      const response = await cashfreeInstance.PGOrderFetchPayments(orderId);
      return response.data || [];
    } catch (error) {
      console.error(`❌ [Cashfree] Fetch payments failed for ${orderId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * PHASE 7: Creates a refund with vendor payout reversal.
   *
   * @param {Object} params
   * @param {string} params.orderId - Cashfree order ID
   * @param {string} params.refundId - Unique refund ID
   * @param {number} params.amount - Total refund amount to customer
   * @param {string} [params.vendorId] - Vendor ID whose allocation should be reversed
   * @param {number} [params.vendorRefundAmount] - 90% amount to reverse from vendor
   * @param {string} [params.refundNote] - Reason
   * @returns {Promise<Object>} Refund response from Cashfree
   */
  async createRefund({
    orderId,
    refundId,
    amount,
    vendorId,
    vendorRefundAmount,
    refundNote = "Service refund requested"
  }) {
    const refundRequest = {
      refund_id: refundId,
      refund_amount: Number(amount),
      refund_note: refundNote,
      refund_speed: "STANDARD"
    };

    // If vendor was allocated funds on this order, reverse the vendor's split
    // Cashfree rule: only one of amount or percentage in refund_splits
    if (vendorId && vendorRefundAmount && Number(vendorRefundAmount) > 0) {
      refundRequest.refund_splits = [
        {
          vendor_id: vendorId,
          amount: Number(vendorRefundAmount)
        }
      ];
    }

    try {
      console.log(`↩️ [Cashfree] Initiating refund for order: ${orderId} | Amount: ₹${amount} | Vendor Reversal: ₹${vendorRefundAmount || 0}`);
      const response = await cashfreeInstance.PGOrderCreateRefund(
        CASHFREE_API_VERSION,
        orderId,
        refundRequest
      );
      return response.data;
    } catch (error) {
      console.error(`❌ [Cashfree] Refund creation failed for ${orderId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * PHASE 4: Validates the Cashfree Webhook signature using HMAC SHA-256.
   *
   * @param {string} signature - x-webhook-signature header
   * @param {string} rawBody - Raw unparsed request body string
   * @param {string} timestamp - x-webhook-timestamp header
   * @returns {Object} Parsed webhook payload if valid
   */
  verifyWebhookSignature(signature, rawBody, timestamp) {
    if (!signature || !timestamp || !rawBody) {
      throw new Error("Missing webhook signature, timestamp, or raw body");
    }

    try {
      // Use official SDK method which calculates HMAC-SHA256(timestamp + rawBody, secret)
      const event = cashfreeInstance.PGVerifyWebhookSignature(signature, rawBody, timestamp);
      return event?.object || JSON.parse(rawBody);
    } catch (sdkError) {
      // Manual verification fallback if required
      const secret = cashfreeInstance.XClientSecret;
      const combined = timestamp + rawBody;
      const computed = crypto.createHmac("sha256", secret).update(combined).digest("base64");

      if (computed !== signature) {
        throw new Error(`Webhook signature mismatch. Expected: ${computed}, received: ${signature}`);
      }

      return JSON.parse(rawBody);
    }
  }
}

module.exports = new CashfreeMarketplaceService();
