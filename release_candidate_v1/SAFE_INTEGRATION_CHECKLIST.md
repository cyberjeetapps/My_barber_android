# Safe Integration Checklist

## Before coding
- Create a source-control tag from the current package.
- Rotate/remove packaged secrets and signing credentials.
- Add emulator tests for every new collection and callable.
- Define remote feature flags with all defaults off.

## P1 integration order
1. Add server-authorized re-engagement callable.
2. Add campaign audit collection and indexes.
3. Add CRM UI action behind flag.
4. Add favourites repository and UI behind flag.
5. Add waitlist collection, state machine, and expiry job.
6. Add review-nudge eligibility helper and deep link.

## Mandatory tests
- Owner cannot message another salon’s customers.
- Customer cannot invoke campaign send as an owner.
- Duplicate campaign is blocked during cooldown.
- Opted-out customer never receives marketing.
- Waitlist cannot create duplicate active entries.
- Slot offer expires atomically.
- Review nudge never fires for cancelled/no-show/already-reviewed bookings.
- Existing booking, payment, login, notification, and admin flows remain unchanged.

## Release gates
- TypeScript build passes.
- Firebase emulator rules tests pass.
- Android and iOS smoke tests pass.
- Web export passes.
- No secrets, private keys, `.env`, or release keystores remain inside the distributable ZIP.
