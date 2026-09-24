import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Star, TrendingUp } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';

type ChairStats = {
  chair: number;
  completed: number;
  revenue: number;
  noShows: number;
  ratingSum: number;
  ratingCount: number;
  customers: Set<string>;
};

// Bookings are tracked per chair number (barberNumber) rather than a named
// staff record — checked, there's no per-barber identity captured at
// booking time today, only which numbered chair. So this groups
// performance by chair, which is the real, available unit of data,
// rather than pretending to attribute it to a named stylist.
export default function StaffPerformance() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ChairStats[]>([]);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const shopsSnap = await getDocs(query(collection(db, 'shops'), where('ownerId', '==', user.uid)));
      const shopIds = shopsSnap.docs.map((d) => d.id);
      if (!shopIds.length) return;

      const chunks: string[][] = [];
      for (let i = 0; i < shopIds.length; i += 30) chunks.push(shopIds.slice(i, i + 30));

      const byChair = new Map<number, ChairStats>();
      const ensure = (chair: number) => {
        if (!byChair.has(chair)) {
          byChair.set(chair, { chair, completed: 0, revenue: 0, noShows: 0, ratingSum: 0, ratingCount: 0, customers: new Set() });
        }
        return byChair.get(chair)!;
      };

      for (const chunk of chunks) {
        const [apptSnap, reviewSnap] = await Promise.all([
          getDocs(query(collection(db, 'appointments'), where('shopId', 'in', chunk))),
          getDocs(query(collection(db, 'reviews'), where('shopId', 'in', chunk))),
        ]);

        apptSnap.docs.forEach((d) => {
          const a = d.data();
          const chair = a.barberNumber;
          if (typeof chair !== 'number') return;
          const s = ensure(chair);
          if (a.status === 'completed') {
            s.completed += 1;
            s.revenue += Number(a.servicePrice || 0);
            if (a.userId) s.customers.add(a.userId);
          } else if (['noshow', 'no-show', 'no_show'].includes(a.status)) {
            s.noShows += 1;
          }
        });

        reviewSnap.docs.forEach((d) => {
          const r = d.data();
          if (typeof r.barberNumber === 'number' && typeof r.rating === 'number') {
            const s = ensure(r.barberNumber);
            s.ratingSum += r.rating;
            s.ratingCount += 1;
          }
        });
      }

      setStats(Array.from(byChair.values()).sort((a, b) => b.revenue - a.revenue));
    } catch (err) {
      console.error('Failed to load staff performance:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Chair performance</Text>
          <Text style={styles.subtitle}>All-time, across your shops</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {stats.length === 0 ? (
            <Text style={styles.empty}>No completed bookings yet.</Text>
          ) : (
            stats.map((s) => (
              <View key={s.chair} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.chairTitle}>Chair {s.chair}</Text>
                  {s.ratingCount > 0 && (
                    <View style={styles.ratingRow}>
                      <Star size={14} color="#f59e0b" fill="#f59e0b" />
                      <Text style={styles.ratingText}>{(s.ratingSum / s.ratingCount).toFixed(1)}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.statRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{s.completed}</Text>
                    <Text style={styles.statLabel}>Completed</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>₹{s.revenue.toLocaleString('en-IN')}</Text>
                    <Text style={styles.statLabel}>Revenue</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{s.customers.size}</Text>
                    <Text style={styles.statLabel}>Customers</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, s.noShows > 0 && { color: Colors.error }]}>{s.noShows}</Text>
                    <Text style={styles.statLabel}>No-shows</Text>
                  </View>
                </View>
              </View>
            ))
          )}
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
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 50 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chairTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  statRow: { flexDirection: 'row', marginTop: 14, gap: 10 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
});
