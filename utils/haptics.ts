import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Thin wrapper so haptics are a one-line call everywhere, silently
// no-op on web (Haptics isn't supported there), and centralised so the
// "feel" of the app can be tuned in one place.

const isSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  /** Light tap — regular button presses, toggles, tab switches. */
  tap: () => {
    if (isSupported) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  /** Slightly firmer tap — primary CTAs (send code, confirm booking, pay). */
  press: () => {
    if (isSupported) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  /** Success — OTP verified, booking confirmed, payment complete. */
  success: () => {
    if (isSupported) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  /** Error — OTP rejected, payment failed, form validation error. */
  error: () => {
    if (isSupported) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
  /** Warning — destructive confirmations (cancel booking, delete). */
  warning: () => {
    if (isSupported) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
};
