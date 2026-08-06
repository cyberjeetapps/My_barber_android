import { doc, runTransaction } from 'firebase/firestore';
import { db } from '@/config/firebase';

// The atomic booking transaction (services.tsx) writes a chair into
// `timeslots/{shopId}_{isoDateTime}.occupiedChairs` when a booking is
// created. Nothing was releasing it back — cancelling a booking left
// that chair permanently "phantom occupied" in the aggregate doc, even
// though the booking itself was gone. The customer-facing chair grid
// queries live appointment status (so it correctly showed the chair as
// free again), but the booking transaction checks this aggregate doc —
// so a customer could see an available chair, select it, and have the
// booking rejected as "already taken" for a chair nobody actually held.
//
// This closes that gap: call it whenever a booking that held a specific
// chair is cancelled, or moved to a different time slot.
export async function releaseTimeslotChair(params: {
  shopId: string;
  dateTimeISO: string;
  chairNumbers: number[]; // one for an individual booking, several for a family booking
  slotsToRelease: number;
}) {
  const { shopId, dateTimeISO, chairNumbers, slotsToRelease } = params;
  if (!shopId || !dateTimeISO) return;

  const timeslotRef = doc(db, 'timeslots', `${shopId}_${dateTimeISO}`);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(timeslotRef);
      if (!snap.exists()) return; // nothing to release — booking predates this tracking, or already cleaned up

      const data = snap.data();
      const currentOccupied: number[] = data.occupiedChairs || [];
      const nextOccupied = currentOccupied.filter((c) => !chairNumbers.includes(c));
      const nextAvailable = Math.min(
        (data.totalSlots || nextOccupied.length + slotsToRelease),
        (data.availableSlots || 0) + slotsToRelease
      );

      transaction.set(
        timeslotRef,
        { occupiedChairs: nextOccupied, availableSlots: nextAvailable, lastUpdated: new Date().toISOString() },
        { merge: true }
      );
    });
  } catch (err) {
    // Non-fatal: worst case a chair stays marked occupied one slot longer
    // than it should, which just means a future customer sees one fewer
    // "available" chair than is truly free — annoying, not unsafe. Never
    // let this block the cancellation/reschedule itself from completing.
    console.warn('Failed to release timeslot chair (non-fatal):', err);
  }
}
