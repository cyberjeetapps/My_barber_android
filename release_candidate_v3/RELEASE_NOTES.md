# MyBarber Release Candidate v3

## Implemented safely
- Server-side owner/admin push notification trigger for every new individual appointment. Existing family-booking trigger remains unchanged.
- Shopping and Academy customer tabs added as intentionally empty coming-soon surfaces.
- Login disclosure: “By logging in, you accept the Terms and Conditions of Groomzy Technologies,” with the supplied terms link. No checkbox and no authentication logic change.
- Owner Today’s Board: live same-day appointment timeline and appointment count.
- Initial accessibility labels on all newly added screens and controls.

## Existing capabilities verified
- Owner booking history already exists in `owner/dashboard/bookings.tsx`, with real-time individual and family booking history and status filters.
- Staff records and chair assignment already exist, but customer-selected staff requires a coordinated availability/data migration and is not force-enabled in this RC to avoid double-booking or corrupting working timeslot capacity.
- Owner accounts can already have multiple shops queried by `ownerId`; an explicit switcher is not added until shop-scoped state is standardized across every owner screen.

## Designed but intentionally not activated
Gift cards, tipping, barber following, no-show WhatsApp follow-up, announcement banners, support tickets, promotional notification preferences, and slow-hour heatmaps require new Firestore rules, payment settlement decisions, consent policy, or server authorization. They should be introduced behind feature flags after staging validation, not silently connected to production.

## Security boundary
No authentication flow, passwords, API keys, `.env`, Firebase configuration, Android keystore, Razorpay credential handling, or deployed secret values were edited.
