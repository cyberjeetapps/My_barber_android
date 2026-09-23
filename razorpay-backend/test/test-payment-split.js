const assert = require("assert");
const { calculateSplit, PLATFORM_PERCENTAGE, OWNER_PERCENTAGE } = require("../services/paymentCalculationService");
const cashfreeMarketplaceService = require("../services/cashfreeMarketplaceService");
const crypto = require("crypto");
const { cashfreeInstance } = require("../config/cashfree");

console.log("🧪 Running Payment Split & Verification Tests...\n");

// 1. Test Split Math
console.log("1️⃣ Testing 10%/90% Split Math:");
{
  const testCases = [
    { total: 100, expectedPlatform: 10, expectedOwner: 90 },
    { total: 499, expectedPlatform: 49.9, expectedOwner: 449.1 },
    { total: 350, expectedPlatform: 35, expectedOwner: 315 },
    { total: 125.50, expectedPlatform: 12.55, expectedOwner: 112.95 },
    { total: 99.99, expectedPlatform: 10, expectedOwner: 89.99 } // Math.round(99.99 * 0.1 * 100)/100 = 10.00
  ];

  for (const tc of testCases) {
    const res = calculateSplit(tc.total);
    assert.strictEqual(res.platformPercentage, 10);
    assert.strictEqual(res.ownerPercentage, 90);
    assert.strictEqual(res.platformAmount, tc.expectedPlatform, `Platform amount mismatch for total ${tc.total}`);
    assert.strictEqual(res.ownerAmount, tc.expectedOwner, `Owner amount mismatch for total ${tc.total}`);
    assert.strictEqual(Math.round((res.platformAmount + res.ownerAmount) * 100) / 100, tc.total, `Total sum mismatch for ${tc.total}`);
    console.log(`   ✅ Total: ₹${tc.total} -> Platform: ₹${res.platformAmount}, Owner: ₹${res.ownerAmount}`);
  }
}

// 2. Test Vendor ID generation
console.log("\n2️⃣ Testing Vendor ID generation:");
{
  const ownerId = "abc-123_XYZ@!#";
  const vendorId = cashfreeMarketplaceService.constructor.generateVendorId(ownerId);
  assert.ok(/^vendor_[a-zA-Z0-9_]+$/.test(vendorId));
  console.log(`   ✅ OwnerId '${ownerId}' -> VendorId '${vendorId}'`);
}

// 3. Test Phone cleaning
console.log("\n3️⃣ Testing Phone Number cleaning:");
{
  assert.strictEqual(cashfreeMarketplaceService.constructor.cleanPhoneNumber("+91 98765 43210"), "9876543210");
  assert.strictEqual(cashfreeMarketplaceService.constructor.cleanPhoneNumber("9876543210"), "9876543210");
  assert.strictEqual(cashfreeMarketplaceService.constructor.cleanPhoneNumber(""), "9999999999");
  console.log("   ✅ Phone sanitization conforms to Cashfree 10-digit requirements");
}

// 4. Test Webhook Signature Verification
console.log("\n4️⃣ Testing Webhook Signature HMAC SHA-256 Verification:");
{
  const secret = cashfreeInstance.XClientSecret;
  const timestamp = String(Date.now());
  const rawBody = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: { order_id: "order_test_123", order_amount: 500 },
      payment: { cf_payment_id: "cf_pay_456", payment_status: "SUCCESS" }
    }
  });

  const combined = timestamp + rawBody;
  const signature = crypto.createHmac("sha256", secret).update(combined).digest("base64");

  const verified = cashfreeMarketplaceService.verifyWebhookSignature(signature, rawBody, timestamp);
  assert.strictEqual(verified.type, "PAYMENT_SUCCESS_WEBHOOK");
  assert.strictEqual(verified.data.order.order_id, "order_test_123");
  console.log("   ✅ Valid signature verified successfully!");

  // Invalid signature must throw
  assert.throws(() => {
    cashfreeMarketplaceService.verifyWebhookSignature("invalid_signature_xyz", rawBody, timestamp);
  }, /signature/i);
  console.log("   ✅ Invalid signature correctly rejected!");
}

console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!\n");
