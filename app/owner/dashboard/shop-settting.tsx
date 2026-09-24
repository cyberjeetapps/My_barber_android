/**
 * Shop Settings Screen
 * Lets the owner configure:
 *  - Phone number & about text
 *  - Per-day opening & closing time (or mark the day as closed)
 *  - Weekly holiday days
 *  - Amenities (AC, parking, home service)
 *  - UPI ID
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Clock,
  Phone,
  Info,
  Car,
  Home,
  CreditCard,
  Save,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Thermometer,
  MapPin,
} from 'lucide-react-native';
import {
  doc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import { toast } from '@/utils/toast';

/* ─────────────────────────── types ─────────────────────────── */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = (typeof DAYS)[number];

type DayTiming = {
  open: string;    // e.g. "09:00 AM"
  close: string;   // e.g. "09:00 PM"
  isClosed: boolean;
};

type ShopSettings = {
  phone: string;
  about: string;
  upiId: string;
  holidays: Day[];
  timings: Record<Day, DayTiming>;
  amenities: {
    ac: boolean;
    parking: boolean;
    homeService: boolean;
  };
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  country: string;
  googleMapLink: string;
};

/* ─────────────────────── time-picker data ───────────────────── */

const HOURS = Array.from(
  { length: 12 },
  (_, i) => String(i === 0 ? 12 : i).padStart(2, '0')
);
const MINUTES = ['00', '15', '30', '45'];
const PERIODS = ['AM', 'PM'];

function buildTimeOptions(): string[] {
  const opts: string[] = [];
  for (const p of PERIODS) {
    for (const h of HOURS) {
      for (const m of MINUTES) {
        opts.push(`${h}:${m} ${p}`);
      }
    }
  }
  return opts;
}
const TIME_OPTIONS = buildTimeOptions();

const DEFAULT_TIMING: DayTiming = {
  open: '09:00 AM',
  close: '09:00 PM',
  isClosed: false,
};

const DEFAULT_SETTINGS: ShopSettings = {
  phone: '',
  about: '',
  upiId: '',
  holidays: [],
  timings: DAYS.reduce((acc, d) => {
    acc[d] = { ...DEFAULT_TIMING };
    return acc;
  }, {} as Record<Day, DayTiming>),
  amenities: { ac: false, parking: false, homeService: false },
  addressLine1: '',
  addressLine2: '',
  city: '',
  stateRegion: '',
  postalCode: '',
  country: '',
  googleMapLink: '',
};

/* ═══════════════════════════ component ═══════════════════════════ */

