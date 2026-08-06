import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentCreated, onDocumentUpdated, onDocumentDeleted, FirestoreEvent} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import axios from "axios";
import twilio from "twilio";
import {defineSecret} from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Twilio credentials are managed by Firebase Secret Manager.
const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_VERIFY_SID = defineSecret("TWILIO_VERIFY_SID");

const getTwilioClient = () => {
  const accountSid = TWILIO_ACCOUNT_SID.value();
  const authToken = TWILIO_AUTH_TOKEN.value();
  if (!accountSid || !authToken) {
    throw new HttpsError("internal", "Twilio service is not configured");
  }
  return twilio(accountSid, authToken);
};

// 🔁 Enhanced batch sender with retry logic
async function sendPushBatches(messages: any[], retries = 3) {
  const batchSize = 100;
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    let attempt = 0;

    while (attempt <= retries) {
      try {
        const response = await axios.post(EXPO_PUSH_URL, batch, {
          headers: {
            "Accept": "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          timeout: 10000, // 10 second timeout
        });
        console.log(`📦 Successfully sent batch ${Math.floor(i / batchSize) + 1}`);
        break;
      } catch (error: any) {
        attempt++;
        if (attempt > retries) {
          console.error(`❌ Failed batch ${Math.floor(i / batchSize) + 1} after ${retries} attempts:`,
            error.response?.data || error.message);
        } else {
          console.warn(`⚠️ Retry ${attempt} for batch ${Math.floor(i / batchSize) + 1}`);
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
        }
      }
    }
  }
}


