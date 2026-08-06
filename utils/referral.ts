import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';

// Reward mechanics, defined in one place so the numbers are consistent
// wherever they're referenced (customer screen, admin screen, the Cloud
// Function that grants and expires them):
//   - A referral pays out to the REFERRER only once their referral
//     completes their first booking — not just on signup — to avoid
//     rewarding empty invites.
//   - Every GOLD_REFERRAL_STEP successful referrals unlocks Gold status
//     and one free-service credit, for GOLD_DURATION_DAYS days. Gold is
//     based on referral count, not a points total — a customer's points
//     keep accumulating the same way regardless of Gold status.
//   - Gold and its credit expire automatically after GOLD_DURATION_DAYS,
//     whether or not the app is reopened (functions/src/index.ts runs a
//     daily sweep) — reaching the next multiple of GOLD_REFERRAL_STEP
//     after that earns it again.
export const REFERRAL_REWARD_POINTS = 20;
export const GOLD_REFERRAL_STEP = 5;
export const GOLD_DURATION_DAYS = 7;

export function generateReferralCode(uid: string) {
  return `MB${uid.slice(0, 6).toUpperCase()}`;
}

export async function getMyReferralCode(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid));
  const existing = snap.data()?.referralCode;
  if (existing) return existing;
  const code = generateReferralCode(uid);
  await updateDoc(doc(db, 'users', uid), { referralCode: code });
  return code;
}

// One-time redemption — a customer enters someone else's code. Doesn't
// pay out immediately; the reward is granted server-side once this
// customer completes their first booking (see functions/src/index.ts),
// so inviting someone who never books doesn't earn anything.
export async function redeemReferralCode(uid: string, code: string) {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) throw new Error('Enter a referral code.');

  const myDoc = await getDoc(doc(db, 'users', uid));
  const myData = myDoc.data();
  if (myData?.referredBy) throw new Error('A referral code has already been applied to your account.');
  if (myData?.referralCode === trimmed) throw new Error("You can't use your own referral code.");

  const referrerSnap = await getDocs(query(collection(db, 'users'), where('referralCode', '==', trimmed)));
  if (referrerSnap.empty) throw new Error('That referral code was not found.');

  const referrerId = referrerSnap.docs[0].id;
  if (referrerId === uid) throw new Error("You can't use your own referral code.");

  await updateDoc(doc(db, 'users', uid), {
    referredBy: referrerId,
    referredByCode: trimmed,
    referralRewardGranted: false,
  });
  return true;
}
