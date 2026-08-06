import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Plus,
  Scissors,
  Trash2,
  X,
  Armchair,
  Phone,
  User,
  Briefcase,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react-native';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* ══════════════════════ constants ══════════════════════ */

/** All barber-shop specializations owners can pick from */
const ALL_SPECIALIZATIONS = [
  'Haircut',
  'Hair Colour',
  'Hair Highlights',
  'Hair Straightening',
  'Hair Keratin',
  'Hair Rebonding',
  'Hair Spa',
  'Beard Trim',
  'Beard Shaping',
  'Clean Shave',
  'Head Shave',
  'Kids Haircut',
  'Hair Wash',
  'Head Massage',
  'Face Massage',
  'Facial',
  'Clean-up',
  'D-Tan',
  'Skin Brightening',
  'Threading',
  'Waxing',
  'Body Waxing',
  'Manicure',
  'Pedicure',
  'Ear Piercing',
  'Hair Extensions',
  'Perming',
  'Dandruff Treatment',
  'Scalp Treatment',
  'PRP Hair Treatment',
];

/* ══════════════════════════ types ══════════════════════════ */

type Shop = { id: string; shopName: string; capacity?: number };
type StaffMember = {
  id: string;
  name: string;
  phone: string;
  specializations: string[];   // array now
  shopId: string;
  shopName: string;
  seatNumber?: number;
};
type FormState = {
  name: string;
  phone: string;
  specializations: string[];   // multi-select
  shopId: string;
  seatNumber: number | null;
};
type FormErrors = {
  name?: string;
  phone?: string;
  specializations?: string;
  shopId?: string;
  seatNumber?: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  phone: '',
  specializations: [],
  shopId: '',
  seatNumber: null,
};

/* ══════════════════════ validation ══════════════════════ */

/** India mobile: exactly 10 digits, first digit 6-9 */
const INDIA_PHONE_RE = /^[6-9]\d{9}$/;

function validateForm(form: FormState, shops: Shop[]): FormErrors {
  const errors: FormErrors = {};

  if (!form.name.trim()) {
    errors.name = 'Staff name is required.';
  } else if (form.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  }

  if (!form.phone.trim()) {
    errors.phone = 'Mobile number is required.';
  } else if (!/^\d+$/.test(form.phone.trim())) {
    errors.phone = 'Enter digits only.';
  } else if (form.phone.trim().length !== 10) {
    errors.phone = 'Indian mobile number must be exactly 10 digits.';
  } else if (!INDIA_PHONE_RE.test(form.phone.trim())) {
    errors.phone = 'Invalid Indian mobile number (must start with 6, 7, 8, or 9).';
  }

  if (form.specializations.length === 0) {
    errors.specializations = 'Select at least one specialization.';
  }

  if (!form.shopId) {
    errors.shopId = 'Please select a shop.';
  }

  const selectedShop = shops.find((s) => s.id === form.shopId);
  const capacity = selectedShop?.capacity ?? 0;
  if (capacity > 0 && form.seatNumber === null) {
    errors.seatNumber = 'Please assign a seat number.';
  }

  return errors;
}

/* ══════════════════════════ component ══════════════════════════ */

