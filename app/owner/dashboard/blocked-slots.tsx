import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Modal } from 'react-native';
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { ArrowLeft, Plus, Trash2, X, Ban } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import { toast } from '@/utils/toast';

type BlockedSlot = {
  id: string;
  shopId: string;
  shopName?: string;
  barberNumber: number; // 0 = whole shop
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  reason: string;
};

export default function BlockedSlots() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [shops, setShops] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<BlockedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    shopId: '',
    barberNumber: '0',
    date: new Date().toISOString().slice(0, 10),
    startTime: '13:00',
    endTime: '14:00',
    reason: 'Lunch break',
  });

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const shopsSnap = await getDocs(query(collection(db, 'shops'), where('ownerId', '==', user.uid)));
      const sh = shopsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as any));
      setShops(sh);
      setForm((f) => ({ ...f, shopId: f.shopId || sh[0]?.id || '' }));

      const allBlocks: BlockedSlot[] = [];
      for (const shop of sh) {
        const snap = await getDocs(query(collection(db, 'blockedSlots'), where('shopId', '==', shop.id)));
        snap.forEach((d) => allBlocks.push({ id: d.id, ...(d.data() as any), shopName: shop.shopName } as BlockedSlot));
      }
      // Only show today and future blocks — past ones are no longer relevant
      const todayStr = new Date().toISOString().slice(0, 10);
      setBlocks(allBlocks.filter((b) => b.date >= todayStr).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)));
    } catch (err) {
      console.error('Failed to load blocked slots:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const createBlock = async () => {
    if (!form.shopId || !form.date || !form.startTime || !form.endTime) {
      toast.info('Missing info', 'Please fill in shop, date and time range.');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'blockedSlots'), {
        shopId: form.shopId,
        barberNumber: Number(form.barberNumber) || 0,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        reason: form.reason.trim() || 'Blocked',
        createdAt: serverTimestamp(),
      });
      setModalOpen(false);
      toast.success('Time blocked');
      load();
    } catch {
      toast.error('Could not create block');
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'blockedSlots', id));
      setBlocks((prev) => prev.filter((b) => b.id !== id));
    } catch {
      toast.error('Could not remove block');
    }
  };

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Blocked time</Text>
          <Text style={styles.subtitle}>Breaks, closures and chair-specific blocks</Text>
        </View>
        <TouchableOpacity onPress={() => setModalOpen(true)} style={styles.addButton}>
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.note}>
            Blocked times are hidden from customer booking automatically — this actually
            removes those slots from availability, not just a note for staff.
          </Text>
          {blocks.length === 0 ? (
            <Text style={styles.empty}>No upcoming blocks. Tap + to block a break, closure, or single chair.</Text>
          ) : (
            blocks.map((b) => (
              <View key={b.id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Ban size={18} color={Colors.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{b.reason}</Text>
                  <Text style={styles.cardMeta}>
                    {b.shopName} · {b.barberNumber === 0 ? 'All chairs' : `Chair ${b.barberNumber}`}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {new Date(b.date).toLocaleDateString([], { dateStyle: 'medium' })} · {b.startTime}–{b.endTime}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeBlock(b.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Trash2 size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Block a time</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <X size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Shop</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {shops.map((shop) => (
                <TouchableOpacity
                  key={shop.id}
                  onPress={() => setForm((f) => ({ ...f, shopId: shop.id }))}
                  style={[styles.chip, form.shopId === shop.id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, form.shopId === shop.id && styles.chipTextActive]}>{shop.shopName}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Chair (0 = whole shop)</Text>
            <TextInput
              style={styles.input}
              value={form.barberNumber}
              onChangeText={(t) => setForm((f) => ({ ...f, barberNumber: t.replace(/[^0-9]/g, '') }))}
              keyboardType="numeric"
              placeholder="0"
            />

            <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={form.date}
              onChangeText={(t) => setForm((f) => ({ ...f, date: t }))}
              placeholder="2026-07-15"
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Start</Text>
                <TextInput
                  style={styles.input}
                  value={form.startTime}
                  onChangeText={(t) => setForm((f) => ({ ...f, startTime: t }))}
                  placeholder="13:00"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>End</Text>
                <TextInput
                  style={styles.input}
                  value={form.endTime}
                  onChangeText={(t) => setForm((f) => ({ ...f, endTime: t }))}
                  placeholder="14:00"
                />
              </View>
            </View>

            <Text style={styles.label}>Reason</Text>
            <TextInput
              style={styles.input}
              value={form.reason}
              onChangeText={(t) => setForm((f) => ({ ...f, reason: t }))}
              placeholder="Lunch break, emergency closure, etc."
            />

            <TouchableOpacity onPress={createBlock} disabled={saving} style={styles.saveButton}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Block this time</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  addButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 40 },
  note: { fontSize: 12, color: Colors.textLight, marginBottom: 16, lineHeight: 18 },
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 30 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fef3f2', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardMeta: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: '86%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: Colors.text },
  label: { fontSize: 12, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, color: Colors.text },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  saveButton: { backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 },
  saveButtonText: { color: '#fff', fontWeight: '700' },
});
