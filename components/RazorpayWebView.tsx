// components/RazorpayWebView.tsx
import React from 'react';
import { Modal, View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import Colors from '@/constants/Colors';

interface RazorpayWebViewProps {
  visible: boolean;
  orderData: any;
  onSuccess: (data: any) => void;
  onError: (error: any) => void;
  onClose: () => void;
}

const RazorpayWebView: React.FC<RazorpayWebViewProps> = ({
  visible,
  orderData,
  onSuccess,
  onError,
  onClose,
}) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            margin: 0;
            padding: 0;
            background: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .loading {
            text-align: center;
            font-family: Arial, sans-serif;
          }
        </style>
      </head>
      <body>
        <div class="loading">Loading payment gateway...</div>
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <script>
          var options = ${JSON.stringify(orderData)};
          
          // Set up event listeners
          options.handler = function(response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'payment_success',
              data: response
            }));
          };
          
          options.modal = {
            ondismiss: function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'modal_dismiss'
              }));
            }
          };

          var rzp = new Razorpay(options);
          
          // Open Razorpay when page loads
          window.onload = function() {
            rzp.open();
          };

          // Handle payment errors
          rzp.on('payment.failed', function(response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'payment_error',
              data: response.error
            }));
          });
        </script>
      </body>
    </html>
  `;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <WebView
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          style={styles.webview}
          onMessage={(event) => {
            try {
              const message = JSON.parse(event.nativeEvent.data);
              
              switch (message.type) {
                case 'payment_success':
                  onSuccess(message.data);
                  break;
                case 'payment_error':
                  onError(message.data);
                  break;
                case 'modal_dismiss':
                  onClose();
                  break;
                default:
                  console.log('Unknown message type:', message.type);
              }
            } catch (error) {
              console.error('Error parsing message:', error);
              onError({ description: 'Failed to process payment response' });
            }
          }}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          )}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});

export default RazorpayWebView;