// 🔑 Create owner account via Firebase Admin (no authentication conflict)
export const createOwnerAccount = onCall({
  region: "us-central1",
  timeoutSeconds: 60,
  memory: "256MiB",
}, async (request) => {
  try {
    // Verify the caller is authenticated (admin)
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const {
      name,
      phoneNumber,
      email,
      bankAccountNumber,
      bankIfscCode,
      bankAccountHolderName,
      bankAccountName,
    } = request.data;

    // Validate required fields
    if (!name || !phoneNumber || !bankAccountHolderName || !bankAccountNumber || !bankIfscCode) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    // ✅ Basic IFSC validation
    if (bankIfscCode.length !== 11 || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(bankIfscCode)) {
      throw new HttpsError("invalid-argument", "Enter a valid IFSC code (e.g., SBIN0000123)");
    }

    const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`;
    const ownerEmail = `${formattedPhone}@twilio.owner`;
    const password = formattedPhone;

    console.log("Creating owner account via Admin SDK:", {
      name,
      phone: formattedPhone,
      email: ownerEmail,
    });

    // Create user using Firebase Admin SDK (this won't affect current sessions)
    const userRecord = await admin.auth().createUser({
      email: ownerEmail,
      password: password,
      displayName: name,
      phoneNumber: formattedPhone,
    });

    console.log("Firebase auth account created successfully:", userRecord.uid);

    // Prepare owner data for Firestore
    const ownerData = {
      name,
      phoneNumber: formattedPhone,
      email: email || null,
      bankAccountNumber,
      bankIfscCode,
      bankAccountHolderName,
      bankAccountName,
      role: "owner",
      hasAuthAccount: true,
      authEmail: ownerEmail,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      shops: {},
    };

    // Save to Firestore using the UID from auth
    await db.collection("barberowner").doc(userRecord.uid).set(ownerData);

    console.log("Owner document created in Firestore:", userRecord.uid);

    return {
      success: true,
      message: "Owner account created successfully",
      ownerId: userRecord.uid,
      ownerData: ownerData,
    };
  } catch (error: any) {
    console.error("Error creating owner account:", error);

    let errorMessage = "Failed to create owner account";
    let errorCode: any = "internal";

    if (error.code === "auth/email-already-exists") {
      errorMessage = "Owner with this phone number already exists";
      errorCode = "already-exists";
    } else if (error.code === "auth/invalid-phone-number") {
      errorMessage = "Invalid phone number format";
      errorCode = "invalid-argument";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Please check phone number format";
      errorCode = "invalid-argument";
    }

    throw new HttpsError(errorCode, errorMessage, {
      originalError: error.message,
      code: error.code,
    });
  }
});


export const notifyAdminNewFamilyBooking = onDocumentCreated(
  {
    document: "familybookings/{bookingId}",
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async (event) => {
    try {
      const snapshot = event.data;
      if (!snapshot) {
        console.log("❌ No family booking data found");
        return;
      }

      const booking = snapshot.data();
      const {
        userName,
        userPhone,
        serviceName,
        shopName,
        dateTime,
        servicePrice,
        totalPrice,
        familySize,
        status,
        serviceImageUrl,
        shopId,
        serviceId,
        members,
        paymentStatus,
      } = booking;

      if (!userName || !serviceName || !shopName || !dateTime || !familySize) {
        console.log("❌ Missing key family booking fields");
        return;
      }

      const tokensRef = db.collection("pushTokens");

      // Admin tokens
      const adminTokensSnapshot = await tokensRef.where("role", "==", "admin").get();

      // Owner tokens — filtered by shopId
      const ownerTokensSnapshot = await tokensRef
        .where("role", "==", "owner")
        .where("shopId", "==", shopId)
        .get();

      // Prepare member details for notification
      const memberDetails = members
        .map((m: any) => `${m.memberName}`)
        .join(", ");

      const adminMessages = adminTokensSnapshot.docs.map((doc) => ({
        to: doc.data().token,
        title: "👨‍👩‍👧‍👦 New Family Booking",
        body: `${userName} booked ${familySize} ${serviceName} at ${shopName} for ₹${totalPrice}`,
        sound: "default",
        priority: "high",
        channelId: "admin_alerts",
        vibrate: [300, 200, 300],
        data: {
          type: "NEW_FAMILY_BOOKING",
          bookingId: event.params.bookingId,
          serviceId,
          shopId,
          userName,
          userPhone,
          serviceName,
          shopName,
          dateTime,
          servicePrice,
          totalPrice,
          familySize,
          status,
          paymentStatus,
          imageUrl: serviceImageUrl || "",
          members: JSON.stringify(members),
          deepLink: "/admin/familybookings",
          _displayInForeground: true,
        },
      }));

      const ownerMessages = ownerTokensSnapshot.docs.map((doc) => ({
        to: doc.data().token,
        title: "👨‍👩‍👧‍👦 New Family Booking at Your Shop",
        body: `${userName} booked ${familySize} ${serviceName} for ₹${totalPrice}\nMembers: ${memberDetails}`,
        sound: "default",
        priority: "high",
        channelId: "owner_alerts",
        vibrate: [300, 200, 300],
        data: {
          type: "NEW_FAMILY_BOOKING",
          bookingId: event.params.bookingId,
          serviceId,
          shopId,
          userName,
          userPhone,
          serviceName,
          shopName,
          dateTime,
          servicePrice,
          totalPrice,
          familySize,
          status,
          paymentStatus,
          imageUrl: serviceImageUrl || "",
          members: JSON.stringify(members),
          deepLink: "/owner/dashboard/bookings",
          _displayInForeground: true,
        },
      }));

      const allMessages = [...adminMessages, ...ownerMessages];

      if (allMessages.length === 0) {
        console.log("❌ No tokens to notify");
        return;
      }

      await sendPushBatches(allMessages);
      console.log(`✅ Notified ${allMessages.length} users (admins + owners) about new family booking`);

      // Log the notification
      await db.collection("notificationLogs").add({
        type: "family_booking",
        bookingId: event.params.bookingId,
        recipients: allMessages.length,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("🔥 Family booking notification error:", error);

      await db.collection("notificationErrors").add({
        type: "family_booking",
        bookingId: event.params.bookingId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);

// 🔔 Notify the correct shop owner and admins when an individual appointment is created.
// This is server-side and event-driven (Uber-style): the customer does not call an owner API directly.
export const notifyOwnerNewAppointment = onDocumentCreated(
  {
    document: "appointments/{bookingId}",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const booking = snapshot.data();
    const shopId = booking.shopId;
    if (!shopId) {
      console.warn("Appointment has no shopId", event.params.bookingId);
      return;
    }

    try {
      const tokensRef = db.collection("pushTokens");
      const [ownerTokens, adminTokens] = await Promise.all([
        tokensRef.where("role", "==", "owner").where("shopId", "==", shopId).get(),
        tokensRef.where("role", "==", "admin").get(),
      ]);

      const title = "✂️ New Appointment";
      const body = `${booking.userName || "A customer"} booked ` +
        `${booking.serviceName || "a service"} at ${booking.shopName || "your shop"}`;
      const data = {
        type: "NEW_APPOINTMENT",
        bookingId: event.params.bookingId,
        shopId,
        serviceId: booking.serviceId || "",
        userId: booking.userId || "",
        userName: booking.userName || "",
        userPhone: booking.userPhone || "",
        dateTime: String(booking.dateTime || ""),
        status: booking.status || "pending",
        deepLink: "/owner/dashboard/bookings",
        _displayInForeground: true,
      };

      const makeMessage = (doc: any) => ({
        to: doc.data().token,
        title,
        body,
        sound: "default",
        priority: "high",
        channelId: doc.data().role === "owner" ? "owner_alerts" : "admin_alerts",
        data,
      });
      const messages = [...ownerTokens.docs, ...adminTokens.docs]
        .filter((doc) => Boolean(doc.data().token))
        .map(makeMessage);

      if (messages.length) await sendPushBatches(messages);
      await db.collection("notificationLogs").add({
        type: "individual_booking",
        bookingId: event.params.bookingId,
        shopId,
        recipients: messages.length,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("Individual appointment notification error", error);
      await db.collection("notificationErrors").add({
        type: "individual_booking",
        bookingId: event.params.bookingId,
        shopId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);

// 🔔 Notify the customer when the owner confirms or cancels their booking.
// Reuses the status values the owner's existing Confirm/Cancel buttons
// already write (bookings.tsx) — no new status values, no migration of
// the existing pending/confirmed/completed/cancelled model.
//
// Idempotent by design: Firestore's .create() throws if the doc already
// exists, so if this function is ever invoked twice for the same
// bookingId+status (retried delivery, a second harmless write that
// re-saves the same status, etc.) the second attempt is a no-op instead
// of sending a duplicate push.
async function notifyCustomerOfStatusChange(
  collectionName: "appointments" | "familybookings",
  bookingId: string,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined
) {
  if (!after || !before) return;
  const beforeStatus = before.status;
  const afterStatus = after.status;
  if (beforeStatus === afterStatus) return; // not a status change — nothing to notify

  const NOTIFIABLE: Record<string, { title: string; body: (a: any) => string }> = {
    confirmed: {
      title: "Booking confirmed ✓",
      body: (a) => `Your ${a.serviceName || "appointment"} at ${a.shopName || "the salon"} is confirmed.`,
    },
    cancelled: {
      title: "Booking cancelled",
      body: (a) => `Your ${a.serviceName || "appointment"} at ${a.shopName || "the salon"} was cancelled by the salon.`,
    },
  };
  const template = NOTIFIABLE[afterStatus];
  if (!template || !after.userId) return;

  // Idempotency guard — one log entry per bookingId+status, ever.
  const idempotencyKey = `${bookingId}_${afterStatus}`;
  try {
    await db.collection("notificationLogs").doc(idempotencyKey).create({
      type: "booking_status_change",
      bookingId,
      collectionName,
      status: afterStatus,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // .create() throws "already exists" if this exact notification already fired.
    console.log(`Skipping duplicate notification for ${idempotencyKey}`);
    return;
  }

  try {
    const tokenDoc = await db.collection("pushTokens").doc(after.userId).get();
    const token = tokenDoc.data()?.token;
    if (!token) return;

    await sendPushBatches([
      {
        to: token,
        title: template.title,
        body: template.body(after),
        sound: "default",
        priority: "high",
        channelId: "user_alerts",
        data: {
          type: afterStatus === "confirmed" ? "BOOKING_CONFIRMED" : "BOOKING_CANCELLED",
          bookingId,
          collectionName,
          shopId: after.shopId || "",
          deepLink: `/appointments?highlight=${bookingId}`,
          _displayInForeground: true,
        },
      },
    ]);
  } catch (error) {
    console.error(`Customer status-change notification failed for ${bookingId}:`, error);
    await db.collection("notificationErrors").add({
      type: "booking_status_change",
      bookingId,
      collectionName,
      status: afterStatus,
      error: error instanceof Error ? error.message : String(error),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

export const notifyCustomerAppointmentStatusChange = onDocumentUpdated(
  {document: "appointments/{bookingId}", timeoutSeconds: 60, memory: "256MiB"},
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    await notifyCustomerOfStatusChange("appointments", event.params.bookingId, before, after);
    if (after?.status === "cancelled" && before?.status !== "cancelled") {
      await notifyWaitlistForFreedSlot(after.shopId, after.dateTime, 1);
    }
  }
);

export const notifyCustomerFamilyBookingStatusChange = onDocumentUpdated(
  {document: "familybookings/{bookingId}", timeoutSeconds: 60, memory: "256MiB"},
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    await notifyCustomerOfStatusChange("familybookings", event.params.bookingId, before, after);
    if (after?.status === "cancelled" && before?.status !== "cancelled") {
      const freedSlots = after.familySize || (after.members || []).length || 1;
      await notifyWaitlistForFreedSlot(after.shopId, after.dateTime, freedSlots);
    }
  }
);

// 🕒 Waitlist — a cancellation (owner status-update OR customer hard-delete,
// both of which already free the `timeslots` capacity counter via
// utils/timeslotAvailability.ts on the client) notifies the earliest
// waitlisted customer whose party size fits the space that opened up.
// Only the first match is notified; everyone else stays waiting in case
// this exact shop+time fills up again.
async function notifyWaitlistForFreedSlot(
  shopId: string | undefined,
  dateTime: string | undefined,
  freedSlots: number
) {
  if (!shopId || !dateTime || freedSlots < 1) return;
  const snap = await db.collection("waitlist")
    .where("shopId", "==", shopId)
    .where("dateTime", "==", dateTime)
    .where("status", "==", "waiting")
    .orderBy("createdAt", "asc")
    .get();

  for (const waitlistDoc of snap.docs) {
    const entry = waitlistDoc.data();
    if ((entry.partySize || 1) > freedSlots) continue; // doesn't fit in the space that opened up

    const tokenDoc = await db.collection("pushTokens").doc(entry.userId).get();
    const token = tokenDoc.data()?.token;
    if (token) {
      await sendPushBatches([{
        to: token,
        title: "A spot opened up! 🎉",
        body: `${entry.serviceName || "Your requested time"} at ` +
          `${entry.shopName || "the salon"} is available again — book now before it's gone.`,
        sound: "default",
        priority: "high",
        data: {type: "WAITLIST_SLOT_OPEN", shopId, dateTime, deepLink: "/(tabs)/appointments"},
      }]);
    }
    await waitlistDoc.ref.update({status: "notified", notifiedAt: admin.firestore.FieldValue.serverTimestamp()});
    break; // first-come-first-served — only the earliest fitting entry is notified
  }
}

