const express = require("express");
const router = express.Router();
const { db, admin } = require("../config/firebase");
const { sendPushBatches } = require("../services/pushNotificationService");

/**
 * POST /api/notifications/send
 * Body: { to: string | string[], title: string, body: string, data?: object, channelId?: string }
 */
router.post("/send", async (req, res) => {
  try {
    const { to, title, body, data = {}, channelId = "default", sound = "default", priority = "high" } = req.body;

    if (!to || !title || !body) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters: 'to', 'title', and 'body' are required"
      });
    }

    const recipients = Array.isArray(to) ? to : [to];
    const messages = recipients.map((token) => ({
      to: token,
      title,
      body,
      sound,
      priority,
      channelId,
      data: {
        ...data,
        _displayInForeground: true
      }
    }));

    const result = await sendPushBatches(messages);

    return res.json({
      success: true,
      sentCount: result.sent,
      failedCount: result.failed
    });
  } catch (error) {
    console.error("❌ [API] Send Notification Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/notifications/broadcast
 * Body: { role: 'user' | 'owner' | 'admin', title: string, body: string, data?: object }
 */
router.post("/broadcast", async (req, res) => {
  try {
    const { role = "user", title, body, data = {} } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "'title' and 'body' are required"
      });
    }

    const tokensSnap = await db.collection("pushTokens").where("role", "==", role).get();
    const messages = tokensSnap.docs
      .filter((d) => Boolean(d.data()?.token))
      .map((d) => ({
        to: d.data().token,
        title,
        body,
        sound: "default",
        data: {
          ...data,
          _displayInForeground: true
        }
      }));

    if (messages.length === 0) {
      return res.json({
        success: true,
        message: `No active tokens found for role: ${role}`,
        sentCount: 0
      });
    }

    const result = await sendPushBatches(messages);

    return res.json({
      success: true,
      message: `Broadcasted to ${role} devices`,
      sentCount: result.sent,
      failedCount: result.failed
    });
  } catch (error) {
    console.error("❌ [API] Broadcast Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/notifications/test
 * Body: { token: string }
 */
router.post("/test", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: "Push token is required" });
    }

    const result = await sendPushBatches([{
      to: token,
      title: "🔔 Test Notification from Express Backend",
      body: "If you see this, push notifications from your Express server are working perfectly!",
      sound: "default",
      priority: "high",
      data: { test: true, timestamp: Date.now() }
    }]);

    return res.json({
      success: result.sent > 0,
      sent: result.sent,
      failed: result.failed
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/notifications/logs
 */
router.get("/logs", async (req, res) => {
  try {
    const snap = await db.collection("notificationLogs")
      .orderBy("timestamp", "desc")
      .limit(25)
      .get();

    const logs = snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));

    return res.json({ success: true, count: logs.length, logs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
