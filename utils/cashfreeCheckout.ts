import { CFPaymentGatewayService } from 'react-native-cashfree-pg-sdk';
import { CFDropCheckoutPayment, CFEnvironment, CFSession, CFPaymentComponentBuilder, CFThemeBuilder } from 'cashfree-pg-api-contract';

export async function openCashfreeCheckout(
  paymentSessionId: string, 
  orderId: string, 
  environment: CFEnvironment = CFEnvironment.SANDBOX
): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const session = new CFSession(paymentSessionId, orderId, environment);
      const paymentComponent = new CFPaymentComponentBuilder().build();
      const theme = new CFThemeBuilder().build();
      const payment = new CFDropCheckoutPayment(session, paymentComponent, theme);
      
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