export default function ShopSettingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [shopId, setShopId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // time-picker modal state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{
    day: Day;
    field: 'open' | 'close';
  } | null>(null);

  /* ── load ── */
  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'shops'), where('ownerId', '==', user.uid))
      );
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data() as any;
        setShopId(d.id);

        const mergedTimings = { ...DEFAULT_SETTINGS.timings } as Record<
          Day,
          DayTiming
        >;
        if (data.timings) {
          for (const day of DAYS) {
            if (data.timings[day]) {
              mergedTimings[day] = { ...DEFAULT_TIMING, ...data.timings[day] };
            }
          }
        }

        setSettings({
          phone: data.phone ?? '',
          about: data.about ?? '',
          upiId: data.upiId ?? '',
          holidays: (data.holidays as Day[]) ?? [],
          timings: mergedTimings,
          amenities: {
            ac: data.amenities?.ac ?? false,
            parking: data.amenities?.parking ?? false,
            homeService: data.amenities?.homeService ?? false,
          },
          addressLine1: data.addressLine1 ?? '',
          addressLine2: data.addressLine2 ?? '',
          city: data.city ?? '',
          stateRegion: data.stateRegion ?? '',
          postalCode: data.postalCode ?? '',
          country: data.country ?? '',
          googleMapLink: data.googleMapLink ?? '',
        });
      }
    } catch (err) {
      console.error('Failed to load shop settings:', err);
      toast.error('Could not load settings');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── helpers ── */
  const toggleHoliday = (day: Day) => {
    setSettings((prev) => ({
      ...prev,
      holidays: prev.holidays.includes(day)
        ? prev.holidays.filter((d) => d !== day)
        : [...prev.holidays, day],
    }));
  };

  const toggleDayClosed = (day: Day) => {
    setSettings((prev) => ({
      ...prev,
      timings: {
        ...prev.timings,
        [day]: {
          ...prev.timings[day],
          isClosed: !prev.timings[day].isClosed,
        },
      },
    }));
  };

  const openTimePicker = (day: Day, field: 'open' | 'close') => {
    setPickerTarget({ day, field });
    setPickerVisible(true);
  };

  const selectTime = (time: string) => {
    if (!pickerTarget) return;
    const { day, field } = pickerTarget;
    setSettings((prev) => ({
      ...prev,
      timings: {
        ...prev.timings,
        [day]: { ...prev.timings[day], [field]: time },
      },
    }));
    setPickerVisible(false);
  };

  const toggleAmenity = (key: keyof ShopSettings['amenities']) => {
    setSettings((prev) => ({
      ...prev,
      amenities: { ...prev.amenities, [key]: !prev.amenities[key] },
    }));
  };

  /* ── save ── */
  const save = async () => {
    if (!shopId) {
      toast.error('No shop found');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'shops', shopId), {
        phone: settings.phone.trim(),
        about: settings.about.trim(),
        upiId: settings.upiId.trim(),
        holidays: settings.holidays,
        timings: settings.timings,
        amenities: settings.amenities,
        addressLine1: settings.addressLine1.trim(),
        addressLine2: settings.addressLine2.trim(),
        city: settings.city.trim(),
        stateRegion: settings.stateRegion.trim(),
        postalCode: settings.postalCode.trim(),
        country: settings.country.trim(),
        googleMapLink: settings.googleMapLink.trim(),
      });
      toast.success('Settings saved', 'Your shop settings have been updated.');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  /* ── render ── */
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {/* ── header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shop Settings</Text>
        <TouchableOpacity
          style={[styles.saveHeaderBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Save size={16} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Phone ── */}
        <SectionHeader
          icon={<Phone size={16} color={Colors.primary} />}
          label="Phone Number"
        />
        <TextInput
          style={styles.input}
          value={settings.phone}
          onChangeText={(v) => setSettings((p) => ({ ...p, phone: v }))}
          placeholder="Enter shop phone number"
          placeholderTextColor={Colors.textLight}
          keyboardType="phone-pad"
          maxLength={15}
        />

        {/* ── About ── */}
        <SectionHeader
          icon={<Info size={16} color={Colors.primary} />}
          label="About Your Salon"
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={settings.about}
          onChangeText={(v) => setSettings((p) => ({ ...p, about: v }))}
          placeholder="Tell customers about your salon…"
          placeholderTextColor={Colors.textLight}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* ── Location ── */}
        <SectionHeader
          icon={<MapPin size={16} color={Colors.primary} />}
          label="Shop Location"
        />
        <Text style={styles.sectionHint}>
          Enter your shop's full address to help customers find you easily.
        </Text>
        <TextInput
          style={[styles.input, { marginBottom: 12 }]}
          value={settings.addressLine1}
          onChangeText={(v) => setSettings((p) => ({ ...p, addressLine1: v }))}
          placeholder="Address Line 1 (e.g. Building, Street)"
          placeholderTextColor={Colors.textLight}
        />
        <TextInput
          style={[styles.input, { marginBottom: 12 }]}
          value={settings.addressLine2}
          onChangeText={(v) => setSettings((p) => ({ ...p, addressLine2: v }))}
          placeholder="Address Line 2 (Optional)"
          placeholderTextColor={Colors.textLight}
        />
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={settings.city}
            onChangeText={(v) => setSettings((p) => ({ ...p, city: v }))}
            placeholder="City"
            placeholderTextColor={Colors.textLight}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={settings.postalCode}
            onChangeText={(v) => setSettings((p) => ({ ...p, postalCode: v }))}
            placeholder="Postal Code"
            placeholderTextColor={Colors.textLight}
            keyboardType="number-pad"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={settings.stateRegion}
            onChangeText={(v) => setSettings((p) => ({ ...p, stateRegion: v }))}
            placeholder="State"
            placeholderTextColor={Colors.textLight}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={settings.country}
            onChangeText={(v) => setSettings((p) => ({ ...p, country: v }))}
            placeholder="Country"
            placeholderTextColor={Colors.textLight}
          />
        </View>
        <TextInput
          style={[styles.input, { marginBottom: 12 }]}
          value={settings.googleMapLink}
          onChangeText={(v) => setSettings((p) => ({ ...p, googleMapLink: v }))}
          placeholder="Google Maps Link (Optional)"
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
          keyboardType="url"
        />

        {/* ── Shop Timings ── */}
        <SectionHeader
          icon={<Clock size={16} color={Colors.primary} />}
          label="Shop Timings"
        />
        <Text style={styles.sectionHint}>
          Set opening & closing time for each day. Tap a day's status to toggle
          open / closed.
        </Text>
        <View style={styles.timingsCard}>
          {DAYS.map((day, idx) => {
            const t = settings.timings[day];
            const isHoliday = settings.holidays.includes(day);
            const isDimmed = t.isClosed || isHoliday;
            return (
              <View key={day}>
                {idx > 0 && <View style={styles.divider} />}
                <View style={styles.dayRow}>
                  {/* Day badge */}
                  <View
                    style={[
                      styles.dayBadge,
                      isDimmed && styles.dayBadgeClosed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayLabel,
                        isDimmed && styles.dayLabelClosed,
                      ]}
                    >
                      {day}
                    </Text>
                  </View>

                  {/* Open/Closed toggle */}
                  <TouchableOpacity
                    style={[
                      styles.statusToggle,
                      t.isClosed && !isHoliday && styles.statusToggleClosed,
                      isHoliday && styles.statusToggleHoliday,
                    ]}
                    onPress={() => !isHoliday && toggleDayClosed(day)}
                    disabled={isHoliday}
                  >
                    {isHoliday ? (
                      <XCircle size={13} color={Colors.textLight} />
                    ) : t.isClosed ? (
                      <XCircle size={13} color={Colors.error} />
                    ) : (
                      <CheckCircle2 size={13} color={Colors.success} />
                    )}
                    <Text
                      style={[
                        styles.statusToggleText,
                        t.isClosed && !isHoliday && { color: Colors.error },
                        isHoliday && { color: Colors.textLight },
                      ]}
                    >
                      {isHoliday ? 'Holiday' : t.isClosed ? 'Closed' : 'Open'}
                    </Text>
                  </TouchableOpacity>

                  {/* Time pickers (hidden when closed / holiday) */}
                  {!isDimmed && (
                    <View style={styles.timePickers}>
                      <TouchableOpacity
                        style={styles.timeChip}
                        onPress={() => openTimePicker(day, 'open')}
                      >
                        <Clock size={11} color={Colors.primary} />
                        <Text style={styles.timeChipText}>{t.open}</Text>
                        <ChevronDown size={10} color={Colors.textLight} />
                      </TouchableOpacity>
                      <Text style={styles.timeSep}>–</Text>
                      <TouchableOpacity
                        style={[styles.timeChip, styles.timeChipClose]}
                        onPress={() => openTimePicker(day, 'close')}
                      >
                        <Clock size={11} color={Colors.accent} />
                        <Text style={[styles.timeChipText, { color: Colors.accent }]}>
                          {t.close}
                        </Text>
                        <ChevronDown size={10} color={Colors.textLight} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Weekly Holidays ── */}
        <SectionHeader
          icon={<XCircle size={16} color={Colors.primary} />}
          label="Weekly Holidays"
        />
        <Text style={styles.sectionHint}>
          Tap a day to mark it as a weekly off. Bookings won't be allowed on
          these days.
        </Text>
        <View style={styles.holidayRow}>
          {DAYS.map((day) => {
            const active = settings.holidays.includes(day);
            return (
              <TouchableOpacity
                key={day}
                style={[styles.holidayChip, active && styles.holidayChipActive]}
                onPress={() => toggleHoliday(day)}
              >
                <Text
                  style={[
                    styles.holidayChipText,
                    active && styles.holidayChipTextActive,
                  ]}
                >
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Amenities ── */}
        <SectionHeader
          icon={<Thermometer size={16} color={Colors.primary} />}
          label="Amenities"
        />
        <View style={styles.amenityCard}>
          <AmenityRow
            icon={<Thermometer size={20} color={Colors.primary} />}
            title="Air Conditioning"
            subtitle="Salon has AC"
            value={settings.amenities.ac}
            onToggle={() => toggleAmenity('ac')}
          />
          <View style={styles.divider} />
          <AmenityRow
            icon={<Car size={20} color={Colors.primary} />}
            title="Parking Available"
            subtitle="Free parking nearby"
            value={settings.amenities.parking}
            onToggle={() => toggleAmenity('parking')}
          />
          <View style={styles.divider} />
          <AmenityRow
            icon={<Home size={20} color={Colors.primary} />}
            title="Home Service"
            subtitle="Visit customers at home"
            value={settings.amenities.homeService}
            onToggle={() => toggleAmenity('homeService')}
          />
        </View>

        {/* ── UPI ── */}
        <SectionHeader
          icon={<CreditCard size={16} color={Colors.primary} />}
          label="UPI ID"
        />
        <TextInput
          style={styles.input}
          value={settings.upiId}
          onChangeText={(v) => setSettings((p) => ({ ...p, upiId: v }))}
          placeholder="yoursalon@upi"
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={styles.upiHint}>For receiving customer payments</Text>

        {/* ── Save button ── */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Save size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>

      {/* ── Time Picker Modal ── */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPickerVisible(false)}
        />
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>
            {pickerTarget
              ? `${pickerTarget.day} — ${
                  pickerTarget.field === 'open' ? 'Opening' : 'Closing'
                } Time`
              : 'Select Time'}
          </Text>
          <FlatList
            data={TIME_OPTIONS}
            keyExtractor={(t) => t}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 320 }}
            getItemLayout={(_, index) => ({
              length: 50,
              offset: 50 * index,
              index,
            })}
            renderItem={({ item }) => {
              const isSelected =
                pickerTarget &&
                settings.timings[pickerTarget.day][pickerTarget.field] === item;
              return (
                <TouchableOpacity
                  style={[
                    styles.timeOption,
                    isSelected && styles.timeOptionSelected,
                  ]}
                  onPress={() => selectTime(item)}
                >
                  <Clock
                    size={14}
                    color={isSelected ? '#fff' : Colors.textLight}
                  />
                  <Text
                    style={[
                      styles.timeOptionText,
                      isSelected && styles.timeOptionTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                  {isSelected && <CheckCircle2 size={16} color="#fff" />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

/* ═══════════════════════ sub-components ═══════════════════════ */

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      {icon}
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function AmenityRow({
  icon,
  title,
  subtitle,
  value,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.amenityRow}>
      <View style={styles.amenityIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.amenityTitle}>{title}</Text>
        <Text style={styles.amenitySubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.border, true: Colors.primary }}
        thumbColor="#fff"
        ios_backgroundColor={Colors.border}
      />
    </View>
  );
}

/* ═══════════════════════════ styles ═══════════════════════════ */

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.background },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textLight,
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
  },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
  },
  saveHeaderBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* scroll */
  content: { padding: 16, paddingBottom: 40 },

  /* section */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  sectionHint: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: 'Poppins-Regular',
    marginBottom: 10,
    lineHeight: 17,
  },

  /* inputs */
  input: {
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
  },
  multiline: { height: 100, paddingTop: 12 },

  /* timings card */
  timingsCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
    flexWrap: 'wrap',
  },
  dayBadge: {
    width: 40,
    height: 26,
    borderRadius: 7,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeClosed: { backgroundColor: Colors.errorLight },
  dayLabel: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
  },
  dayLabelClosed: { color: Colors.error },

  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.successLight,
    borderWidth: 1,
    borderColor: Colors.successLight,
  },
  statusToggleClosed: {
    backgroundColor: Colors.errorLight,
    borderColor: Colors.errorLight,
  },
  statusToggleHoliday: {
    backgroundColor: Colors.backgroundLight,
    borderColor: Colors.border,
  },
  statusToggleText: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    color: Colors.success,
  },

  timePickers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'flex-end',
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeChipClose: {
    backgroundColor: '#FFF8E7',
  },
  timeChipText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
  },
  timeSep: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: 'Poppins-Regular',
  },

  /* holidays */
  holidayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  holidayChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  holidayChipActive: {
    borderColor: Colors.error,
    backgroundColor: Colors.errorLight,
  },
  holidayChipText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  holidayChipTextActive: { color: Colors.error },

  /* amenities */
  amenityCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  amenityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  amenityIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amenityTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  amenitySubtitle: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: 'Poppins-Regular',
  },

  /* upi */
  upiHint: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: 'Poppins-Regular',
    marginTop: 6,
  },

  /* save button */
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 28,
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#fff',
  },

  /* divider */
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 14,
  },

  /* time picker modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  pickerTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  timeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  timeOptionSelected: { backgroundColor: Colors.primary },
  timeOptionText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  timeOptionTextSelected: { color: '#fff' },
});
