/**
 * Owner Management & Cashfree Vendor Onboarding Routes
 */

const express = require("express");
const router = express.Router();
const { db, auth, admin } = require("../config/firebase");
const cashfreeMarketplaceService = require("../services/cashfreeMarketplaceService");

// Helper to mask account number for logging / safe display
function maskAccountNumber(acc) {
  if (!acc) return "N/A";
  const str = String(acc);
  return `••••${str.slice(-4)}`;
}

/**
 * Onboards an owner to Cashfree Easy Split and updates Firestore
 */
async function onboardOwnerToCashfree(ownerId, ownerData) {
  const {
    name,
    phoneNumber,
    email,
    bankAccountNumber,
    bankIfscCode,
    bankAccountHolderName
  } = ownerData;

  if (!bankAccountNumber || !bankIfscCode) {
    throw new Error("Missing bank account number or IFSC code for Cashfree onboarding");
  }

  const vendorId = cashfreeMarketplaceService.constructor.generateVendorId(ownerId);

  console.log(`🏦 Onboarding owner ${ownerId} (${name}) as Cashfree vendor: ${vendorId}`);

  const vendorResult = await cashfreeMarketplaceService.createVendor({
    vendorId,
    name: name || "Shop Owner",
    email: email || `${cashfreeMarketplaceService.constructor.cleanPhoneNumber(phoneNumber)}@mybarber.co.in`,
    phone: phoneNumber,
    bankAccountNumber,
    bankIfscCode,
    bankAccountHolderName: bankAccountHolderName || name
  });

  const updatePayload = {
    cashfreeVendorId: vendorId,
    cashfreeVendorStatus: vendorResult.status || "ACTIVE",
    cashfreeOnboardingStatus: "COMPLETED",
    cashfreeOnboardingError: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection("barberowner").doc(ownerId).update(updatePayload);

  return {
    vendorId,
    vendorStatus: vendorResult.status || "ACTIVE",
    vendorResult
  };
}

// 1️⃣ Create owner with Firebase Auth + Firestore + Cashfree Vendor Onboarding
router.post("/create-owner", async (req, res) => {
  try {
    const {
      name,
      phoneNumber,
      email,
      bankAccountNumber,
      bankIfscCode,
      bankAccountHolderName,
      bankAccountName,
      referredByOwnerCode,
      adminToken
    } = req.body;

    if (!name || !phoneNumber || !bankAccountNumber || !bankIfscCode || !bankAccountHolderName) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, phoneNumber, bankAccountNumber, bankIfscCode, bankAccountHolderName"
      });
    }

    if (adminToken) {
      try {
        await auth.verifyIdToken(adminToken);
      } catch (tokenError) {
        console.error("Token verification failed (create-owner):", tokenError);
        return res.status(401).json({
          success: false,
          message: "Invalid admin token",
          errorDetail: tokenError.message
        });
      }
    }

    const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`;
    const authEmail = `${formattedPhone}@twilio.owner`;
    const password = formattedPhone;

    let authUid;
    try {
      const userRecord = await auth.createUser({
        email: authEmail,
        password: password,
        displayName: name,
        emailVerified: false,
        disabled: false
      });
      authUid = userRecord.uid;
      console.log("✅ Firebase auth account created:", authUid);
    } catch (authError) {
      if (authError.code === "auth/email-already-exists") {
        const userRecord = await auth.getUserByEmail(authEmail);
        authUid = userRecord.uid;
        console.log("🔄 Using existing auth account:", authUid);
      } else {
        throw authError;
      }
    }

    const vendorId = cashfreeMarketplaceService.constructor.generateVendorId(authUid);

    const ownerData = {
      name,
      phoneNumber: formattedPhone,
      email: email || null,
      bankAccountNumber,
      bankIfscCode: bankIfscCode.toUpperCase(),
      bankAccountHolderName,
      bankAccountName: bankAccountName || "",
      role: "owner",
      hasAuthAccount: true,
      authEmail: authEmail,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      shops: {},
      ownerReferralCode: `OW${authUid.slice(0, 6).toUpperCase()}`,
      freeAppointmentCredits: 0,
      cashfreeVendorId: vendorId,
      cashfreeVendorStatus: "PENDING",
      cashfreeOnboardingStatus: "PENDING",
      cashfreeOnboardingError: null
    };

    await db.collection("barberowner").doc(authUid).set(ownerData);

    // Referral credits check
    let referralApplied = false;
    if (referredByOwnerCode) {
      const referrerSnap = await db.collection("barberowner")
        .where("ownerReferralCode", "==", String(referredByOwnerCode).trim().toUpperCase())
        .get();
      if (!referrerSnap.empty) {
        const referrerDoc = referrerSnap.docs[0];
        if (referrerDoc.id !== authUid) {
          await referrerDoc.ref.update({
            freeAppointmentCredits: admin.firestore.FieldValue.increment(10)
          });
          referralApplied = true;
          console.log(`✅ Referral credit applied: +10 free appointments for owner ${referrerDoc.id}`);
        }
      }
    }

    // Attempt Cashfree onboarding
    let cashfreeOnboarded = false;
    let cashfreeError = null;
    try {
      await onboardOwnerToCashfree(authUid, ownerData);
      cashfreeOnboarded = true;
      console.log(`✅ Cashfree vendor onboarded successfully for owner ${authUid}`);
    } catch (cfErr) {
      cashfreeError = cfErr.message;
      console.error(`⚠️ Cashfree onboarding deferred for owner ${authUid}:`, cfErr.message);
      await db.collection("barberowner").doc(authUid).update({
        cashfreeVendorStatus: "FAILED",
        cashfreeOnboardingStatus: "FAILED",
        cashfreeOnboardingError: cfErr.message
      });
    }

    res.json({
      success: true,
      ownerId: authUid,
      referralApplied,
      cashfreeOnboarded,
      cashfreeVendorId: vendorId,
      cashfreeError,
      message: "Owner created successfully with login access and Cashfree setup",
      credentials: {
        email: authEmail,
        password: formattedPhone,
        phone: formattedPhone
      }
    });
  } catch (error) {
    console.error("❌ Error creating owner:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create owner",
      error: error.message
    });
  }
});

// 2️⃣ Dedicated Cashfree Onboarding Endpoint for existing or new owners
router.post("/:ownerId/onboard-cashfree", async (req, res) => {
  try {
    const { ownerId } = req.params;
    const { adminToken } = req.body;

    if (adminToken) {
      try {
        await auth.verifyIdToken(adminToken);
      } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid admin token" });
      }
    }

    const ownerDoc = await db.collection("barberowner").doc(ownerId).get();
    if (!ownerDoc.exists) {
      return res.status(404).json({ success: false, message: "Owner not found" });
    }

    const ownerData = ownerDoc.data();
    if (!ownerData.bankAccountNumber || !ownerData.bankIfscCode) {
      return res.status(400).json({
        success: false,
        message: "Owner is missing bank details (Account number or IFSC Code)"
      });
    }

    const result = await onboardOwnerToCashfree(ownerId, ownerData);

    res.json({
      success: true,
      message: "Owner successfully onboarded to Cashfree Easy Split",
      vendorId: result.vendorId,
      vendorStatus: result.vendorStatus,
      maskedAccount: maskAccountNumber(ownerData.bankAccountNumber)
    });
  } catch (error) {
    console.error("❌ Cashfree onboarding route error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to onboard owner with Cashfree"
    });
  }
});

// 3️⃣ Get live Cashfree Vendor status
router.get("/:ownerId/cashfree-status", async (req, res) => {
  try {
    const { ownerId } = req.params;
    const ownerDoc = await db.collection("barberowner").doc(ownerId).get();

    if (!ownerDoc.exists) {
      return res.status(404).json({ success: false, message: "Owner not found" });
    }

    const ownerData = ownerDoc.data();
    const vendorId = ownerData.cashfreeVendorId || cashfreeMarketplaceService.constructor.generateVendorId(ownerId);

    try {
      const vendorData = await cashfreeMarketplaceService.getVendor(vendorId);
      const status = vendorData.status || "ACTIVE";

      await db.collection("barberowner").doc(ownerId).update({
        cashfreeVendorId: vendorId,
        cashfreeVendorStatus: status,
        cashfreeOnboardingStatus: "COMPLETED",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.json({
        success: true,
        vendorId,
        status,
        vendorData
      });
    } catch (cfErr) {
      return res.json({
        success: false,
        vendorId,
        status: ownerData.cashfreeVendorStatus || "NOT_ONBOARDED",
        message: cfErr.message
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4️⃣ Update owner details
router.put("/update-owner/:ownerId", async (req, res) => {
  try {
    const { ownerId } = req.params;
    const {
      name,
      phoneNumber,
      email,
      bankAccountNumber,
      bankIfscCode,
      bankAccountHolderName,
      bankAccountName,
      adminToken
    } = req.body;

    if (adminToken) {
      try {
        await auth.verifyIdToken(adminToken);
      } catch (error) {
        return res.status(401).json({ success: false, message: "Invalid admin token" });
      }
    }

    if (phoneNumber) {
      const clash = await db.collection("barberowner")
        .where("phoneNumber", "==", phoneNumber)
        .get();
      const clashesWithSomeoneElse = clash.docs.some((doc) => doc.id !== ownerId);
      if (clashesWithSomeoneElse) {
        return res.status(409).json({
          success: false,
          message: "Another owner already uses this phone number."
        });
      }
    }

    const updateData = {
      ...(name && { name }),
      ...(phoneNumber && { phoneNumber }),
      ...(email && { email }),
      ...(bankAccountNumber && { bankAccountNumber }),
      ...(bankIfscCode && { bankIfscCode: bankIfscCode.toUpperCase() }),
      ...(bankAccountHolderName && { bankAccountHolderName }),
      ...(bankAccountName && { bankAccountName }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("barberowner").doc(ownerId).update(updateData);

    // If bank details or name changed and owner already has Cashfree vendor ID, sync with Cashfree
    const existingDoc = await db.collection("barberowner").doc(ownerId).get();
    const currentOwnerData = existingDoc.data();
    if (currentOwnerData.cashfreeVendorId && (bankAccountNumber || bankIfscCode || name)) {
      try {
        const vendorUpdate = {
          ...(name && { name: name.replace(/[^a-zA-Z0-9 .\/&-]/g, "").trim() }),
          bank: {
            account_number: String(currentOwnerData.bankAccountNumber).trim(),
            account_holder: (currentOwnerData.bankAccountHolderName || currentOwnerData.name).replace(/[^a-zA-Z0-9 .\/&-]/g, "").trim(),
            ifsc: String(currentOwnerData.bankIfscCode).trim().toUpperCase()
          }
        };
        await cashfreeMarketplaceService.updateVendor(currentOwnerData.cashfreeVendorId, vendorUpdate);
        console.log(`✅ Updated Cashfree vendor ${currentOwnerData.cashfreeVendorId} bank details`);
      } catch (cfErr) {
        console.warn(`⚠️ Could not sync bank update to Cashfree vendor: ${cfErr.message}`);
      }
    }

    res.json({
      success: true,
      message: "Owner updated successfully"
    });
  } catch (error) {
    console.error("Error updating owner:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update owner",
      error: error.message
    });
  }
});

// 5️⃣ Delete owner
router.delete("/delete-owner/:ownerId", async (req, res) => {
  try {
    const { ownerId } = req.params;
    const { adminToken } = req.body;

    if (adminToken) {
      try {
        await auth.verifyIdToken(adminToken);
      } catch (error) {
        return res.status(401).json({ success: false, message: "Invalid admin token" });
      }
    }

    await db.collection("barberowner").doc(ownerId).delete();

    try {
      await auth.deleteUser(ownerId);
      console.log("Auth account deleted:", ownerId);
    } catch (authError) {
      console.log("Auth account not found or already deleted:", authError.message);
    }

    res.json({
      success: true,
      message: "Owner deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting owner:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete owner",
      error: error.message
    });
  }
});

// 6️⃣ Get all owners (returns masked bank details for security)
router.get("/", async (req, res) => {
  try {
    const ownersSnapshot = await db.collection("barberowner").get();
    const owners = ownersSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Provide masked account number in general API responses
        maskedBankAccountNumber: maskAccountNumber(data.bankAccountNumber)
      };
    });

    res.json({
      success: true,
      owners
    });
  } catch (error) {
    console.error("Error fetching owners:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch owners",
      error: error.message
    });
  }
});

// 7️⃣ Test admin SDK endpoint
router.get("/test-admin", async (req, res) => {
  try {
    const listUsersResult = await auth.listUsers(5);
    const ownersSnapshot = await db.collection("barberowner").limit(5).get();

    res.json({
      success: true,
      message: "Admin SDK is working correctly",
      usersCount: listUsersResult.users.length,
      ownersCount: ownersSnapshot.size,
      firebaseProject: "groomy-22576"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Admin SDK error",
      error: error.message
    });
  }
});

module.exports = router;
