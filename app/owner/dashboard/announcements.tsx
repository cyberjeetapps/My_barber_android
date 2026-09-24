import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Modal } from 'react-native';
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { ArrowLeft, Plus, Trash2, X, Megaphone } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import { toast } from '@/utils/toast';

type Banner = {
  id: string;
  shopId: string;
  shopName?: string;
  title: string;
  message: string;
  status: string;
};

export default function Announcements() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [shops, setShops] = useState<any[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ shopId: '', title: '', message: '' });

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const shopsSnap = await getDocs(query(collection(db, 'shops'), where('ownerId', '==', user.uid)));
      const sh = shopsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as any));
      setShops(sh);
      setForm((f) => ({ ...f, shopId: f.shopId || sh[0]?.id || '' }));

      const allBanners: Banner[] = [];
      for (const shop of sh) {
        const snap = await getDocs(query(collection(db, 'announcementBanners'), where('shopId', '==', shop.id)));
        snap.forEach((d) => allBanners.push({ id: d.id, ...(d.data() as any), shopName: shop.shopName } as Banner));
      }
      setBanners(allBanners);
    } catch (err) {
      console.error('Failed to load announcement banners:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const createBanner = async () => {
    if (!form.shopId || !form.title.trim() || !form.message.trim()) {
      toast.info('Missing info', 'Please fill in shop, title and message.');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'announcementBanners'), {
        shopId: form.shopId,
        title: form.title.trim(),
        message: form.message.trim(),
        status: 'active',
        createdAt: serverTimestamp(),
      });
      setModalOpen(false);
      setForm((f) => ({ ...f, title: '', message: '' }));
      toast.success('Banner posted');
      load();
    } catch {
      toast.error('Could not post banner');
    } finally {
      setSaving(false);
    }
  };

  const removeBanner = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'announcementBanners', id));
      setBanners((prev) => prev.filter((b) => b.id !== id));
    } catch {
      toast.error('Could not remove banner');
    }
  };

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Announcements</Text>
          <Text style={styles.subtitle}>Banners your customers will see on this shop</Text>
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
            Active banners appear on your shop's card on the customer home screen. Delete a
            banner to stop showing it.
          </Text>
          {banners.length === 0 ? (
            <Text style={styles.empty}>No banners yet. Tap + to post one.</Text>
          ) : (
            banners.map((b) => (
              <View key={b.id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Megaphone size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{b.title}</Text>
                  <Text style={styles.cardMeta}>{b.shopName}</Text>
                  <Text style={styles.cardMessage}>{b.message}</Text>
                </View>
                <TouchableOpacity onPress={() => removeBanner(b.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
              <Text style={styles.modalTitle}>Post a banner</Text>
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

            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={form.title}
              onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
              placeholder="20% off today"
            />

            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={form.message}
              onChangeText={(t) => setForm((f) => ({ ...f, message: t }))}
              placeholder="Details customers should know"
              multiline
            />

            <TouchableOpacity onPress={createBanner} disabled={saving} style={styles.saveButton}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Post banner</Text>}
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
  cardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f5f7ff', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardMeta: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  cardMessage: { fontSize: 13, color: Colors.text, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: '86%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: Colors.text },
  label: { fontSize: 12, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  multilineInput: { minHeight: 70, textAlignVertical: 'top' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, color: Colors.text },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  saveButton: { backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 },
  saveButtonText: { color: '#fff', fontWeight: '700' },
});
