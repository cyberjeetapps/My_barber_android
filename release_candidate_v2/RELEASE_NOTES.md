# MyBarber Google/Apple Release Candidate v2

## Added customer conveniences

1. **Add to Calendar** on upcoming appointment cards. Opens the device calendar at the appointment time and makes no backend changes.
2. **Quick Rebook** on past individual appointments. Passes the existing service and shop IDs into the normal booking screen, then requires the customer to select a new date, time, payment method and accept terms.
3. **Directions** on appointment cards and customer-facing shop cards. Uses the saved map link first, coordinates second, and address search as a safe fallback.
4. **Referral code on Share App**. Derives a stable non-sensitive referral code from the signed-in user ID and appends it to the existing app link.
5. **Shareable booking confirmation**. Mobile uses the native share sheet; web opens a clean printable receipt that can be saved as PDF.
6. **Open now badge** on customer shop cards. Calculated locally from the existing `openingHours` value; no backend migration is required.

## Safety boundaries

- No password, `.env`, signing key, Firebase configuration, payment key or backend secret was read or changed.
- No existing authentication, payment, booking transaction, notification or Firestore rule logic was replaced.
- No booking is created by Quick Rebook; the existing confirmation flow remains mandatory.
- Only five existing UI files were changed and one client-side utility was added.

## Modified files

- `app/(tabs)/appointments.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/profile.tsx`
- `app/(tabs)/services.tsx`
- `utils/simpleCustomerFeatures.ts` (new)
