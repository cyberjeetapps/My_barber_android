const { Cashfree, CFEnvironment } = require("cashfree-pg");
require("dotenv").config();

const cashfreeInstance = new Cashfree();

// Support standard Cashfree environment variables as well as legacy fallbacks
const clientId = process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_APP_ID || "TEST430329ae80e0f32e41a393d78b923034";
const clientSecret = process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY || "TESTaf195616268bd6202eeb3bf8dc458956e7192a85";
const environment = (process.env.CASHFREE_ENVIRONMENT || "").toUpperCase();

const isProductionKeys = clientId && !clientId.startsWith("TEST");
const isProduction = environment === "PRODUCTION" || (process.env.NODE_ENV === "production" && isProductionKeys);

cashfreeInstance.XClientId = clientId;
cashfreeInstance.XClientSecret = clientSecret;
cashfreeInstance.XEnvironment = isProduction ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;

// Cashfree API version for Easy Split / PG operations
const CASHFREE_API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";
cashfreeInstance.XApiVersion = CASHFREE_API_VERSION;

console.log(`💳 Cashfree SDK Initialized: Environment = ${isProduction ? "PRODUCTION" : "SANDBOX"}, API Version = ${cashfreeInstance.XApiVersion}`);

module.exports = {
  cashfreeInstance,
  Cashfree,
  CASHFREE_API_VERSION,
  isProduction
};