export const waitlistOnAppointmentDeleted = onDocumentDeleted(
  {document: "appointments/{bookingId}", timeoutSeconds: 60, memory: "256MiB"},
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    await notifyWaitlistForFreedSlot(data.shopId, data.dateTime, 1);
  }
);

export const waitlistOnFamilyBookingDeleted = onDocumentDeleted(
  {document: "familybookings/{bookingId}", timeoutSeconds: 60, memory: "256MiB"},
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const freedSlots = data.familySize || (data.members || []).length || 1;
    await notifyWaitlistForFreedSlot(data.shopId, data.dateTime, freedSlots);
  }
);

// 📊 Owner + admin milestone notification, every 50 completed bookings
// at a shop (50, 100, 150, ...). Only counts individual `appointments` —
// checked against how completion is recorded elsewhere in this file,
// that's the one collection every completed booking always lands in.
const MILESTONE_STEP = 50;
const REFERRAL_REWARD_POINTS = 20; // kept in sync with utils/referral.ts on the client

async function checkShopBookingMilestone(shopId: string, shopName: string) {
  if (!shopId) return;
  const completedSnap = await db
    .collection("appointments")
    .where("shopId", "==", shopId)
    .where("status", "==", "completed")
    .get();

  const count = completedSnap.size;
  if (count === 0 || count % MILESTONE_STEP !== 0) return;

  // Idempotency — the same milestone should only ever notify once, even
  // if this function is retried or two completions land in the same
  // moment and both observe the same count.
  const idempotencyKey = `milestone_${shopId}_${count}`;
  try {
    await db.collection("notificationLogs").doc(idempotencyKey).create({
      type: "shop_booking_milestone",
      shopId,
      count,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    return; // already notified for this exact milestone
  }

  const tokensRef = db.collection("pushTokens");
  const [ownerTokens, adminTokens] = await Promise.all([
    tokensRef.where("role", "==", "owner").where("shopId", "==", shopId).get(),
    tokensRef.where("role", "==", "admin").get(),
  ]);

  const title = `🎉 ${count} bookings completed!`;
  const body = `${shopName || "Your shop"} just crossed ${count} completed bookings.`;
  const messages = [...ownerTokens.docs, ...adminTokens.docs]
    .map((d) => d.data().token)
    .filter(Boolean)
    .map((token) => ({
      to: token,
      title,
      body,
      sound: "default",
      priority: "high",
      data: {type: "SHOP_BOOKING_MILESTONE", shopId, count, deepLink: "/owner/dashboard/analytics"},
    }));

  if (messages.length) await sendPushBatches(messages);

  // Also land in the in-app notification centre for both roles, same
  // collection the booking-confirmation flow already writes to.
  const notifBatch = db.batch();
  [...ownerTokens.docs, ...adminTokens.docs].forEach((d) => {
    const uid = d.data().uid;
    if (!uid) return;
    const ref = db.collection("notifications").doc();
    notifBatch.set(ref, {
      userId: uid,
      content: body,
      type: "shop_booking_milestone",
      metadata: {shopId, count, timestamp: new Date().toISOString()},
      read: false,
    });
  });
  await notifBatch.commit();
}

// 🎁 Referral payout + Gold tier — both keyed off a customer's first
// completed booking, so an invite only pays out once it converts into
// real, finished business rather than just a signup.
async function checkReferralAndGoldTier(userId: string) {
  if (!userId) return;
  const userRef = db.collection("users").doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return;
  const userData = userSnap.data()!;

  // Referral payout — only once, only to the referrer, only after the
  // referred customer's first completed booking. Reward points are
  // untouched by the Gold-tier change below — they still accumulate the
  // same way; only what QUALIFIES for Gold has changed (referral count,
  // not a points total).
  if (userData.referredBy && !userData.referralRewardGranted) {
    const completedSnap = await db
      .collection("appointments")
      .where("userId", "==", userId)
      .where("status", "==", "completed")
      .get();

    if (completedSnap.size === 1) {
      // This completion IS their first — pay out now, and mark granted
      // so a second completed booking never pays twice.
      const referrerRef = db.collection("users").doc(userData.referredBy);
      let referrerCrossedGold = false;
      await db.runTransaction(async (transaction) => {
        const referrerSnap = await transaction.get(referrerRef);
        if (!referrerSnap.exists) return;
        const referrerData = referrerSnap.data()!;
        const newReferralCount = (referrerData.successfulReferralCount || 0) + 1;
        const update: Record<string, any> = {
          rewardPoints: (referrerData.rewardPoints || 0) + REFERRAL_REWARD_POINTS,
          successfulReferralCount: newReferralCount,
        };

        // Gold is granted once per every GOLD_REFERRAL_STEP referrals
        // (5, 10, 15, ...) — goldCycleCount tracks how many times it's
        // already been granted, so reaching 5 again right after an
        // expiry doesn't instantly re-trigger; the next grant needs 5
        // MORE referrals past the last one that earned Gold.
        const cyclesEarned = Math.floor(newReferralCount / GOLD_REFERRAL_STEP);
        const cyclesGranted = referrerData.goldCycleCount || 0;
        if (cyclesEarned > cyclesGranted && !referrerData.goldTierGranted) {
          update.goldTierGranted = true;
          update.goldGrantedAt = admin.firestore.FieldValue.serverTimestamp();
          update.goldExpiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + GOLD_DURATION_MS);
          update.goldCycleCount = cyclesEarned;
          update.freeServiceCredits = admin.firestore.FieldValue.increment(1);
          referrerCrossedGold = true;
        }

        transaction.update(referrerRef, update);
        transaction.update(userRef, {referralRewardGranted: true});
      });

      const referrerTokenSnap = await db.collection("pushTokens").doc(userData.referredBy).get();
      const token = referrerTokenSnap.data()?.token;
      if (token) {
        await sendPushBatches([{
          to: token,
          title: "🎁 Referral reward earned",
          body: referrerCrossedGold ?
            `Someone you referred completed their first booking — you earned ${REFERRAL_REWARD_POINTS} points ` +
            "and reached Gold status! Gold is valid for 7 days." :
            `Someone you referred completed their first booking — you earned ${REFERRAL_REWARD_POINTS} reward points.`,
          sound: "default",
          priority: "high",
          data: {type: "REFERRAL_REWARD", deepLink: "/(tabs)/profile"},
        }]);
      }
    }
  }
}

// Gold reward window and qualification rule — changed from a points
// total to a referral-count milestone: every 5 successful referrals
// earns a 7-day Gold window (see checkReferralAndGoldTier above).
const GOLD_REFERRAL_STEP = 5;
const GOLD_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Scheduled sweep — Gold status and the free-service credit that came
// with it expire exactly 7 days after being granted, whether or not the
// customer ever opened the app in between. A client-side "is this
// expired" check alone wouldn't cover a customer who doesn't reopen the
// app, so this has to run independently on a schedule.
export const expireGoldRewards = onSchedule(
  {schedule: "every 24 hours", timeZone: "Asia/Kolkata"},
  async () => {
    const now = admin.firestore.Timestamp.now();
    const expiredSnap = await db
      .collection("users")
      .where("goldTierGranted", "==", true)
      .where("goldExpiresAt", "<=", now)
      .get();

    if (expiredSnap.empty) return;

    for (const docSnap of expiredSnap.docs) {
      const userRef = docSnap.ref;
      try {
        await db.runTransaction(async (transaction) => {
          const snap = await transaction.get(userRef);
          if (!snap.exists) return;
          const data = snap.data()!;
          if (!data.goldTierGranted) return; // already handled, or manually cleared

          // Only remove the single credit Gold itself granted — never
          // pull a customer's balance below zero, in case that credit
          // was already spent or an admin-granted credit is also present.
          const currentCredits = data.freeServiceCredits || 0;
          transaction.update(userRef, {
            goldTierGranted: false,
            goldExpiredAt: admin.firestore.FieldValue.serverTimestamp(),
            freeServiceCredits: Math.max(0, currentCredits - 1),
          });
        });

        const tokenSnap = await db.collection("pushTokens").doc(docSnap.id).get();
        const token = tokenSnap.data()?.token;
        if (token) {
          await sendPushBatches([{
            to: token,
            title: "Your Gold status has ended",
            body: "Your 7-day Gold reward window has expired. Refer 5 more friends to earn it again!",
            sound: "default",
            priority: "high",
            data: {type: "GOLD_EXPIRED", deepLink: "/(tabs)/profile"},
          }]);
        }
      } catch (err) {
        console.error(`Failed to expire Gold for user ${docSnap.id}:`, err);
      }
    }
  }
);

export const onAppointmentCompleted = onDocumentUpdated(
  {document: "appointments/{appointmentId}", timeoutSeconds: 60, memory: "256MiB"},
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === after.status || after.status !== "completed") return;

    try {
      await checkShopBookingMilestone(after.shopId, after.shopName);
    } catch (err) {
      console.error("Shop booking milestone check failed:", err);
    }
    try {
      await checkReferralAndGoldTier(after.userId);
    } catch (err) {
      console.error("Referral/Gold tier check failed:", err);
    }
  }
);

