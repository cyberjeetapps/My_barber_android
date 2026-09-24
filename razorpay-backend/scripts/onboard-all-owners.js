/**
 * Migration Script: Onboard All Existing Barber Owners to Cashfree Easy Split
 *
 * Reads all documents in 'barberowner' collection.
 * For any owner who has bank details but does not have an active cashfreeVendorId:
 * - Calls Cashfree Easy Split to register them as a vendor
 * - Saves cashfreeVendorId and cashfreeVendorStatus to Firestore
 *
 * Run via: node scripts/onboard-all-owners.js
 */

const { db, admin } = require("../config/firebase");
const cashfreeMarketplaceService = require("../services/cashfreeMarketplaceService");

async function onboardAllExistingOwners() {
  console.log("🔍 Fetching existing barber owners from Firestore...");

  try {
    const snapshot = await db.collection("barberowner").get();
    console.log(`📋 Total owners found: ${snapshot.size}`);

    let onboardedCount = 0;
    let alreadyActiveCount = 0;
    let skippedMissingBankCount = 0;
    let failedCount = 0;

    for (const doc of snapshot.docs) {
      const ownerId = doc.id;
      const ownerData = doc.data();
      const ownerName = ownerData.name || "Unknown";

      console.log(`\n-----------------------------------------`);
      console.log(`👤 Processing Owner: ${ownerName} (ID: ${ownerId})`);

      // 1. Check if already active on Cashfree
      if (ownerData.cashfreeVendorStatus === "ACTIVE" && ownerData.cashfreeVendorId) {
        console.log(`   ✅ Already onboarded with vendor ID: ${ownerData.cashfreeVendorId}`);
        alreadyActiveCount++;
        continue;
      }

      // 2. Check for bank details
      if (!ownerData.bankAccountNumber || !ownerData.bankIfscCode) {
        console.log(`   ⚠️ Skipped: Missing bank account number or IFSC code`);
        skippedMissingBankCount++;
        continue;
      }

      // 3. Register with Cashfree Easy Split
      const vendorId = cashfreeMarketplaceService.constructor.generateVendorId(ownerId);
      console.log(`   🏦 Registering with Cashfree as vendor: ${vendorId}...`);

      try {
        const vendorResult = await cashfreeMarketplaceService.createVendor({
          vendorId,
          name: ownerName,
          email: ownerData.email || `${cashfreeMarketplaceService.constructor.cleanPhoneNumber(ownerData.phoneNumber)}@mybarber.co.in`,
          phone: ownerData.phoneNumber,
          bankAccountNumber: ownerData.bankAccountNumber,
          bankIfscCode: ownerData.bankIfscCode,
          bankAccountHolderName: ownerData.bankAccountHolderName || ownerName
        });

        await doc.ref.update({
          cashfreeVendorId: vendorId,
          cashfreeVendorStatus: vendorResult.status || "ACTIVE",
          cashfreeOnboardingStatus: "COMPLETED",
          cashfreeOnboardingError: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`   🎉 Successfully onboarded! Vendor Status: ${vendorResult.status || "ACTIVE"}`);
        onboardedCount++;
      } catch (err) {
        console.error(`   ❌ Failed to onboard ${ownerName}:`, err.message);
        await doc.ref.update({
          cashfreeVendorStatus: "FAILED",
          cashfreeOnboardingStatus: "FAILED",
          cashfreeOnboardingError: err.message,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        failedCount++;
      }
    }

    console.log(`\n=========================================`);
    console.log(`🏁 ONBOARDING MIGRATION COMPLETE:`);
    console.log(`   - Newly Onboarded: ${onboardedCount}`);
    console.log(`   - Already Active:  ${alreadyActiveCount}`);
    console.log(`   - Missing Bank:    ${skippedMissingBankCount}`);
    console.log(`   - Failed:          ${failedCount}`);
    console.log(`=========================================\n`);
    process.exit(0);
  } catch (error) {
    console.error("Fatal error during batch onboarding:", error);
    process.exit(1);
  }
}

onboardAllExistingOwners();
