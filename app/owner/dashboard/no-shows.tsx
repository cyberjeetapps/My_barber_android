import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, UserX } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';

// Different parts of this app have written the no-show status as
// 'noshow', 'no-show', and 'no_show' over time (checked — all three
// appear in existing code). Matching all three here rather than picking
// one, so this view doesn't silently miss records written by an older
// or newer part of the app.
const NO_SHOW_VALUES = ['noshow', 'no-show', 'no_show'];

type NoShowRecord = {
  id: string;
  userName?: string;
  userPhone?: string;
  serviceName?: string;
  shopName?: string;
  dateTime: string;
};

export default function NoShowHistory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [records, setRecords] = useState<NoShowRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const shopsSnap = await getDocs(query(collection(db, 'shops'), where('ownerId', '==', user.uid)));
      const shopIds = shopsSnap.docs.map((d) => d.id);
      if (!shopIds.length) {
        setRecords([]);
        return;
      }
      // Firestore 'in' caps at 30 — chunk the same way analytics.tsx and
      // today-board.tsx already do, so an owner with many shops doesn't
      // silently lose records past the first chunk.
      const chunks: string[][] = [];
      for (let i = 0; i < shopIds.length; i += 30) chunks.push(shopIds.slice(i, i + 30));

      const all: NoShowRecord[] = [];
      for (const chunk of chunks) {
        const snap = await getDocs(query(collection(db, 'appointments'), where('shopId', 'in', chunk)));
        snap.docs.forEach((d) => {
          const data = d.data();
          if (NO_SHOW_VALUES.includes(data.status)) {
            all.push({ id: d.id, ...data } as NoShowRecord);
          }
        });
      }
      all.sort((a, b) => (a.dateTime < b.dateTime ? 1 : -1));
      setRecords(all);
    } catch (err) {
      console.error('Failed to load no-show history:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  // Repeat offenders — grouped by phone (falls back to name if phone missing)
  const repeatCounts = records.reduce((map, r) => {
    const key = r.userPhone || r.userName || 'unknown';
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map<string, number>());

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>No-show history</Text>
          <Text style={styles.subtitle}>{records.length} recorded, across all your shops</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {records.length === 0 ? (
            <Text style={styles.empty}>No no-shows recorded yet.</Text>
          ) : (
            records.map((r) => {
              const key = r.userPhone || r.userName || 'unknown';
              const repeatCount = repeatCounts.get(key) || 1;
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <UserX size={16} color={Colors.error} />
                    <Text style={styles.customerName}>{r.userName || 'Customer'}</Text>
                    {repeatCount > 1 && (
                      <View style={styles.repeatBadge}>
                        <Text style={styles.repeatBadgeText}>{repeatCount}x no-show</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.meta}>{r.serviceName || 'Service'} · {r.shopName || 'Salon'}</Text>
                  <Text style={styles.meta}>
                    {r.dateTime ? new Date(r.dateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                  </Text>
                </View>
              );
            })
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
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customerName: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  repeatBadge: { backgroundColor: '#fef3f2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  repeatBadgeText: { fontSize: 10, fontWeight: '700', color: '#b42318' },
  meta: { fontSize: 12, color: Colors.textLight, marginTop: 4 },
});
