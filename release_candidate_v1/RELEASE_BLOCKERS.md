# Release Blockers Found in the Supplied Package

## Critical

1. `credentials/android/keystore.jks` is included in the ZIP. A release signing key must not be distributed with source packages.
2. `razorpay-backend/.env` is included. Treat all values in it as exposed and rotate them.
3. The callable `sendTwilioWhatsAppNotification` permits any authenticated account to supply an arbitrary recipient and message. Do not expose it as a CRM campaign action.

## High

4. Firestore has a broad final admin-only fallback. Every new customer/owner collection needs explicit least-privilege rules before launch.
5. The CRM loads up to 500 bookings per collection and then performs one user document read per customer. At scale this will become slow and costly; P1 should launch with bounded pilots, then migrate to server-maintained customer summaries.
6. Campaign consent, opt-out, cooldown, audit, and sender-limit controls are not present in the current live implementation.

## Product quality

7. Review nudging must use appointment completion status and deep linking, not only time elapsed.
8. Waitlist must be a state machine with atomic slot claims; a simple notification list will produce double-booking races.
