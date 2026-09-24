/**
 * Firebase Auth Middleware
 * Verifies Bearer tokens in Authorization headers or body.adminToken
 */

const { auth } = require("../config/firebase");

async function verifyAuth(req, res, next) {
  try {
    let idToken = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      idToken = authHeader.split("Bearer ")[1].trim();
    } else if (req.body?.adminToken) {
      idToken = req.body.adminToken;
    } else if (req.query?.token) {
      idToken = req.query.token;
    }

    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: "Missing authentication token in Authorization header or body"
      });
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("❌ Token verification failed:", error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
      error: error.message
    });
  }
}

// Optional auth: sets req.user if token provided, but doesn't block if not provided
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1].trim();
      const decodedToken = await auth.verifyIdToken(idToken);
      req.user = decodedToken;
    }
  } catch (error) {
    console.warn("⚠️ Optional auth token verification failed:", error.message);
  }
  next();
}

module.exports = {
  verifyAuth,
  optionalAuth
};
