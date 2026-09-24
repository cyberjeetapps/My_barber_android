# Validation

- Sensitive-file SHA-256 comparison: unchanged for Razorpay `.env`, Firebase `google-services.json`, and Android keystore.
- Existing authentication functions and credential handling were not edited.
- Existing booking transaction and payment flow were not edited.
- Individual owner notification is an additive Firestore `onDocumentCreated` trigger.
- Shopping and Academy screens are read-only empty-state screens with no backend writes.
- Terms disclosure is informational and links to the supplied public terms page; it does not alter sign-in behavior.
- Today’s Board reads existing appointment data only.

## Deployment note
The new Cloud Function must be deployed from the existing Firebase Functions project before individual-booking push alerts become active. Until deployment, the current production behavior remains unchanged.
