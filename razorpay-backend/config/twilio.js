const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifySid = process.env.TWILIO_VERIFY_SID;

let twilioClient = null;

if (accountSid && authToken) {
  try {
    twilioClient = twilio(accountSid, authToken);
    console.log("✅ Twilio client initialized successfully");
  } catch (err) {
    console.error("❌ Failed to initialize Twilio client:", err.message);
  }
} else {
  console.warn("⚠️ Twilio credentials missing in environment (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)");
}

module.exports = {
  getTwilioClient: () => twilioClient,
  verifySid,
  isConfigured: () => Boolean(twilioClient && verifySid)
};
