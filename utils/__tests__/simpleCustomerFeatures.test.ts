import { buildReferralCode, isShopOpenNow } from '../simpleCustomerFeatures';

const at = (hour: number, minute = 0) => {
  const d = new Date(2026, 0, 1, hour, minute, 0);
  return d;
};

describe('buildReferralCode', () => {
  it('returns empty string when no uid is given', () => {
    expect(buildReferralCode(undefined)).toBe('');
    expect(buildReferralCode('')).toBe('');
  });

  it('strips non-alphanumeric characters and uppercases', () => {
    expect(buildReferralCode('abc-123_def')).toBe('MBABC123DE');
  });

  it('truncates to 8 characters after the MB prefix', () => {
    expect(buildReferralCode('abcdefghijklmnop')).toBe('MBABCDEFGH');
  });
});

describe('isShopOpenNow', () => {
  it('is closed when no opening hours are provided', () => {
    expect(isShopOpenNow(undefined, at(14))).toBe(false);
    expect(isShopOpenNow('', at(14))).toBe(false);
  });

  it('treats "24 hours" / "24/7" as always open', () => {
    expect(isShopOpenNow('Open 24 hours', at(3))).toBe(true);
    expect(isShopOpenNow('24/7', at(3))).toBe(true);
  });

  it('treats any string containing "closed" as closed', () => {
    expect(isShopOpenNow('Closed today', at(14))).toBe(false);
  });

  it('returns false when it cannot parse two times', () => {
    expect(isShopOpenNow('Open sometime', at(14))).toBe(false);
    expect(isShopOpenNow('9:00 am', at(14))).toBe(false);
  });

  it('is open during a normal same-day window', () => {
    expect(isShopOpenNow('9:00 am - 9:00 pm', at(14, 0))).toBe(true);
  });

  it('is closed outside a normal same-day window', () => {
    expect(isShopOpenNow('9:00 am - 9:00 pm', at(23, 0))).toBe(false);
    expect(isShopOpenNow('9:00 am - 9:00 pm', at(6, 0))).toBe(false);
  });

  it('is inclusive of the open and close boundary minutes', () => {
    expect(isShopOpenNow('9:00 am - 9:00 pm', at(9, 0))).toBe(true);
    expect(isShopOpenNow('9:00 am - 9:00 pm', at(21, 0))).toBe(true);
  });

  it('handles an overnight window that wraps past midnight', () => {
    expect(isShopOpenNow('6:00 pm - 2:00 am', at(23, 0))).toBe(true);
    expect(isShopOpenNow('6:00 pm - 2:00 am', at(1, 0))).toBe(true);
    expect(isShopOpenNow('6:00 pm - 2:00 am', at(10, 0))).toBe(false);
  });

  it('normalizes 12am/12pm correctly', () => {
    // 12:00 pm - 6:00 pm should NOT already be open at 12:00 am (midnight)
    expect(isShopOpenNow('12:00 pm - 6:00 pm', at(0, 0))).toBe(false);
    expect(isShopOpenNow('12:00 pm - 6:00 pm', at(12, 0))).toBe(true);
  });
});