// 🎉 Notify users when an offer is approved
export const notifyUsersNewOffer = onDocumentCreated(
  "offers/{offerId}",
  async (event) => {
    try {
      const offer = event.data?.data();
      if (!offer) {
        console.error("No offer data found");
        return;
      }

      if (offer.status !== "approved") {
        console.log("Offer not approved - skipping notification");
        return;
      }

      const notificationData = {
        title: offer.title || "New Offer",
        discount: offer.discount || 0,
        shopName: offer.shopName || "Our Shop",
        serviceName: offer.serviceName || "Our Service",
        validUntil: offer.validUntil || "soon",
        imageUrl: offer.imageUrl || "",
      };

      const tokensSnapshot = await db.collection("pushTokens")
        .where("role", "==", "user")
        .get();

      const messages: any[] = [];
      const invalidTokens: Array<{ id: string; token: string }> = [];

      tokensSnapshot.forEach((doc) => {
        const token = doc.data().token;
        if (token && token.startsWith("ExponentPushToken")) {
          messages.push({
            to: token,
            title: `🎉 ${notificationData.shopName}: ${notificationData.title}`,
            body: `${notificationData.serviceName} - ${notificationData.discount}% off ` +
              `(Valid until ${notificationData.validUntil})`,
            sound: "default",
            priority: "high",
            data: {
              type: "ADMIN_TO_USER_OFFER",
              offerId: event.params.offerId,
              ...notificationData,
              deepLink: `/offers/${event.params.offerId}`,
              _displayInForeground: true,
            },
            android: {
              channelId: "offers_channel",
              priority: "high",
            },
            ios: {
              sound: "default",
              badge: 1,
            },
          });
        } else {
          invalidTokens.push({id: doc.id, token});
        }
      });

      if (invalidTokens.length > 0) {
        const batch = db.batch();
        invalidTokens.forEach((tokenDoc) => {
          batch.delete(db.collection("pushTokens").doc(tokenDoc.id));
        });
        await batch.commit();
      }

      if (messages.length === 0) {
        console.log("No valid users to notify");
        return;
      }

      const BATCH_SIZE = 50;

      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        let attempts = 0;
        const MAX_ATTEMPTS = 3;

        while (attempts < MAX_ATTEMPTS) {
          try {
            attempts++;
            const response = await axios.post(EXPO_PUSH_URL, batch, {
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
              },
              timeout: 15000,
            });

            if (response.data?.data?.some((receipt: any) => receipt.status === "error")) {
              const failures = response.data.data.filter((r: any) => r.status === "error").length;
              console.warn("Partial failures in batch:", failures);
            }
            break;
          } catch (error) {
            console.error(`Batch ${Math.floor(i/BATCH_SIZE)+1} failed (attempt ${attempts}):`, error.message);

            if (attempts === MAX_ATTEMPTS) {
              console.error("Max attempts reached for batch - giving up");
              await db.collection("notificationFailures").add({
                offerId: event.params.offerId,
                batchIndex: Math.floor(i/BATCH_SIZE),
                error: error.message,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
              });
            } else {
              await new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
            }
          }
        }
      }

      await db.collection("notifications").doc(event.params.offerId).set({
        status: "delivered",
        recipients: messages.length,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("CRITICAL ERROR in notifyUsersNewOffer:", error);
      await db.collection("notificationErrors").doc(event.params.offerId).set({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);

// 🛎️ Service Notification
export const notifyAdminNewService = onDocumentCreated(
  {
    document: "pending_services/{serviceId}",
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async (event: FirestoreEvent<any>) => {
    try {
      const snapshot = event.data;
      if (!snapshot) {
        console.log("❌ No service data found");
        return;
      }

      const service = snapshot.data();
      const serviceName = service?.name;
      const shopOwnerId = service?.ownerIds?.[0];
      const shopName = service?.shopNames?.[0] || "A shop";

      if (!serviceName || !shopOwnerId) {
        console.log("❌ Missing required service fields");
        return;
      }

      const tokensSnapshot = await db.collection("pushTokens")
        .where("role", "==", "admin")
        .get();

      if (tokensSnapshot.empty) {
        console.log("❌ No admin tokens available");
        return;
      }

      const messages = tokensSnapshot.docs.map((doc) => ({
        to: doc.data().token,
        title: "🛎️ New Service Submission",
        body: `${shopName} added: ${serviceName} (₹${service?.price || 0}, ${service?.duration || 0} mins)`,
        sound: "default",
        priority: "high",
        channelId: "admin_alerts",
        vibrate: [300, 200, 300],
        data: {
          type: "NEW_SERVICE",
          serviceId: event.params.serviceId,
          shopId: shopOwnerId,
          deepLink: "/admin/dashboard/services",
          description: service?.description || "No description",
          price: service?.price || 0,
          duration: service?.duration || 0,
          gender: service?.gender || "unisex",
          shopName,
          _displayInForeground: true,
        },
      }));

      await sendPushBatches(messages);
      console.log(`✅ Notified ${messages.length} admins about new service`);
    } catch (error) {
      console.error("🔥 Service notification error:", error);
    }
  }
);

// 📦 Package Notification
export const notifyAdminNewPackage = onDocumentCreated(
  {
    document: "pending_packages/{packageId}",
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async (event) => {
    try {
      const snapshot = event.data;
      if (!snapshot) {
        console.log("❌ No package data found");
        return;
      }

      const pkg = snapshot.data();
      const packageName = pkg?.name;
      const shopId = pkg?.shopIds?.[0];
      const shopName = pkg?.shopNames?.[0] || "A shop";

      const tokensSnapshot = await db.collection("pushTokens")
        .where("role", "==", "admin")
        .get();

      if (tokensSnapshot.empty) {
        console.log("❌ No admin tokens available");
        return;
      }

      const messages = tokensSnapshot.docs.map((doc) => ({
        to: doc.data().token,
        title: "📦 New Package Submission",
        body: `${shopName} added: ${packageName} (₹${pkg?.price || 0}, ${pkg?.duration || "N/A"})`,
        sound: "default",
        priority: "high",
        channelId: "admin_alerts",
        vibrate: [300, 200, 300],
        data: {
          type: "NEW_PACKAGE",
          packageId: event.params.packageId,
          shopId,
          deepLink: "/admin/dashboard/packages",
          description: pkg?.description || "No description",
          price: pkg?.price || 0,
          duration: pkg?.duration || "N/A",
          gender: pkg?.gender || "unisex",
          shopName,
          services: pkg?.services || [],
          _displayInForeground: true,
        },
      }));

      await sendPushBatches(messages);
      console.log(`✅ Notified ${messages.length} admins about new package`);
    } catch (error) {
      console.error("🔥 Package notification error:", error);
    }
  }
);

// 🎉 Offer Notification
export const notifyAdminNewOffer = onDocumentCreated(
  {
    document: "pending_offers/{offerId}",
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async (event) => {
    try {
      const snapshot = event.data;
      if (!snapshot) {
        console.log("❌ No offer data found");
        return;
      }

      const offer = snapshot.data();
      const title = offer?.title;
      const description = offer?.description || "No description";
      const discount = offer?.discount || 0;
      const validUntil = offer?.validUntil || "N/A";
      const shopName = offer?.shopNames?.[0] || "A shop";

      if (!title) {
        console.log("❌ Missing offer title");
        return;
      }

      const tokensSnapshot = await db.collection("pushTokens")
        .where("role", "==", "admin")
        .get();

      if (tokensSnapshot.empty) {
        console.log("❌ No admin tokens available");
        return;
      }

      const messages = tokensSnapshot.docs.map((doc) => ({
        to: doc.data().token,
        title: "🎉 New Offer Submitted",
        body: `${shopName}: ${title} - ${discount}% off until ${validUntil}`,
        sound: "default",
        priority: "high",
        channelId: "admin_alerts",
        vibrate: [300, 200, 300],
        data: {
          type: "NEW_OFFER",
          offerId: event.params.offerId,
          deepLink: "/admin/dashboard/offers",
          description,
          discount,
          validUntil,
          shopName,
          _displayInForeground: true,
        },
      }));

      await sendPushBatches(messages);
      console.log(`✅ Notified ${messages.length} admins about new offer`);
    } catch (error) {
      console.error("🔥 Offer notification error:", error);
    }
  }
);


// 👤 Staff Notification
export const notifyAdminNewStaff = onDocumentCreated(
  {
    document: "pending_staff/{staffId}",
    timeoutSeconds: 540,
    memory: "256MiB",
  },
  async (event) => {
    try {
      const snapshot = event.data;
      if (!snapshot) {
        console.log("❌ No staff data found");
        return;
      }

      const staff = snapshot.data();
      const name = staff?.name;
      const specialization = staff?.specialization || "General";
      const phone = staff?.phone || "N/A";
      const serviceGender = staff?.serviceGender || "unisex";
      const shopName = staff?.shopNames?.[0] || "";

      if (!name) {
        console.log("❌ Missing staff name");
        return;
      }

      const tokensSnapshot = await db.collection("pushTokens")
        .where("role", "==", "admin")
        .get();

      if (tokensSnapshot.empty) {
        console.log("❌ No admin tokens available");
        return;
      }

      const messages = tokensSnapshot.docs.map((doc) => ( {
        to: doc.data().token,
        title: "👤 New Staff Submitted",
        body: `${shopName} ${name} (${specialization})`,
        sound: "default",
        priority: "high",
        channelId: "admin_alerts",
        vibrate: [300, 200, 300],
        data: {
          type: "NEW_STAFF",
          staffId: event.params.staffId,
          deepLink: "/admin/dashboard/staff",
          name,
          phone,
          specialization,
          serviceGender,
          shopName,
          _displayInForeground: true,
        },
      }));

      await sendPushBatches(messages);
      console.log(`✅ Notified ${messages.length} admins about new staff`);
    } catch (error) {
      console.error("🔥 Staff notification error:", error);
    }
  }
);

export const translateText = onCall({
  region: "us-central1",
  timeoutSeconds: 30,
  memory: "256MiB",
  secrets: ["GOOGLE_TRANSLATE_API_KEY"],
}, async (request) => {
  const {text, targetLang} = request.data;

  if (!text || !targetLang) {
    throw new HttpsError(
      "invalid-argument",
      "Text and target language are required"
    );
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "Translation service is not configured yet");
  }

  try {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;

    const response = await axios.post(url, {
      q: text,
      target: targetLang,
      format: "text",
    }, {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    if (!response.data?.data?.translations?.[0]?.translatedText) {
      console.error("Invalid translation response structure:", response.data);
      throw new Error("Invalid API response structure");
    }

    return {
      translatedText: response.data.data.translations[0].translatedText,
      detectedSourceLanguage: response.data.data.translations[0].detectedSourceLanguage,
    };
  } catch (error: any) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      config: error.config,
      responseData: error.response?.data,
      stack: error.stack,
    };

    console.error("Full translation error details:", errorDetails);

    throw new HttpsError(
      "internal",
      "Translation service unavailable",
      {
        technicalError: error.message,
        apiError: error.response?.data?.error?.message,
      }
    );
  }
});

// ✨ AI Hairstyle Try-On
// -----------------------------------------------------------------------
// Lets a customer upload/take a selfie, pick a hairstyle from the salon's
// gallery, and get an AI-generated preview of how that style would look
// on them — a "virtual mirror" that nudges undecided customers toward
// booking a specific service.
//
// Provider: Replicate (https://replicate.com), model "cjwbw/style-your-hair"
// (a published hair-transfer model that takes a source face photo + a
// reference hairstyle photo and blends the hairstyle onto the source face).
// Any other image-to-image / hair-transfer provider (Stability AI,
// Segmind, RunPod, etc.) can be swapped in here — this function is just
// the orchestration layer + auth boundary so the API key never ships in
// the client app.
//
// SETUP REQUIRED BEFORE GOING LIVE:
//   1. Create a Replicate account and get an API token:
//      https://replicate.com/account/api-tokens
//   2. Set it as a secret, do NOT hardcode it:
//      firebase functions:secrets:set REPLICATE_API_TOKEN
//   3. Confirm the current model "version" hash for the hair-transfer
//      model you choose (versions change over time) and put it in
//      REPLICATE_MODEL_VERSION below or as a secret.
// -----------------------------------------------------------------------

const REPLICATE_API_URL = "https://api.replicate.com/v1/predictions";

export const generateHairstylePreview = onCall({
  region: "us-central1",
  timeoutSeconds: 120,
  memory: "512MiB",
}, async (request) => {
  // Every other callable in this file requires auth; this one didn't.
  // It proxies a paid external API per call, so an unauthenticated caller
  // could run up the connected Replicate bill with no rate limit at all.
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in to use the hairstyle preview.");
  }

  const {selfieImageBase64, hairstyleImageUrl, userId} = request.data || {};

  if (!selfieImageBase64 || !hairstyleImageUrl) {
    throw new HttpsError(
      "invalid-argument",
      "A selfie image and a hairstyle reference image are required."
    );
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;
  const modelVersion = process.env.REPLICATE_MODEL_VERSION;

  if (!apiToken || !modelVersion) {
    // Fail loudly rather than silently — this tells the owner/dev exactly
    // what config step was skipped, instead of a confusing generic error.
    throw new HttpsError(
      "failed-precondition",
      "AI hairstyle preview is not configured yet. Set REPLICATE_API_TOKEN " +
      "and REPLICATE_MODEL_VERSION in the Functions environment."
    );
  }

  try {
    // 1) Kick off the prediction
    const createResponse = await axios.post(
      REPLICATE_API_URL,
      {
        version: modelVersion,
        input: {
          source_image: `data:image/jpeg;base64,${selfieImageBase64}`,
          reference_style_image: hairstyleImageUrl,
        },
      },
      {
        headers: {
          "Authorization": `Token ${apiToken}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    const predictionId = createResponse.data?.id;
    let status = createResponse.data?.status;
    let outputUrl: string | null = null;

    // 2) Poll for completion (Replicate predictions run async)
    const maxAttempts = 25; // ~50s at 2s intervals, within the 120s budget
    let attempts = 0;
    while (status !== "succeeded" && status !== "failed" && status !== "canceled" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const poll = await axios.get(`${REPLICATE_API_URL}/${predictionId}`, {
        headers: {Authorization: `Token ${apiToken}`},
        timeout: 10000,
      });
      status = poll.data?.status;
      if (status === "succeeded") {
        outputUrl = Array.isArray(poll.data?.output) ? poll.data.output[0] : poll.data?.output;
      }
      attempts += 1;
    }

    if (status !== "succeeded" || !outputUrl) {
      throw new Error(`Prediction did not succeed (status: ${status})`);
    }

    // 3) Log usage for analytics / rate-limiting (fire-and-forget)
    if (userId) {
      db.collection("hairstyleTryOns")
        .add({
          userId,
          hairstyleImageUrl,
          resultImageUrl: outputUrl,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        .catch((err) => console.warn("Failed to log hairstyle try-on:", err));
    }

    return {resultImageUrl: outputUrl};
  } catch (error: any) {
    console.error("Hairstyle preview generation failed:", {
      message: error.message,
      responseData: error.response?.data,
    });
    throw new HttpsError(
      "internal",
      "AI hairstyle preview generation failed. Please try again.",
      {technicalError: error.message}
    );
  }
});

// ✨ Twilio Verification Functions
export const sendTwilioVerificationCode = onCall({
  region: "us-central1",
  timeoutSeconds: 30,
  memory: "256MiB",
  secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID],
}, async (request) => {
  try {
    const phoneNumber = request.data.phoneNumber;

    if (!phoneNumber) {
      throw new HttpsError("invalid-argument", "Phone number is required");
    }

    console.log("Attempting to send verification to:", phoneNumber);

    const verification = await getTwilioClient().verify.v2.services(TWILIO_VERIFY_SID.value())
      .verifications
      .create({
        to: phoneNumber,
        channel: "sms",
      });

    console.log("Verification sent:", verification.sid);
    return {success: true, sid: verification.sid};
  } catch (error: any) {
    console.error("Send verification error:", {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo,
      stack: error.stack,
    });

    throw new HttpsError("internal", "Failed to send verification code", {
      twilioError: error.message,
      statusCode: error.status,
      moreInfo: error.moreInfo,
    });
  }
});

export const verifyTwilioCode = onCall({
  region: "us-central1",
  timeoutSeconds: 30,
  memory: "512MiB",
  secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID],
}, async (request) => {
  try {
    const {phoneNumber, code} = request.data;

    if (!phoneNumber || !code) {
      console.error("Missing required parameters");
      throw new HttpsError("invalid-argument", "Phone number and code are required");
    }

    if (typeof code !== "string" || code.length !== 6 || !/^\d+$/.test(code)) {
      console.error("Invalid code format");
      throw new HttpsError("invalid-argument", "Code must be 6 digits");
    }

    console.log(`Verifying code for ${phoneNumber}`);

    const verificationCheck = await getTwilioClient().verify.v2.services(TWILIO_VERIFY_SID.value())
      .verificationChecks
      .create({
        to: phoneNumber,
        code: code,
      });

    console.log("Verification result:", {
      status: verificationCheck.status,
      sid: verificationCheck.sid,
      valid: verificationCheck.valid,
    });

    if (verificationCheck.status !== "approved") {
      console.warn("Verification not approved:", verificationCheck.status);
      throw new HttpsError(
        "failed-precondition",
        "Invalid verification code",
        {status: verificationCheck.status}
      );
    }

    return {
      success: true,
      status: verificationCheck.status,
      sid: verificationCheck.sid,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error("Verification error:", {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack?.split("\n")[0],
    });

    if (error.code === 20404) {
      throw new HttpsError("not-found", "Verification expired or not found");
    }

    if (error.code === 60202) {
      throw new HttpsError("resource-exhausted", "Too many attempts");
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      "Verification service error",
      {originalError: error.message}
    );
  }
});

export const sendTwilioWhatsAppNotification = onCall({
  region: "us-central1",
  timeoutSeconds: 30,
  memory: "256MiB",
  secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN],
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  // This sends an arbitrary WhatsApp message to an arbitrary number on the
  // shop's Twilio account — being merely "logged in" is not enough, or any
  // customer account could spam any phone number at the business's expense.
  // Mirrors firestore.rules' isAdmin() (existence of /admins/{uid}).
  const adminDoc = await db.collection("admins").doc(request.auth.uid).get();
  if (!adminDoc.exists) {
    throw new HttpsError("permission-denied", "Admin privileges required");
  }
  const {to, message} = request.data || {};
  if (typeof to !== "string" || typeof message !== "string" || !to.trim() || !message.trim()) {
    throw new HttpsError("invalid-argument", "Recipient and message are required");
  }
  const from = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
  const recipient = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const result = await getTwilioClient().messages.create({body: message.trim(), from, to: recipient});
  return {success: true, sid: result.sid};
});
