import { CFPaymentGatewayService } from 'react-native-cashfree-pg-sdk';
import { CFDropCheckoutPayment, CFEnvironment, CFSession } from 'cashfree-pg-api-contract';

export async function openCashfreeCheckout(paymentSessionId: string, orderId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      // Assuming SANDBOX for now. Change to CFEnvironment.PRODUCTION for live.
      const session = new CFSession(paymentSessionId, orderId, CFEnvironment.SANDBOX);
      const payment = new CFDropCheckoutPayment(session);
      
      const callbacks = {
        onVerify: (orderID: string) => {
          resolve({ success: true, orderId: orderID });
        },
        onError: (error: any, orderID: string) => {
          reject(error);
        }
      };

      CFPaymentGatewayService.setCallback(callbacks);
      CFPaymentGatewayService.doPayment(payment);
    } catch (e) {
      reject(e);
    }
  });
}
