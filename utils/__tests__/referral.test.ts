// generateReferralCode is pure (no I/O), but the module also imports the
// Firestore SDK and the live firebase config at the top level for the
// other exports in this file — mock both out so the test doesn't need
// to load the real (ESM-heavy) firebase package or touch any project.
jest.mock('firebase/firestore', () => ({}));
jest.mock('@/config/firebase', () => ({ db: {} }));

import { generateReferralCode } from '../referral';

describe('generateReferralCode', () => {
  it('prefixes with MB and uppercases the first 6 chars of the uid', () => {
    expect(generateReferralCode('abc123def456')).toBe('MBABC123');
  });

  it('is deterministic for the same uid', () => {
    const uid = 'xY9zQ7wLpN2mK';
    expect(generateReferralCode(uid)).toBe(generateReferralCode(uid));
  });

  it('produces different codes for different uids', () => {
    expect(generateReferralCode('uid-one-111')).not.toBe(generateReferralCode('uid-two-222'));
  });

  it('handles short uids without throwing', () => {
    expect(generateReferralCode('ab')).toBe('MBAB');
  });
});
