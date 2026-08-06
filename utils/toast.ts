import Toast from 'react-native-toast-message';

// Thin wrapper around react-native-toast-message so non-blocking feedback
// (saved, sent, copied, minor errors) reads as a toast instead of the
// native Alert.alert() dialog. Reserve Alert.alert() for things that truly
// need to block the user and demand a decision (destructive confirmations,
// "are you sure you want to cancel this booking"-type prompts).

export const toast = {
  success: (title: string, message?: string) =>
    Toast.show({ type: 'success', text1: title, text2: message, visibilityTime: 2500 }),
  error: (title: string, message?: string) =>
    Toast.show({ type: 'error', text1: title, text2: message, visibilityTime: 3000 }),
  info: (title: string, message?: string) =>
    Toast.show({ type: 'info', text1: title, text2: message, visibilityTime: 2500 }),
};
