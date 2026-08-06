import React from 'react';
import { View, StyleSheet, Platform, useWindowDimensions, ViewStyle } from 'react-native';
import { breakpoint, maxContentWidth } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

/**
 * Wraps mobile-first screens so the web build stops looking like a phone
 * screen stretched across a monitor. Below `breakpoint.tablet` this is a
 * no-op passthrough (native + narrow web behave exactly as before);
 * above it, content is capped at `maxContentWidth` and centered, with a
 * neutral backdrop filling the rest of the viewport.
 *
 * Usage — wrap just the outermost container of a screen:
 *   <ResponsiveScreen><View style={styles.container}>...</View></ResponsiveScreen>
 */
export default function ResponsiveScreen({ children, style }: Props) {
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width >= breakpoint.tablet;

  if (!isWideWeb) {
    return <>{children}</>;
  }

  return (
    <View style={styles.backdrop}>
      <View style={[styles.centeredContent, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#EDEFF2',
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : {}),
  },
  centeredContent: {
    flex: 1,
    width: '100%',
    maxWidth: maxContentWidth,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 40px rgba(0,0,0,0.06)', minHeight: '100vh' } as any)
      : {}),
  },
});
