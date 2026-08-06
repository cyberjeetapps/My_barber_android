import { Platform } from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';

// Unifies the three call sites in appointments.tsx (individual, family,
// package payment) behind one function that actually works on every
// platform. Before this, web always threw "Razorpay SDK not available" —
// react-native-razorpay is a native module with no web implementation,
// so online payment was fully broken on the web build. (There was also
// an unused RazorpayWebView.tsx in this project already, but it wraps
// react-native-webview, which itself has no web implementation either —
// it would only ever have helped inside a native app, not an actual
// browser, so it didn't close this gap.)
//
// On web, we're already running inside a real browser, so the fix is
// simpler than a WebView: load Razorpay's own checkout.js once and drive
// it directly, same as their standard web integration.

export type RazorpayResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: any;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection and try again.'));
    document.body.appendChild(script);
  });
  return scriptLoadPromise;
}

async function openRazorpayWeb(options: Record<string, any>): Promise<RazorpayResult> {
  await loadRazorpayScript();

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      ...options,
      handler: (response: RazorpayResult) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled')),
      },
    });
    rzp.on('payment.failed', (response: any) => {
      reject(new Error(response?.error?.description || 'Payment failed'));
    });
    rzp.open();
  });
}

export async function openRazorpayCheckout(options: Record<string, any>): Promise<RazorpayResult> {
  if (Platform.OS === 'web') {
    return openRazorpayWeb(options);
  }

  if (!RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') {
    throw new Error('Razorpay SDK not available. Please build the app.');
  }
  return RazorpayCheckout.open(options as any);
}
