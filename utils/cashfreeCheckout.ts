import { CFPaymentGatewayService } from 'react-native-cashfree-pg-sdk';
import { CFDropCheckoutPayment, CFEnvironment, CFSession, CFPaymentComponentBuilder, CFThemeBuilder } from 'cashfree-pg-api-contract';

// Default environment when not provided by order response.
// Set to false for Sandbox test payments, true for Live Production payments.
export const CASHFREE_IS_PRODUCTION = false;

export async function openCashfreeCheckout(
  paymentSessionId: string, 
  orderId: string, 
  environmentInput?: CFEnvironment | string
): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      let environment = CASHFREE_IS_PRODUCTION ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;

      if (environmentInput) {
        if (typeof environmentInput === 'string') {
          environment = environmentInput.toUpperCase() === 'PRODUCTION'
            ? CFEnvironment.PRODUCTION 
            : CFEnvironment.SANDBOX;
        } else {
          environment = environmentInput;
        }
      }

      console.log(`💳 [Cashfree] Launching checkout for ${orderId} in environment: ${environment}`);
      const session = new CFSession(paymentSessionId, orderId, environment);
      const paymentComponent = new CFPaymentComponentBuilder().build();
      const theme = new CFThemeBuilder().build();
      const payment = new CFDropCheckoutPayment(session, paymentComponent, theme);
      
      const callbacks = {
        onVerify: (orderID: string) => {
          console.log(`✅ [Cashfree] Payment verified for: ${orderID}`);
          resolve({ success: true, orderId: orderID });
        },
        onError: (error: any, orderID: string) => {
          console.warn(`❌ [Cashfree] Payment error for ${orderID}:`, error);
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
