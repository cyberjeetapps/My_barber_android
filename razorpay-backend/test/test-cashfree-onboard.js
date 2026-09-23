const cashfreeMarketplaceService = require("../services/cashfreeMarketplaceService");

async function testOnboarding() {
  console.log("🧪 Testing Cashfree Sandbox Vendor Creation with 'Miscellaneous' business_type...");

  const testVendorId = `test_barber_${Date.now()}`;
  try {
    const result = await cashfreeMarketplaceService.createVendor({
      vendorId: testVendorId,
      name: "Super Cuts Salon",
      email: "salon@example.com",
      phone: "9876543210",
      bankAccountNumber: "000123456789",
      bankIfscCode: "HDFC0000001",
      bankAccountHolderName: "Super Cuts Salon"
    });

    console.log("✅ Cashfree Sandbox Vendor Created Successfully!");
    console.log("Vendor ID:", result.vendor_id);
    console.log("Status:", result.status);
  } catch (error) {
    console.error("❌ Cashfree API Error:", error.response?.data || error.message);
  }
}

testOnboarding();
