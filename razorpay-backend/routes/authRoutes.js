const express = require("express");
const router = express.Router();
const { getTwilioClient, verifySid } = require("../config/twilio");

// Predefined test numbers that bypass SMS verification
const TEST_NUMBERS = [
  "+911234567890",
  "+919876543210",
  "+911111111111",
  "+919999999999",
  "+910987654321"
];

// Master test verification code
const MASTER_BYPASS_CODE = "140725";

/**
 * Format phone number to E.164 (defaults to India +91 if country code missing)
 */
function formatPhoneNumber(phone) {
  if (!phone) return "";
  const cleaned = phone.replace(/[\s-]/g, "");
  return cleaned.startsWith("+") ? cleaned : `+91${cleaned}`;
}

/**
 * POST /api/auth/send-otp
 * Body: { phoneNumber: string }
 */
router.post("/send-otp", async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required"
      });
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    console.log(`📱 [Auth] Request to send OTP to: ${formattedPhone}`);

    // Check if test number
    if (TEST_NUMBERS.includes(formattedPhone)) {
      console.log(`🧪 [Auth] Test number detected (${formattedPhone}) - bypassing Twilio SMS`);
      return res.json({
        success: true,
        message: "Verification code sent (Test Mode)",
        isTest: true
      });
    }

    const client = getTwilioClient();
    const currentVerifySid = process.env.TWILIO_VERIFY_SID || verifySid;

    if (!client || !currentVerifySid) {
      console.error("❌ [Auth] Twilio is not configured. Missing credentials or TWILIO_VERIFY_SID.");
      return res.status(500).json({
        success: false,
        message: "Twilio service is not configured on server",
        hint: "Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SID in backend .env"
      });
    }

    const verification = await client.verify.v2
      .services(currentVerifySid)
      .verifications.create({
        to: formattedPhone,
        channel: "sms"
      });

    console.log(`✅ [Auth] OTP sent successfully to ${formattedPhone}, SID: ${verification.sid}`);

    return res.json({
      success: true,
      sid: verification.sid,
      message: "Verification code sent successfully"
    });
  } catch (error) {
    console.error("❌ [Auth] Send OTP Error:", {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo
    });

    let userMessage = "Unable to send verification code. Please check your phone number and try again.";
    
    // Twilio specific errors
    if (error.code === 21408) {
      userMessage = "Twilio Geo-permissions error: SMS to this country (+91) is disabled in Twilio Console.";
    } else if (error.code === 21608) {
      userMessage = "Twilio Trial account error: Phone number is not a Verified Caller ID in Twilio Console.";
    } else if (error.code === 60200 || error.code === 60203) {
      userMessage = "Max verification attempts reached. Please wait a few moments before trying again.";
    } else if (error.code === 20003) {
      userMessage = "Twilio authentication failed. Please verify Twilio Account SID & Auth Token.";
    } else if (error.code === 20404) {
      userMessage = "Twilio Verify Service SID not found. Please verify TWILIO_VERIFY_SID starts with VA.";
    }

    return res.status(error.status || 500).json({
      success: false,
      message: userMessage,
      twilioCode: error.code,
      twilioMessage: error.message,
      moreInfo: error.moreInfo
    });
  }
});

/**
 * POST /api/auth/verify-otp
 * Body: { phoneNumber: string, code: string }
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      return res.status(400).json({
        success: false,
        message: "Phone number and verification code are required"
      });
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const trimmedCode = String(code).trim();

    console.log(`🔐 [Auth] Verifying code for ${formattedPhone}`);

    // Check master bypass code or test number bypass
    if (trimmedCode === MASTER_BYPASS_CODE || (TEST_NUMBERS.includes(formattedPhone) && trimmedCode === "123456")) {
      console.log(`🧪 [Auth] Master bypass code accepted for ${formattedPhone}`);
      return res.json({
        success: true,
        status: "approved",
        isTest: true
      });
    }

    const client = getTwilioClient();
    const currentVerifySid = process.env.TWILIO_VERIFY_SID || verifySid;

    if (!client || !currentVerifySid) {
      return res.status(500).json({
        success: false,
        message: "Twilio service is not configured on server"
      });
    }

    const verificationCheck = await client.verify.v2
      .services(currentVerifySid)
      .verificationChecks.create({
        to: formattedPhone,
        code: trimmedCode
      });

    console.log(`🔍 [Auth] Verification check result: status=${verificationCheck.status}, valid=${verificationCheck.valid}`);

    if (verificationCheck.status !== "approved") {
      return res.status(400).json({
        success: false,
        status: verificationCheck.status,
        message: "Invalid or expired verification code"
      });
    }

    return res.json({
      success: true,
      status: "approved",
      sid: verificationCheck.sid
    });
  } catch (error) {
    console.error("❌ [Auth] Verify OTP Error:", {
      message: error.message,
      code: error.code,
      status: error.status
    });

    let userMessage = "Verification unsuccessful. Please check your code and try again.";
    if (error.code === 20404) {
      userMessage = "Verification expired or not found. Please request a new code.";
    } else if (error.code === 60202) {
      userMessage = "Too many failed attempts. Please request a new code.";
    }

    return res.status(error.status || 500).json({
      success: false,
      message: userMessage,
      twilioCode: error.code,
      twilioMessage: error.message
    });
  }
});

/**
 * POST /api/auth/send-whatsapp
 * Body: { to: string, message: string }
 */
router.post("/send-whatsapp", async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({
        success: false,
        message: "Recipient and message are required"
      });
    }

    const client = getTwilioClient();
    if (!client) {
      return res.status(500).json({
        success: false,
        message: "Twilio client not initialized"
      });
    }

    const from = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
    const recipient = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

    const result = await client.messages.create({
      body: message.trim(),
      from,
      to: recipient
    });

    return res.json({
      success: true,
      sid: result.sid
    });
  } catch (error) {
    console.error("❌ [Auth] WhatsApp Send Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
