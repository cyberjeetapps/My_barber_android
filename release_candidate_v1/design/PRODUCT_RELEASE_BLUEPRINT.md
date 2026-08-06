# MyBarber — Product Release Blueprint

## Product principle

The release should feel calm, fast, obvious, and trustworthy. Every new action must answer one question: **does this help a customer book faster or help a salon earn repeat revenue?**

## P1 user experience

### 1. Re-engage lapsed customers

**Owner CRM card**
- Existing customer identity, visits, spend, last visit, and segment remain unchanged.
- For `Lapsed` customers only, show a single secondary action: `Send comeback offer`.
- Tapping opens a bottom sheet, not a new page.
- The owner chooses one approved offer template and expiry period.
- Show a preview with customer first name, salon name, benefit, expiry, and opt-out line.
- Final button: `Send WhatsApp offer`.
- Success state: inline checkmark and `Offer sent` timestamp.
- Failure state: preserve the card, explain the reason, and allow retry.

**Guardrails**
- No free-text campaign messages in v1.
- One offer per customer per salon every 30 days.
- Daily salon send cap.
- Owner must own the shop.
- Store delivery ID, template ID, timestamp, sender UID, shop ID, and customer UID.

### 2. Favourites

**Customer surfaces**
- Heart icon on salon cards, salon details, and barber cards.
- A `Favourites` section appears near the top of Profile or Home.
- Rebooking from a favourite should require the fewest possible taps.
- Optimistic UI: heart changes immediately; rollback only on failure.

**Empty state**
`Save salons and barbers you love for faster booking next time.`

### 3. Waitlist

When a selected slot has insufficient capacity, replace the dead-end alert with:
- `Join waitlist`
- alternative nearby salons with shorter waits
- `Choose another time`

Waitlist confirmation must state service, salon, preferred window, expiry, and notification channel. A released slot is offered for a short reservation window before moving to the next customer.

### 4. Review nudge

After a completed appointment:
- schedule one local/push reminder 60–120 minutes later
- open directly into the existing review flow
- never prompt cancelled, no-show, refunded, or already-reviewed bookings
- stop after one reminder

## Design system guidance

- Preserve the current Poppins typography and existing theme tokens.
- Use one dominant primary action per screen.
- Minimum tap target: 44×44 points.
- Avoid modal stacking.
- Use bottom sheets for short decisions and full pages for complex tasks.
- All loading actions need immediate pressed state, progress, success, and recoverable error feedback.
- Customer-facing language should be simple and localizable.

## Success metrics

- Re-engagement: delivered → reopened app → booked within 7 days
- Favourites: favourite added → repeat booking conversion
- Waitlist: joined → slot offered → slot accepted
- Review nudge: completed appointments → review submitted
- Quality: crash-free sessions, callable error rate, duplicate sends, notification opt-outs

## Explicit non-goals for this release

- No open-ended AI chatbot
- No automated discounting without owner limits
- No full loyalty wallet or cash-equivalent points
- No rewrite of bookings, payments, login, navigation, or existing CRM data loading
