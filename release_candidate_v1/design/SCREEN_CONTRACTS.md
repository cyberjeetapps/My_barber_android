# Screen Contracts

## CRM comeback offer sheet

States: idle, preview, sending, sent, blocked, failed.

Required inputs: customer UID, shop ID, template ID, expiry date.

Blocked reasons: missing phone, not lapsed, send cooldown, daily cap, owner mismatch, customer opt-out.

## Favourite control

States: inactive, saving, active, failed.

The icon must remain accessible to screen readers with labels `Add to favourites` and `Remove from favourites`.

## Waitlist sheet

Required: shop ID, service ID, requested start/end window, party size, user notification preference.

States: eligible, already joined, joined, offered, accepted, expired, cancelled.

## Review nudge

Eligibility: appointment status completed, end time passed, no existing review, no previous review nudge.
