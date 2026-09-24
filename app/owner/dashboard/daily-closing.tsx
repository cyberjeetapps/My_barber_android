import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, IndianRupee, CheckCircle2, XCircle, Wallet, CreditCard } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';

export default function DailyClosing() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    completed: 0,
    cancelled: 0,
    noShow: 0,
    pending: 0,
    cashRevenue: 0,
    onlineRevenue: 0,
    pendingPayments: 0,
  });

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const shopsSnap = await getDocs(query(collection(db, 'shops'), where('ownerId', '==', user.uid)));
      const shopIds = shopsSnap.docs.map((d) => d.id);
      if (!shopIds.length) return;

      const chunks: string[][] = [];
      for (let i = 0; i < shopIds.length; i += 30) chunks.push(shopIds.slice(i, i + 30));

      const todayKey = new Date().toDateString();
      const totals = { completed: 0, cancelled: 0, noShow: 0, pending: 0, cashRevenue: 0, onlineRevenue: 0, pendingPayments: 0 };

      for (const chunk of chunks) {
        const snap = await getDocs(query(collection(db, 'appointments'), where('shopId', 'in', chunk)));
        snap.docs.forEach((d) => {
          const a = d.data();
          if (!a.dateTime || new Date(a.dateTime).toDateString() !== todayKey) return;

          if (a.status === 'completed') totals.completed += 1;
          else if (a.status === 'cancelled') totals.cancelled += 1;
          else if (['noshow', 'no-show', 'no_show'].includes(a.status)) totals.noShow += 1;
          else totals.pending += 1;

          const amount = Number(a.servicePrice || a.totalPrice || 0);
          if (a.paymentStatus === 'paid') {
            if (a.paymentMethod === 'cash') totals.cashRevenue += amount;
            else totals.onlineRevenue += amount;
          } else {
            totals.pendingPayments += amount;
          }
        });
      }
      setSummary(totals);
    } catch (err) {
      console.error('Failed to load daily closing summary:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const totalRevenue = summary.cashRevenue + summary.onlineRevenue;

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Daily closing</Text>
          <Text style={styles.subtitle}>{new Date().toLocaleDateString([], { dateStyle: 'full' })}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Today's estimated revenue</Text>
            <Text style={styles.heroValue}>₹{totalRevenue.toLocaleString('en-IN')}</Text>
            <Text style={styles.heroSub}>
              ₹{summary.pendingPayments.toLocaleString('en-IN')} still pending payment
            </Text>
          </View>

          <View style={styles.grid}>
            <View style={styles.statCard}>
              <CheckCircle2 size={20} color="#0a8f3c" />
              <Text style={styles.statValue}>{summary.completed}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statCard}>
              <XCircle size={20} color={Colors.error} />
              <Text style={styles.statValue}>{summary.cancelled}</Text>
              <Text style={styles.statLabel}>Cancelled</Text>
            </View>
            <View style={styles.statCard}>
              <XCircle size={20} color="#b45309" />
              <Text style={styles.statValue}>{summary.noShow}</Text>
              <Text style={styles.statLabel}>No-shows</Text>
            </View>
            <View style={styles.statCard}>
              <IndianRupee size={20} color={Colors.primary} />
              <Text style={styles.statValue}>{summary.pending}</Text>
              <Text style={styles.statLabel}>Still upcoming</Text>
            </View>
          </View>

          <View style={styles.breakdownCard}>
            <View style={styles.breakdownRow}>
              <Wallet size={18} color={Colors.text} />
              <Text style={styles.breakdownLabel}>Cash payments</Text>
              <Text style={styles.breakdownValue}>₹{summary.cashRevenue.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <CreditCard size={18} color={Colors.text} />
              <Text style={styles.breakdownLabel}>Online payments</Text>
              <Text style={styles.breakdownValue}>₹{summary.onlineRevenue.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  content: { padding: 18, paddingBottom: 40 },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  heroLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  heroValue: { fontSize: 34, fontWeight: '800', color: '#fff', marginTop: 4 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    flexBasis: '47%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.text, marginTop: 6 },
  statLabel: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  breakdownCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  breakdownLabel: { flex: 1, fontSize: 14, color: Colors.text },
  breakdownValue: { fontSize: 14, fontWeight: '700', color: Colors.text },
});
