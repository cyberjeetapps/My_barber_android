/**
 * Firestore Real-time Notification Watcher
 * Runs continuously inside Express server to replace Firebase Cloud Function triggers
 */

const { db } = require("../config/firebase");
const {
  notifyNewAppointment,
  notifyNewFamilyBooking,
  notifyCustomerStatusChange,
  notifyWaitlistForFreedSlot,
  notifyAdminPendingItem,
  notifyAllUsersNewOffer
} = require("./pushNotificationService");

// Track document states to accurately detect changes
const documentCache = {
  appointments: new Map(),
  familybookings: new Map()
};

let serverStartTime = Date.now();
let isInitialized = false;

/**
 * Checks if a document creation timestamp is after server boot (with 30-second leeway)
 */
function isNewDocument(docData) {
  if (!isInitialized) return false;
  const createdAt = docData.createdAt;
  if (!createdAt) return true;

  if (createdAt.toMillis) {
    return createdAt.toMillis() >= (serverStartTime - 30000);
  }
  if (createdAt instanceof Date) {
    return createdAt.getTime() >= (serverStartTime - 30000);
  }
  if (typeof createdAt === "string" || typeof createdAt === "number") {
    return new Date(createdAt).getTime() >= (serverStartTime - 30000);
  }
  return true;
}

/**
 * Watch `appointments` collection
 */
function watchAppointments() {
  console.log("👀 [Watcher] Starting real-time listener on 'appointments'...");
  db.collection("appointments").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const docId = change.doc.id;
      const data = change.doc.data();

      if (change.type === "added") {
        const previousData = documentCache.appointments.get(docId);
        documentCache.appointments.set(docId, data);

        if (!previousData && isNewDocument(data)) {
          console.log(`🔔 [Watcher] New appointment detected: ${docId}`);
          await notifyNewAppointment(docId, data);
        }
      } else if (change.type === "modified") {
        const previousData = documentCache.appointments.get(docId) || {};
        documentCache.appointments.set(docId, data);

        if (previousData.status !== data.status) {
          console.log(`🔔 [Watcher] Appointment status changed (${docId}): ${previousData.status} -> ${data.status}`);
          await notifyCustomerStatusChange("appointments", docId, previousData, data);

          if (data.status === "cancelled" && previousData.status !== "cancelled") {
            await notifyWaitlistForFreedSlot(data.shopId, data.dateTime, 1);
          }
        }
      } else if (change.type === "removed") {
        documentCache.appointments.delete(docId);
      }
    });
  }, (error) => {
    console.error("❌ [Watcher] Error in appointments listener:", error.message);
  });
}

/**
 * Watch `familybookings` collection
 */
function watchFamilyBookings() {
  console.log("👀 [Watcher] Starting real-time listener on 'familybookings'...");
  db.collection("familybookings").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const docId = change.doc.id;
      const data = change.doc.data();

      if (change.type === "added") {
        const previousData = documentCache.familybookings.get(docId);
        documentCache.familybookings.set(docId, data);

        if (!previousData && isNewDocument(data)) {
          console.log(`🔔 [Watcher] New family booking detected: ${docId}`);
          await notifyNewFamilyBooking(docId, data);
        }
      } else if (change.type === "modified") {
        const previousData = documentCache.familybookings.get(docId) || {};
        documentCache.familybookings.set(docId, data);

        if (previousData.status !== data.status) {
          console.log(`🔔 [Watcher] Family booking status changed (${docId}): ${previousData.status} -> ${data.status}`);
          await notifyCustomerStatusChange("familybookings", docId, previousData, data);

          if (data.status === "cancelled" && previousData.status !== "cancelled") {
            const freedSlots = data.familySize || (data.members || []).length || 1;
            await notifyWaitlistForFreedSlot(data.shopId, data.dateTime, freedSlots);
          }
        }
      } else if (change.type === "removed") {
        documentCache.familybookings.delete(docId);
      }
    });
  }, (error) => {
    console.error("❌ [Watcher] Error in familybookings listener:", error.message);
  });
}

/**
 * Watch pending review items for Admins (services, packages, offers, staff)
 */
function watchAdminItems(collectionName, type) {
  console.log(`👀 [Watcher] Starting real-time listener on '${collectionName}' for admin alerts...`);
  db.collection(collectionName).onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        const data = change.doc.data();
        if (isNewDocument(data)) {
          console.log(`🔔 [Watcher] New pending ${type} detected: ${change.doc.id}`);
          await notifyAdminPendingItem(type, change.doc.id, data);
        }
      }
    });
  }, (error) => {
    console.error(`❌ [Watcher] Error in ${collectionName} listener:`, error.message);
  });
}

/**
 * Initialize all Firestore watchers
 */
function initFirestoreWatchers() {
  serverStartTime = Date.now();
  console.log("🚀 [Watcher] Initializing Firestore background notification watchers...");

  watchAppointments();
  watchFamilyBookings();
  watchAdminItems("services", "service");
  watchAdminItems("packages", "package");
  watchAdminItems("offers", "offer");
  watchAdminItems("staff", "staff");

  // Allow 5 seconds for initial cache warm-up before enabling triggers for new additions
  setTimeout(() => {
    isInitialized = true;
    console.log("✅ [Watcher] Notification watchers fully armed and active!");
  }, 5000);
}

module.exports = {
  initFirestoreWatchers
};
