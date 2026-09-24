const admin = require("firebase-admin");
const path = require("path");
require("dotenv").config();

if (!admin.apps.length) {
  let credential;
  
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const credPath = path.resolve(__dirname, "..", process.env.GOOGLE_APPLICATION_CREDENTIALS);
      credential = admin.credential.cert(require(credPath));
    } catch (e) {
      console.warn("⚠️ Could not load local credentials from file, falling back to applicationDefault():", e.message);
      credential = admin.credential.applicationDefault();
    }
  } else {
    credential = admin.credential.applicationDefault();
  }

  admin.initializeApp({
    credential,
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://groomy-22576.firebaseio.com"
  });

  console.log("🔥 Firebase Admin Initialized");
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = {
  admin,
  db,
  auth
};
