import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ArrowRight } from 'lucide-react-native';
import Colors from '@/constants/Colors';

export default function PaymentReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ order_id?: string }>();
  const orderId = params.order_id || '';
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // If in mobile browser / web, attempt to open the app via deep link
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
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
  }, [orderId]);

  useEffect(() => {
    if (countdown <= 0) {
      handleContinue();
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleContinue = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const appUrl = `mybarberapp://payment?order_id=${encodeURIComponent(orderId)}`;
      window.location.href = appUrl;
    } else {
      router.replace('/(tabs)/appointments');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <CheckCircle2 size={64} color="#10B981" />
        </View>

        <Text style={styles.title}>Payment Received</Text>
        <Text style={styles.subtitle}>
          Your payment has been processed successfully.
        </Text>

        {orderId ? (
          <View style={styles.orderIdBadge}>
            <Text style={styles.orderIdLabel}>Order ID</Text>
            <Text style={styles.orderIdValue} numberOfLines={1}>{orderId}</Text>
          </View>
        ) : null}

        <View style={styles.redirectingRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.redirectingText}>
            Returning to MyBarber in {countdown}s...
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>Return to App</Text>
          <ArrowRight size={18} color="#FFFFFF" />
        </TouchableOpacity>
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
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ECFDF5',
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
});
