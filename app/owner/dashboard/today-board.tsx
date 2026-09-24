import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { ArrowLeft, Clock, UserRound } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';

type Booking = {
  id: string;
  shopId: string;
  shopName?: string;
  userName?: string;
  serviceName?: string;
  dateTime: string;
  status?: string;
  barberNumber?: number;
  staffName?: string;
};

// Same chunking approach already used in owner/dashboard/analytics.tsx —
// Firestore 'in' queries cap out per query, so an owner with more shops
// than one chunk needs multiple listeners merged together rather than a
// single query that silently drops the rest.
const chunk = <T,>(items: T[], size = 30): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size)
  );

export default function TodayBoard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [byId, setById] = useState<Record<string, Booking>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    let unsubscribers: Array<() => void> = [];

    (async () => {
      const shopsSnap = await getDocs(query(collection(db, 'shops'), where('ownerId', '==', user.uid)));
      const shopIds = shopsSnap.docs.map((d) => d.id);

      if (!shopIds.length) {
        setLoading(false);
        return;
      }

      let pendingChunks = 0;
      const chunks = chunk(shopIds);

      chunks.forEach((shopIdChunk) => {
        pendingChunks += 1;
        const unsub = onSnapshot(
          query(collection(db, 'appointments'), where('shopId', 'in', shopIdChunk)),
          (snap) => {
            setById((prev) => {
              // Drop previous entries from this chunk's shop IDs, then
              // re-add the fresh snapshot — keeps other chunks' entries
              // intact instead of one chunk's update wiping another's.
              const next = { ...prev };
              Object.values(next).forEach((b) => {
                if (shopIdChunk.includes(b.shopId) && !snap.docs.some((d) => d.id === b.id)) {
                  delete next[b.id];
                }
              });
              snap.docs.forEach((d) => {
                next[d.id] = { id: d.id, ...(d.data() as Omit<Booking, 'id'>) };
              });
              return next;
            });
            pendingChunks -= 1;
            if (pendingChunks <= 0) setLoading(false);
          },
          () => {
            pendingChunks -= 1;
            if (pendingChunks <= 0) setLoading(false);
          }
        );
        unsubscribers.push(unsub);
      });
    })();

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [user?.uid]);

  const today = useMemo(() => {
    const now = new Date();
    return Object.values(byId)
      .filter((b) => {
        const d = new Date(b.dateTime);
        return d.toDateString() === now.toDateString() && b.status !== 'cancelled';
      })
      .sort((a, b) => +new Date(a.dateTime) - +new Date(b.dateTime));
  }, [byId]);

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" accessibilityRole="button">
          <ArrowLeft color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Today's Board</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summary}>
            <Text style={styles.count}>{today.length}</Text>
            <Text style={styles.muted}>appointments today</Text>
          </View>

          {today.length === 0 ? (
            <Text style={styles.empty}>No appointments scheduled for today.</Text>
          ) : (
            today.map((b) => {
              const time = new Date(b.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <View
                  key={b.id}
                  style={styles.card}
                  accessible
                  accessibilityLabel={`${b.serviceName || 'Service'}, ${b.userName || 'Customer'}, ${time}`}
                >
                  <View style={styles.row}>
                    <Clock size={17} color={Colors.primary} />
                    <Text style={styles.timeText}>{time}</Text>
                  </View>
                  <Text style={styles.service}>{b.serviceName || 'Service'}</Text>
                  <View style={styles.row}>
                    <UserRound size={15} color={Colors.textLight} />
                    <Text style={styles.muted}>
                      {b.userName || 'Customer'} · {b.staffName || `Chair ${b.barberNumber || 1}`}
                    </Text>
                  </View>
                  {b.shopName ? <Text style={styles.shop}>{b.shopName}</Text> : null}
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
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.text },
  content: { padding: 18, paddingBottom: 40 },
  summary: { padding: 18, borderRadius: 16, backgroundColor: '#fff', marginBottom: 16 },
  count: { fontSize: 34, fontWeight: '800', color: Colors.primary },
  muted: { color: Colors.textLight, marginLeft: 5 },
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 50 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  timeText: { fontWeight: '700', color: Colors.primary },
  service: { fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 10 },
  shop: { fontSize: 12, color: Colors.textLight, marginTop: 8 },
});
