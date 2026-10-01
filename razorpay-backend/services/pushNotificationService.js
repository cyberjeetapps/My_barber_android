/**
 * Push Notification Service for MyBarber
 * Dispatches notifications using Expo Push Service (exp.host/--/api/v2/push/send)
 */

const { db, admin } = require("../config/firebase");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Validates if a token looks like a valid Expo push token
 */
function isValidExpoPushToken(token) {
  return typeof token === "string" && (
    token.startsWith("ExponentPushToken[") ||
    token.startsWith("ExpoPushToken[")
  );
}

/**
 * Sends messages in batches of 100 to Expo with retry & backoff
 */
async function sendPushBatches(messages, retries = 3) {
  if (!messages || messages.length === 0) return { sent: 0, failed: 0 };

  const validMessages = messages.filter((m) => m && isValidExpoPushToken(m.to));
  if (validMessages.length === 0) {
    console.log("ℹ️ [Push] No valid Expo push tokens found in message list");
    return { sent: 0, failed: 0 };
  }

  const batchSize = 100;
  let totalSent = 0;
  let totalFailed = 0;

  for (let i = 0; i < validMessages.length; i += batchSize) {
    const batch = validMessages.slice(i, i + batchSize);
    let attempt = 0;
    let success = false;

    while (attempt <= retries && !success) {
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(10000)
        });

        const data = await response.json();
        if (response.ok) {
          totalSent += batch.length;
          console.log(`📦 [Push] Successfully sent batch ${Math.floor(i / batchSize) + 1} (${batch.length} messages)`);
          success = true;
        } else {
          throw new Error(data?.errors?.[0]?.message || `HTTP ${response.status}`);
        }
      } catch (error) {
        attempt++;
        if (attempt > retries) {
          totalFailed += batch.length;
          console.error(`❌ [Push] Failed batch ${Math.floor(i / batchSize) + 1} after ${retries} attempts:`, error.message);
        } else {
          console.warn(`⚠️ [Push] Retry ${attempt}/${retries} for batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        }
      }
    }
  }

  return { sent: totalSent, failed: totalFailed };
}

/**
 * Helper to log notification result in Firestore
 */
async function logNotification(type, meta = {}) {
  try {
    await db.collection("notificationLogs").add({
      type,
      ...meta,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.warn("⚠️ [Push] Could not write notification log:", err.message);
  }
}

/**
 * 1. Notify Owner & Admin when an individual appointment is created
 */
async function notifyNewAppointment(bookingId, booking) {
  if (!booking || !booking.shopId) return;

  const idempotencyKey = `new_apt_${bookingId}`;
  try {
    const existing = await db.collection("notificationLogs").doc(idempotencyKey).get();
    if (existing.exists) return;
    await db.collection("notificationLogs").doc(idempotencyKey).set({
      type: "individual_booking",
      bookingId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    return;
  }

  try {
    const tokensRef = db.collection("pushTokens");
    const [ownerTokens, adminTokens] = await Promise.all([
      tokensRef.where("role", "==", "owner").where("shopId", "==", booking.shopId).get(),
      tokensRef.where("role", "==", "admin").get()
    ]);

    const title = "✂️ New Appointment";
    const body = `${booking.userName || "A customer"} booked ${booking.serviceName || "a service"} at ${booking.shopName || "your shop"}`;

    const data = {
      type: "NEW_APPOINTMENT",
      bookingId,
      shopId: booking.shopId,
      serviceId: booking.serviceId || "",
      userId: booking.userId || "",
      userName: booking.userName || "",
      userPhone: booking.userPhone || "",
      dateTime: String(booking.dateTime || ""),
      status: booking.status || "pending",
      deepLink: "/owner/dashboard/bookings",
      _displayInForeground: true
    };

    const messages = [...ownerTokens.docs, ...adminTokens.docs]
      .filter((d) => Boolean(d.data()?.token))
      .map((d) => ({
        to: d.data().token,
        title,
        body,
        sound: "default",
        priority: "high",
        channelId: d.data().role === "owner" ? "owner_alerts" : "admin_alerts",
        data
      }));

    if (messages.length > 0) {
      await sendPushBatches(messages);
      console.log(`✅ [Push] Notified ${messages.length} recipients of new appointment ${bookingId}`);
    }
  } catch (error) {
    console.error(`🔥 [Push] notifyNewAppointment error for ${bookingId}:`, error);
  }
}

/**
 * 2. Notify Owner & Admin when a family booking is created
 */
async function notifyNewFamilyBooking(bookingId, booking) {
  if (!booking || !booking.shopId) return;

  const idempotencyKey = `new_fam_${bookingId}`;
  try {
    const existing = await db.collection("notificationLogs").doc(idempotencyKey).get();
    if (existing.exists) return;
    await db.collection("notificationLogs").doc(idempotencyKey).set({
      type: "family_booking",
      bookingId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    return;
  }

  try {
    const tokensRef = db.collection("pushTokens");
    const [ownerTokens, adminTokens] = await Promise.all([
      tokensRef.where("role", "==", "owner").where("shopId", "==", booking.shopId).get(),
      tokensRef.where("role", "==", "admin").get()
    ]);

    const members = booking.members || [];
    const memberDetails = members.map((m) => m.memberName).join(", ");
    const totalPrice = booking.totalPrice || booking.servicePrice || 0;

    const adminMessages = adminTokens.docs.map((doc) => ({
      to: doc.data().token,
      title: "👨‍👩‍👧‍👦 New Family Booking",
      body: `${booking.userName || "Customer"} booked ${booking.familySize || members.length} ${booking.serviceName || "services"} at ${booking.shopName} for ₹${totalPrice}`,
      sound: "default",
      priority: "high",
      channelId: "admin_alerts",
      vibrate: [300, 200, 300],
      data: {
        type: "NEW_FAMILY_BOOKING",
        bookingId,
        shopId: booking.shopId,
        deepLink: "/admin/familybookings",
        _displayInForeground: true
      }
    }));

    const ownerMessages = ownerTokens.docs.map((doc) => ({
      to: doc.data().token,
      title: "👨‍👩‍👧‍👦 New Family Booking at Your Shop",
      body: `${booking.userName || "Customer"} booked ${booking.familySize || members.length} ${booking.serviceName} for ₹${totalPrice}${memberDetails ? `\nMembers: ${memberDetails}` : ""}`,
      sound: "default",
      priority: "high",
      channelId: "owner_alerts",
      vibrate: [300, 200, 300],
      data: {
        type: "NEW_FAMILY_BOOKING",
        bookingId,
        shopId: booking.shopId,
        deepLink: "/owner/dashboard/bookings",
        _displayInForeground: true
      }
    }));

    const allMessages = [...adminMessages, ...ownerMessages];
    if (allMessages.length > 0) {
      await sendPushBatches(allMessages);
      console.log(`✅ [Push] Notified ${allMessages.length} recipients of new family booking ${bookingId}`);
    }
  } catch (error) {
    console.error(`🔥 [Push] notifyNewFamilyBooking error for ${bookingId}:`, error);
  }
}

/**
 * 3. Notify Customer on Appointment or Family Booking status change (confirmed, completed, cancelled)
 */
async function notifyCustomerStatusChange(collectionName, bookingId, before, after) {
  if (!after || !after.status || !after.userId) return;
  if (before && before.status === after.status) return;

  const afterStatus = String(after.status).toLowerCase();
  const NOTIFIABLE = {
    confirmed: {
      title: "Appointment Confirmed! ✅",
      body: (b) => `Your booking for ${b.serviceName || "haircut"} at ${b.shopName || "the salon"} is confirmed.`
    },
    completed: {
      title: "Thank You for Visiting! ✨",
      body: (b) => `Your appointment at ${b.shopName || "the salon"} is complete. How was your experience?`
    },
    cancelled: {
      title: "Appointment Cancelled",
      body: (b) => `Your booking for ${b.serviceName || "service"} at ${b.shopName || "the salon"} has been cancelled.`
    }
  };

  const template = NOTIFIABLE[afterStatus];
  if (!template) return;

  const idempotencyKey = `${bookingId}_${afterStatus}`;
  try {
    const existing = await db.collection("notificationLogs").doc(idempotencyKey).get();
    if (existing.exists) return;
    await db.collection("notificationLogs").doc(idempotencyKey).set({
      type: "booking_status_change",
      bookingId,
      collectionName,
      status: afterStatus,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    return;
  }

  try {
    const tokenDoc = await db.collection("pushTokens").doc(after.userId).get();
    const token = tokenDoc.data()?.token;
    if (!token) return;

    await sendPushBatches([{
      to: token,
      title: template.title,
      body: template.body(after),
      sound: "default",
      priority: "high",
      channelId: "user_alerts",
      data: {
        type: `BOOKING_${afterStatus.toUpperCase()}`,
        bookingId,
        collectionName,
        shopId: after.shopId || "",
        deepLink: `/appointments?highlight=${bookingId}`,
        _displayInForeground: true
      }
    }]);

    console.log(`✅ [Push] Notified customer ${after.userId} of status ${afterStatus} on ${bookingId}`);
  } catch (error) {
    console.error(`🔥 [Push] notifyCustomerStatusChange error for ${bookingId}:`, error);
  }
}

/**
 * 4. Notify Waitlist when a spot opens up after cancellation
 */
async function notifyWaitlistForFreedSlot(shopId, dateTime, freedSlots = 1) {
  if (!shopId || !dateTime || freedSlots < 1) return;

  try {
    const snap = await db.collection("waitlist")
      .where("shopId", "==", shopId)
      .where("dateTime", "==", dateTime)
      .where("status", "==", "waiting")
      .orderBy("createdAt", "asc")
      .get();

    for (const waitlistDoc of snap.docs) {
      const entry = waitlistDoc.data();
      if ((entry.partySize || 1) > freedSlots) continue;

      const tokenDoc = await db.collection("pushTokens").doc(entry.userId).get();
      const token = tokenDoc.data()?.token;
      if (token) {
        await sendPushBatches([{
          to: token,
          title: "A spot opened up! 🎉",
          body: `${entry.serviceName || "Your requested time"} at ${entry.shopName || "the salon"} is available again — book now before it's gone.`,
          sound: "default",
          priority: "high",
          data: { type: "WAITLIST_SLOT_OPEN", shopId, dateTime, deepLink: "/(tabs)/appointments" }
        }]);
      }

      await waitlistDoc.ref.update({
        status: "notified",
        notifiedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ [Push] Notified waitlist user ${entry.userId} for shop ${shopId}`);
      break;
    }
  } catch (error) {
    console.error("🔥 [Push] notifyWaitlist error:", error);
  }
}

/**
 * 5. Notify Admin when new Service, Package, Offer, or Staff is created
 */
async function notifyAdminPendingItem(type, itemId, data) {
  const titles = {
    service: "✨ New Service Pending Review",
    package: "📦 New Package Pending Review",
    offer: "🏷️ New Offer Pending Review",
    staff: "👤 New Staff Pending Approval"
  };

  const deepLinks = {
    service: "/admin/services",
    package: "/admin/packages",
    offer: "/admin/offers",
    staff: "/admin/staff"
  };

  const title = titles[type] || "New Item Pending Review";
  const name = data.name || data.title || "An item";
  const shopName = data.shopName || "a salon";
  const body = `${name} added at ${shopName}`;

  try {
    const adminTokens = await db.collection("pushTokens").where("role", "==", "admin").get();
    const messages = adminTokens.docs
      .filter((d) => Boolean(d.data()?.token))
      .map((d) => ({
        to: d.data().token,
        title,
        body,
        sound: "default",
        priority: "high",
        channelId: "admin_alerts",
        data: {
          type: `PENDING_${type.toUpperCase()}`,
          itemId,
          deepLink: deepLinks[type] || "/admin/dashboard",
          _displayInForeground: true
        }
      }));

    if (messages.length > 0) {
      await sendPushBatches(messages);
      console.log(`✅ [Push] Notified admins about pending ${type}: ${itemId}`);
    }
  } catch (error) {
    console.error(`🔥 [Push] notifyAdminPendingItem error for ${type} ${itemId}:`, error);
  }
}

/**
 * 6. Notify All Users when a new Offer is approved or created
 */
async function notifyAllUsersNewOffer(offerId, offer) {
  try {
    const userTokensSnap = await db.collection("pushTokens").where("role", "==", "user").get();
    const title = "🔥 New Special Offer!";
    const body = `${offer.title || "Special discount"} available at ${offer.shopName || "nearby salon"}!`;

    const messages = userTokensSnap.docs
      .filter((d) => Boolean(d.data()?.token))
      .map((d) => ({
        to: d.data().token,
        title,
        body,
        sound: "default",
        channelId: "offers_alerts",
        data: {
          type: "NEW_OFFER",
          offerId,
          deepLink: "/(tabs)/offers",
          _displayInForeground: true
        }
      }));

    if (messages.length > 0) {
      await sendPushBatches(messages);
      console.log(`✅ [Push] Broadcasted offer ${offerId} to ${messages.length} users`);
    }
  } catch (error) {
    console.error(`🔥 [Push] notifyAllUsersNewOffer error for ${offerId}:`, error);
  }
}

module.exports = {
  sendPushBatches,
  notifyNewAppointment,
  notifyNewFamilyBooking,
  notifyCustomerStatusChange,
  notifyWaitlistForFreedSlot,
  notifyAdminPendingItem,
  notifyAllUsersNewOffer,
  logNotification
};
