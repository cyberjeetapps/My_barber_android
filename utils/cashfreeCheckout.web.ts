import { Platform } from 'react-native';

export async function openCashfreeCheckout(
  paymentSessionId: string,
  orderId: string,
  environment: any = 'SANDBOX'
): Promise<any> {
  return new Promise((resolve, reject) => {
    // Web fallback for Cashfree
    if (typeof window !== 'undefined') {
      window.location.href = `https://mybarber.co.in/return?order_id=${encodeURIComponent(orderId)}`;
      resolve({ success: true, orderId });
    } else {
      reject(new Error('Cashfree is not supported on server side.'));
    }
  });
}
