const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Initialize Firebase configuration
require("./config/firebase");

// Initialize Cashfree configuration
require("./config/cashfree");

const ownerRoutes = require("./routes/ownerRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const webhookRoutes = require("./routes/webhookRoutes");

const app = express();

app.use(cors());

// Capture raw body for Cashfree HMAC signature verification while parsing JSON
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    }
  })
);

app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Primary API routes
app.use("/api/owners", ownerRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/webhooks", webhookRoutes);

// Backwards-compatible route aliases for existing clients
app.post("/create-order", (req, res, next) => {
  req.url = "/create-order";
  return paymentRoutes(req, res, next);
});

app.post("/verify-payment", (req, res, next) => {
  req.url = "/verify-status";
  return paymentRoutes(req, res, next);
});

app.post("/webhook", (req, res, next) => {
  req.url = "/cashfree";
  return webhookRoutes(req, res, next);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "MyBarber Payment Backend",
    architecture: "Cashfree Easy Split (10% Platform / 90% Owner)",
    features: ["cashfree-marketplace", "easy-split", "owner-onboarding", "idempotent-webhooks", "refunds"]
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : "Something went wrong"
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 MyBarber Payment Server running at http://localhost:${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`💳 Cashfree Marketplace / Easy Split: Enabled (10/90 split)`);
});

module.exports = app;