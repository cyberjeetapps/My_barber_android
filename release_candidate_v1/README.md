# MyBarber Retention Release Candidate v1

This directory is intentionally **additive and disabled**. No existing production screen, booking flow, payment flow, authentication flow, Firestore rule, or deployed Cloud Function has been modified.

## Release scope

### P1 — launch first
1. Owner one-tap lapsed-customer re-engagement
2. Customer favourites for shops and barbers
3. Full-slot waitlist
4. Post-appointment review nudge

### P2 — validate after P1 metrics
5. Loyalty progress
6. Referral rewards
7. Booking-focused assistant

### P3 — owner operations
8. Shift scheduling
9. Slow-period offers

### P4 — polish
10. Dark mode
11. Public barber portfolios

## Safety model

All features must be enabled with remote feature flags and rolled out gradually. The existing `sendTwilioWhatsAppNotification` callable must not be used for CRM campaigns because it accepts arbitrary recipient/message input from any authenticated account. Use the restricted `sendLapsedCustomerOffer` design in this folder instead.

## Suggested rollout

- Internal staff accounts
- 5 pilot salons
- 50 salons
- 10% of eligible salons
- 50%
- 100%

At each stage, monitor send failures, opt-outs, waitlist conversion, review completion, crash-free sessions, and booking conversion.
