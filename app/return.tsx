import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react-native';
import Colors from '@/constants/Colors';

const BACKEND_URL = 'https://backend.vps.mybarber.co.in';

export default function PaymentReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ order_id?: string }>();
  const orderId = params.order_id || '';
  
  const [isVerifying, setIsVerifying] = useState(true);
  const [isSuccess, setIsSuccess] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [countdown, setCountdown] = useState(3);

  // 1️⃣ Verify payment status directly with backend
  useEffect(() => {
    let isMounted = true;

    async function checkPayment() {
      if (!orderId) {
        if (isMounted) {
          setIsVerifying(false);
          setIsSuccess(false);
          setStatusMessage('No order identifier was found.');
        }
        return;
      }

      try {
        const response = await fetch(`${BACKEND_URL}/verify-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId })
        });

        const result = await response.json();
        console.log('Return screen payment verification:', result);

        if (!isMounted) return;

        if (result && result.success && result.paymentStatus === 'SUCCESS') {
          setIsSuccess(true);
          setStatusMessage('Your payment has been processed successfully.');
        } else {
          setIsSuccess(false);
          const errorMsg = result?.message || 'Payment was unsuccessful or cancelled.';
          setStatusMessage(errorMsg);
        }
      } catch (err: any) {
        console.error('Error verifying payment on return screen:', err);
        if (isMounted) {
          setIsSuccess(false);
          setStatusMessage('Unable to verify payment status with the gateway.');
        }
      } finally {
        if (isMounted) {
          setIsVerifying(false);
        }
      }
    }

    checkPayment();

    return () => {
      isMounted = false;
    };
  }, [orderId]);

  // 2️⃣ Handle web deep linking for success
  useEffect(() => {
    if (isSuccess && Platform.OS === 'web' && typeof window !== 'undefined') {
      const appUrl = `mybarberapp://payment?order_id=${encodeURIComponent(orderId)}`;
      const timer = setTimeout(() => {
        try {
          window.location.href = appUrl;
        } catch (e) {
          console.log('Could not open deep link:', e);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, orderId]);

  // 3️⃣ Countdown for successful payments
  useEffect(() => {
    if (isSuccess) {
      if (countdown <= 0) {
        handleGoToAppointments();
        return;
      }
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, countdown]);

  const handleGoToAppointments = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const appUrl = `mybarberapp://payment?order_id=${encodeURIComponent(orderId)}`;
      window.location.href = appUrl;
    } else {
      router.replace('/(tabs)/appointments');
    }
  };

  const handleBackToBooking = () => {
    // Return smoothly to services without ever kicking to login
    router.replace('/(tabs)/services');
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {isVerifying ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Verifying payment status...</Text>
          </View>
        ) : isSuccess ? (
          <>
            <View style={styles.successIconContainer}>
              <CheckCircle2 size={64} color="#10B981" />
            </View>

            <Text style={styles.title}>Payment Successful</Text>
            <Text style={styles.subtitle}>{statusMessage}</Text>

            {orderId ? (
              <View style={styles.orderIdBadge}>
                <Text style={styles.orderIdLabel}>Order ID</Text>
                <Text style={styles.orderIdValue} numberOfLines={1}>{orderId}</Text>
              </View>
            ) : null}

            <View style={styles.redirectingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.redirectingText}>
                Viewing appointments in {countdown}s...
              </Text>
            </View>

            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={handleGoToAppointments}
              activeOpacity={0.8}
            >
              <Text style={styles.actionButtonText}>View Appointments</Text>
              <ArrowRight size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.failureIconContainer}>
              <AlertCircle size={64} color="#EF4444" />
            </View>

            <Text style={styles.title}>Payment Unsuccessful</Text>
            <Text style={styles.subtitle}>
              We were unable to process your payment. If any amount was deducted, it will be refunded to your original payment method. Your appointment has not been booked.
            </Text>

            {orderId ? (
              <View style={styles.orderIdBadge}>
                <Text style={styles.orderIdLabel}>Order ID</Text>
                <Text style={styles.orderIdValue} numberOfLines={1}>{orderId}</Text>
              </View>
            ) : null}

            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={handleBackToBooking}
              activeOpacity={0.8}
            >
              <ArrowLeft size={18} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Back to Booking</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.secondaryButton} 
              onPress={handleGoToAppointments}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Go to Appointments</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontFamily: 'Poppins-Medium',
    color: '#64748B',
  },
  successIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  failureIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Poppins-Bold',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  orderIdBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 24,
    width: '100%',
    alignItems: 'center',
  },
  orderIdLabel: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderIdValue: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#334155',
    marginTop: 2,
  },
  redirectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  redirectingText: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
  },
});