export default function OwnerStaff() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [shops, setShops] = useState<Shop[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  // specialization autocomplete state
  const [specQuery, setSpecQuery] = useState('');
  const [showSpecDropdown, setShowSpecDropdown] = useState(false);

  /* ── load ── */
  const load = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const ss = await getDocs(
        query(collection(db, 'shops'), where('ownerId', '==', user.uid), limit(30))
      );
      const sh: Shop[] = ss.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setShops(sh);

      const all: StaffMember[] = [];
      for (const shop of sh) {
        const st = await getDocs(
          query(collection(db, 'staff'), where('shopId', '==', shop.id), limit(100))
        );
        st.forEach((d) => {
          const data = d.data() as any;
          // handle both old string and new array format
          const specs: string[] = Array.isArray(data.specializations)
            ? data.specializations
            : data.specialization
            ? [data.specialization]
            : [];
          all.push({ id: d.id, ...data, specializations: specs, shopName: shop.shopName });
        });
      }
      setStaff(all);
      setForm((f) => ({ ...f, shopId: f.shopId || sh[0]?.id || '' }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  /* ── derived ── */
  const selectedShop = shops.find((s) => s.id === form.shopId);
  const shopCapacity = selectedShop?.capacity ?? 0;
  const seatNumbers = shopCapacity > 0
    ? Array.from({ length: shopCapacity }, (_, i) => i + 1)
    : [];
  const occupiedSeats = staff
    .filter((m) => m.shopId === form.shopId && m.seatNumber != null)
    .map((m) => m.seatNumber as number);

  /* ── filtered dropdown suggestions ── */
  const suggestions = specQuery.trim()
    ? ALL_SPECIALIZATIONS.filter(
        (s) =>
          s.toLowerCase().includes(specQuery.toLowerCase()) &&
          !form.specializations.includes(s)
      )
    : ALL_SPECIALIZATIONS.filter((s) => !form.specializations.includes(s));

  /* ── specialization helpers ── */
  const addSpec = (spec: string) => {
    setForm((f) => ({ ...f, specializations: [...f.specializations, spec] }));
    setErrors((e) => ({ ...e, specializations: undefined }));
    setSpecQuery('');
    setShowSpecDropdown(false);
  };

  const removeSpec = (spec: string) => {
    setForm((f) => ({
      ...f,
      specializations: f.specializations.filter((s) => s !== spec),
    }));
  };

  /* ── open modal ── */
  const openModal = () => {
    setErrors({});
    setForm({ ...EMPTY_FORM, shopId: shops[0]?.id || '' });
    setSpecQuery('');
    setShowSpecDropdown(false);
    setOpen(true);
  };

  /* ── add staff ── */
  const add = async () => {
    Keyboard.dismiss();
    const errs = validateForm(form, shops);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      setSaving(true);
      await addDoc(collection(db, 'staff'), {
        name: form.name.trim(),
        phone: form.phone.trim(),
        specializations: form.specializations,
        specialization: form.specializations[0] ?? '', // backwards compat
        shopId: form.shopId,
        seatNumber: form.seatNumber,
        ownerId: user?.uid,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      setOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch {
      Alert.alert('Error', 'Unable to add staff. Check Firestore permissions.');
    } finally {
      setSaving(false);
    }
  };

  /* ── remove staff ── */
  const remove = (id: string, name: string) =>
    Alert.alert('Remove staff', `Remove ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => { await deleteDoc(doc(db, 'staff', id)); load(); },
      },
    ]);

  /* ── phone: digits only, max 10 ── */
  const onPhoneChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 10);
    setForm((f) => ({ ...f, phone: digits }));
    setErrors((e) => ({ ...e, phone: undefined }));
  };

  /* ── shop change: reset seat ── */
  const onShopChange = (shopId: string) => {
    setForm((f) => ({ ...f, shopId, seatNumber: null }));
    setErrors((e) => ({ ...e, shopId: undefined, seatNumber: undefined }));
  };

  /* ════════════════════════ render ════════════════════════ */
  return (
    <View style={s.page}>
      {/* header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Staff & Chairs</Text>
          <Text style={s.sub}>Owner-controlled team management</Text>
        </View>
        <TouchableOpacity onPress={openModal} style={s.addBtn}>
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* staff list */}
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={s.content}
      >
        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 50 }} />
        ) : staff.length === 0 ? (
          <Text style={s.empty}>No staff added yet. Tap + to add your first team member.</Text>
        ) : (
          staff.map((x) => (
            <View key={x.id} style={s.card}>
              <View style={s.cardIcon}>
                <Scissors size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{x.name}</Text>
                {/* specialization tags */}
                <View style={s.specTagRow}>
                  {(x.specializations?.length ? x.specializations : ['Barber']).map((sp) => (
                    <View key={sp} style={s.specTagSmall}>
                      <Text style={s.specTagSmallText}>{sp}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.cardFooter}>
                  {x.phone ? (
                    <View style={s.pillRow}>
                      <Phone size={11} color={Colors.textLight} />
                      <Text style={s.phoneText}>{x.phone}</Text>
                    </View>
                  ) : null}
                  {x.seatNumber != null ? (
                    <View style={[s.pillRow, s.seatPill]}>
                      <Armchair size={11} color={Colors.primary} />
                      <Text style={s.seatPillText}>Seat {x.seatNumber}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity onPress={() => remove(x.id, x.name)} style={s.trash}>
                <Trash2 size={18} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Add staff modal ── */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={() => { setOpen(false); setShowSpecDropdown(false); }}
        />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.handle} />

          <View style={s.modalHead}>
            <Text style={s.modalTitle}>Add Staff Member</Text>
            <TouchableOpacity onPress={() => setOpen(false)} style={s.closeBtn}>
              <X size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {/* ── Name ── */}
            <FieldLabel icon={<User size={14} color={Colors.primary} />} label="Full Name *" />
            <TextInput
              style={[s.input, errors.name && s.inputError]}
              placeholder="e.g. Rahul Sharma"
              placeholderTextColor={Colors.textLight}
              value={form.name}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, name: v }));
                setErrors((e) => ({ ...e, name: undefined }));
              }}
              returnKeyType="next"
              autoCapitalize="words"
            />
            {errors.name && <Text style={s.errText}>{errors.name}</Text>}

            {/* ── Phone ── */}
            <FieldLabel icon={<Phone size={14} color={Colors.primary} />} label="Mobile Number *" />
            <View style={s.phoneRow}>
              <View style={s.phonePrefix}>
                <Text style={s.phonePrefixText}>🇮🇳 +91</Text>
              </View>
              <TextInput
                style={[s.phoneInput, errors.phone && s.inputError]}
                placeholder="10-digit number"
                placeholderTextColor={Colors.textLight}
                keyboardType="number-pad"
                maxLength={10}
                value={form.phone}
                onChangeText={onPhoneChange}
                returnKeyType="next"
              />
            </View>
            {/* live counter */}
            <Text style={[s.phoneCounter, form.phone.length === 10 && s.phoneCounterOk]}>
              {form.phone.length}/10 digits
            </Text>
            {errors.phone && <Text style={s.errText}>{errors.phone}</Text>}

            {/* ── Specializations ── */}
            <FieldLabel icon={<Briefcase size={14} color={Colors.primary} />} label="Specializations *" />

            {/* Selected tags */}
            {form.specializations.length > 0 && (
              <View style={s.selectedTags}>
                {form.specializations.map((sp) => (
                  <TouchableOpacity
                    key={sp}
                    style={s.selectedTag}
                    onPress={() => removeSpec(sp)}
                  >
                    <Text style={s.selectedTagText}>{sp}</Text>
                    <X size={11} color="#fff" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Search input */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setShowSpecDropdown(true)}
            >
              <View style={[s.specSearchBox, errors.specializations && s.inputError]}>
                <TextInput
                  style={s.specSearchInput}
                  placeholder={
                    form.specializations.length === 0
                      ? 'Type or tap to add specializations…'
                      : 'Add more…'
                  }
                  placeholderTextColor={Colors.textLight}
                  value={specQuery}
                  onChangeText={(v) => {
                    setSpecQuery(v);
                    setShowSpecDropdown(true);
                  }}
                  onFocus={() => setShowSpecDropdown(true)}
                  returnKeyType="search"
                />
                <ChevronDown size={16} color={Colors.textLight} />
              </View>
            </TouchableOpacity>
            {errors.specializations && (
              <Text style={s.errText}>{errors.specializations}</Text>
            )}

            {/* Dropdown list */}
            {showSpecDropdown && suggestions.length > 0 && (
              <View style={s.dropdown}>
                <ScrollView
                  nestedScrollEnabled
                  style={{ maxHeight: 180 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                >
                  {suggestions.map((sp) => (
                    <TouchableOpacity
                      key={sp}
                      style={s.dropdownItem}
                      onPress={() => addSpec(sp)}
                    >
                      <Scissors size={13} color={Colors.primary} />
                      <Text style={s.dropdownItemText}>{sp}</Text>
                      <Plus size={13} color={Colors.primary} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {showSpecDropdown && suggestions.length === 0 && specQuery.trim() !== '' && (
              <TouchableOpacity
                style={s.addCustomSpec}
                onPress={() => { addSpec(specQuery.trim()); }}
              >
                <Plus size={13} color={Colors.primary} />
                <Text style={s.addCustomSpecText}>Add "{specQuery.trim()}" as custom</Text>
              </TouchableOpacity>
            )}

            {/* ── Shop selector ── */}
            <FieldLabel icon={<Scissors size={14} color={Colors.primary} />} label="Shop *" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {shops.map((x) => (
                <TouchableOpacity
                  key={x.id}
                  onPress={() => onShopChange(x.id)}
                  style={[s.chip, form.shopId === x.id && s.chipActive]}
                >
                  <Text style={[s.chipText, form.shopId === x.id && s.chipTextActive]}>
                    {x.shopName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {errors.shopId && <Text style={s.errText}>{errors.shopId}</Text>}

            {/* ── Seat selector ── */}
            {form.shopId && seatNumbers.length > 0 && (
              <>
                <FieldLabel
                  icon={<Armchair size={14} color={Colors.primary} />}
                  label={`Assign Seat * (${shopCapacity} seat${shopCapacity > 1 ? 's' : ''} available)`}
                />
                <View style={s.seatGrid}>
                  {seatNumbers.map((n) => {
                    const isOccupied = occupiedSeats.includes(n);
                    const isSelected = form.seatNumber === n;
                    return (
                      <TouchableOpacity
                        key={n}
                        disabled={isOccupied}
                        onPress={() => {
                          setForm((f) => ({ ...f, seatNumber: n }));
                          setErrors((e) => ({ ...e, seatNumber: undefined }));
                        }}
                        style={[
                          s.seatBox,
                          isSelected && s.seatBoxSelected,
                          isOccupied && s.seatBoxOccupied,
                        ]}
                      >
                        <Armchair
                          size={18}
                          color={isSelected ? '#fff' : isOccupied ? Colors.textLight : Colors.primary}
                        />
                        <Text
                          style={[
                            s.seatLabel,
                            isSelected && s.seatLabelSelected,
                            isOccupied && s.seatLabelOccupied,
                          ]}
                        >
                          {n}
                        </Text>
                        {isOccupied && <Text style={s.seatOccupiedTag}>Taken</Text>}
                        {isSelected && <CheckCircle2 size={12} color="#fff" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {errors.seatNumber && <Text style={s.errText}>{errors.seatNumber}</Text>}
              </>
            )}

            {form.shopId && seatNumbers.length === 0 && (
              <View style={s.noSeatBanner}>
                <Armchair size={14} color={Colors.textLight} />
                <Text style={s.noSeatText}>
                  No seats configured for this shop. Set capacity in Shop Seating first.
                </Text>
              </View>
            )}

            {/* ── Save ── */}
            <TouchableOpacity
              onPress={add}
              disabled={saving}
              style={[s.save, saving && { opacity: 0.6 }]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.saveText}>Add Staff Member</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/* ── FieldLabel ── */
function FieldLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={s.fieldLabel}>
      {icon}
      <Text style={s.fieldLabelText}>{label}</Text>
    </View>
  );
}

/* ══════════════════════════ styles ══════════════════════════ */
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.background },

  /* header */
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  title: { fontFamily: 'Poppins-Bold', fontSize: 20, color: Colors.text },
  sub: { fontFamily: 'Poppins-Regular', fontSize: 12, color: Colors.textLight },
  addBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },

  /* list */
  content: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', marginTop: 60, fontFamily: 'Poppins-Regular', color: Colors.textLight, lineHeight: 22, paddingHorizontal: 30 },

  /* card */
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  name: { fontFamily: 'Poppins-SemiBold', fontSize: 15, color: Colors.text },
  specTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  specTagSmall: { backgroundColor: Colors.primaryLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  specTagSmallText: { fontSize: 10, fontFamily: 'Poppins-Medium', color: Colors.primary },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phoneText: { fontFamily: 'Poppins-Regular', fontSize: 11, color: Colors.textLight },
  seatPill: { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  seatPillText: { fontFamily: 'Poppins-SemiBold', fontSize: 11, color: Colors.primary },
  trash: { padding: 10 },

  /* modal sheet */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: Colors.cardBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: '92%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 14 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontFamily: 'Poppins-Bold', fontSize: 18, color: Colors.text },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.backgroundLight, alignItems: 'center', justifyContent: 'center' },

  /* field label */
  fieldLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: 14 },
  fieldLabelText: { fontFamily: 'Poppins-SemiBold', fontSize: 13, color: Colors.text },

  /* inputs */
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 2, fontFamily: 'Poppins-Regular', fontSize: 14, color: Colors.text, backgroundColor: Colors.inputBackground },
  inputError: { borderColor: Colors.error },
  errText: { fontSize: 11, fontFamily: 'Poppins-Regular', color: Colors.error, marginBottom: 2, marginLeft: 2 },

  /* phone row */
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  phonePrefix: { backgroundColor: Colors.inputBackground, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  phonePrefixText: { fontFamily: 'Poppins-SemiBold', fontSize: 13, color: Colors.text },
  phoneInput: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Poppins-Regular', fontSize: 14, color: Colors.text, backgroundColor: Colors.inputBackground },
  phoneCounter: { fontSize: 11, fontFamily: 'Poppins-Regular', color: Colors.textLight, textAlign: 'right', marginBottom: 2 },
  phoneCounterOk: { color: Colors.success },

  /* specialization */
  selectedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  selectedTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  selectedTagText: { fontSize: 12, fontFamily: 'Poppins-SemiBold', color: '#fff' },

  specSearchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: Colors.inputBackground, marginBottom: 2 },
  specSearchInput: { flex: 1, fontFamily: 'Poppins-Regular', fontSize: 13, color: Colors.text, paddingVertical: 8 },

  dropdown: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.cardBackground, marginBottom: 6, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  dropdownItemText: { flex: 1, fontFamily: 'Poppins-Regular', fontSize: 13, color: Colors.text },

  addCustomSpec: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primaryLight, borderRadius: 10, padding: 10, marginBottom: 6 },
  addCustomSpecText: { fontFamily: 'Poppins-Medium', fontSize: 12, color: Colors.primary },

  /* shop chips */
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, marginRight: 8, backgroundColor: Colors.inputBackground },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: 'Poppins-Medium', fontSize: 12, color: Colors.text },
  chipTextActive: { color: '#fff' },

  /* seat grid */
  seatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 8 },
  seatBox: { width: 68, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.inputBackground, gap: 4 },
  seatBoxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  seatBoxOccupied: { backgroundColor: Colors.backgroundLight, borderColor: Colors.borderLight, opacity: 0.55 },
  seatLabel: { fontFamily: 'Poppins-Bold', fontSize: 15, color: Colors.text },
  seatLabelSelected: { color: '#fff' },
  seatLabelOccupied: { color: Colors.textLight },
  seatOccupiedTag: { fontSize: 9, fontFamily: 'Poppins-Regular', color: Colors.textLight },

  /* no-seat banner */
  noSeatBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.backgroundLight, borderRadius: 10, padding: 10, marginTop: 8, marginBottom: 4 },
  noSeatText: { flex: 1, fontSize: 12, fontFamily: 'Poppins-Regular', color: Colors.textLight, lineHeight: 17 },

  /* save */
  save: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveText: { fontFamily: 'Poppins-SemiBold', fontSize: 15, color: '#fff' },
});
