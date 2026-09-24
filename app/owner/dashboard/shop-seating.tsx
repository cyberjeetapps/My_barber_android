import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { ArrowLeft, Armchair, Plus, Minus, AlertTriangle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import { toast } from '@/utils/toast';

type Shop = {
  id: string;
  shopName: string;
  capacity?: number;
};

export default function ShopSeating() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'shops'), where('ownerId', '==', user.uid)));
      setShops(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Shop)));
    } catch (err) {
      console.error('Failed to load shops:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const changeCapacity = async (shop: Shop, delta: number) => {
    const current = shop.capacity || 4;
    const next = Math.max(1, Math.min(10, current + delta));
    if (next === current) return;

    // If lowering the chair count, check whether any upcoming booking
    // already sits on a chair number that would no longer exist — better
    // to warn the owner than to silently strand a real customer booking.
    if (next < current) {
      try {
        const apptSnap = await getDocs(
          query(collection(db, 'appointments'), where('shopId', '==', shop.id))
        );
        const now = Date.now();
        const affected = apptSnap.docs.filter((d) => {
          const a = d.data();
          return (
            a.status !== 'cancelled' &&
            a.status !== 'completed' &&
            new Date(a.dateTime).getTime() > now &&
            typeof a.barberNumber === 'number' &&
            a.barberNumber > next
          );
        });
        if (affected.length > 0) {
          setConflictWarning((prev) => ({ ...prev, [shop.id]: affected.length }));
          toast.error(
            'Cannot lower yet',
            `${affected.length} upcoming booking(s) are on a chair number above ${next}. Reschedule or complete them first.`
          );
          return;
        }
      } catch (err) {
        console.error('Failed to check chair conflicts:', err);
      }
    }

    setSaving(shop.id);
    try {
      await updateDoc(doc(db, 'shops', shop.id), { capacity: next });
      setShops((prev) => prev.map((s) => (s.id === shop.id ? { ...s, capacity: next } : s)));
      setConflictWarning((prev) => { const { [shop.id]: _, ...rest } = prev; return rest; });
      toast.success('Seating updated', `${shop.shopName} now shows ${next} chair${next === 1 ? '' : 's'} to customers.`);
    } catch {
      toast.error('Could not update seating');
    } finally {
      setSaving(null);
    }
  };

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Shop seating</Text>
          <Text style={styles.subtitle}>How many chairs customers can choose from</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {shops.length === 0 ? (
            <Text style={styles.empty}>No shops found for this account.</Text>
          ) : (
            shops.map((shop) => (
              <View key={shop.id} style={styles.card}>
                <Text style={styles.shopName}>{shop.shopName}</Text>
                <Text style={styles.helpText}>
                  Set this to your salon's real chair count — customers pick from exactly this
                  many when booking, and it's what decides which times still have room.
                </Text>

                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => changeCapacity(shop, -1)}
                    disabled={saving === shop.id}
                  >
                    <Minus size={20} color={Colors.primary} />
                  </TouchableOpacity>

                  <View style={styles.valueBox}>
                    {saving === shop.id ? (
                      <ActivityIndicator color={Colors.primary} />
                    ) : (
                      <>
                        <Armchair size={20} color={Colors.primary} />
                        <Text style={styles.valueText}>{shop.capacity || 4}</Text>
                      </>
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => changeCapacity(shop, 1)}
                    disabled={saving === shop.id}
                  >
                    <Plus size={20} color={Colors.primary} />
                  </TouchableOpacity>
                </View>

                {conflictWarning[shop.id] && (
                  <View style={styles.warningBox}>
                    <AlertTriangle size={16} color="#b45309" />
                    <Text style={styles.warningText}>
                      {conflictWarning[shop.id]} upcoming booking(s) are on a chair number that
                      would no longer exist. Resolve those first, or ask admin to help reassign
                      them.
                    </Text>
                  </View>
                )}
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
  title: { fontSize: 19, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  content: { padding: 18, paddingBottom: 40 },
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 50 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shopName: { fontSize: 17, fontWeight: '700', color: Colors.text },
  helpText: { fontSize: 12, color: Colors.textLight, marginTop: 6, lineHeight: 17 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 },
  stepperButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    minWidth: 90,
    justifyContent: 'center',
  },
  valueText: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fffaeb',
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
  },
  warningText: { flex: 1, fontSize: 11, color: '#7a4d0b', lineHeight: 16 },
});
