// Design tokens — the missing piece between "it works" and "it feels considered."
// Additive only: nothing here replaces constants/Colors.ts or existing styles.
// Import what you need per screen as you touch it; no big-bang rewrite required.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const fontSize = {
  caption: 12,
  body: 14,
  bodyLarge: 16,
  subtitle: 18,
  title: 22,
  headline: 28,
  display: 34,
};

export const fontWeight = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semiBold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
} as const;

// iOS-style layered shadows. Android needs `elevation` alongside these —
// spread both onto a style object, e.g. { ...shadow.card, elevation: 3 }.
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
};

// Breakpoints for the ~6 web-aware screens today, so the web build can
// stop being "the mobile layout, stretched." Use with useWindowDimensions().
export const breakpoint = {
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

export const maxContentWidth = 480; // caps mobile-first screens on wide web viewports
