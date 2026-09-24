import Colors from '../Colors';

// Regression guard: app/(tabs)/services.tsx, app/owner/dashboard/offers.tsx,
// offlinepayments.tsx, and admin/dashboard/services.tsx & shops.tsx all
// reference these keys, but they were missing from the palette (a real bug —
// the styled elements silently rendered with no color). Keep them defined.
describe('Colors palette completeness', () => {
  const hexColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  it.each(['successLight', 'warningLight', 'borderLight'])(
    '%s is defined as a hex color',
    (key) => {
      expect(Colors).toHaveProperty(key);
      expect((Colors as Record<string, string>)[key]).toMatch(hexColor);
    }
  );
});
