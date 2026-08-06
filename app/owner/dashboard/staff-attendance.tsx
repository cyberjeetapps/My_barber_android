import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { ArrowLeft, Clock, LogIn, LogOut, Calendar } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import { toast } from '@/utils/toast';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const todayKey = () => new Date().toISOString().slice(0, 10);

type StaffMember = {
  id: string;
  name: string;
  shopName?: string;
  shiftStart?: string;
  shiftEnd?: string;
  weeklyOff?: number[];
};

type Attendance = { checkInAt?: string; checkOutAt?: string; status?: string };

export default function StaffAttendance() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [loading, setLoading] = useState(true);
  const [editingShift, setEditingShift] = useState<string | null>(null);
  const [shiftDraft, setShiftDraft] = useState({ shiftStart: '', shiftEnd: '' });

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const shopsSnap = await getDocs(query(collection(db, 'shops'), where('ownerId', '==', user.uid)));
      const shops = shopsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as any));

      const allStaff: StaffMember[] = [];
      for (const shop of shops) {
        const staffSnap = await getDocs(query(collection(db, 'staff'), where('shopId', '==', shop.id)));
        staffSnap.forEach((d) => allStaff.push({ id: d.id, ...(d.data() as any), shopName: shop.shopName } as StaffMember));
      }
      setStaff(allStaff);

      if (allStaff.length) {
        const attSnap = await getDocs(
          query(collection(db, 'staffAttendance'), where('date', '==', todayKey()))
        );
        const map: Record<string, Attendance> = {};
        attSnap.docs.forEach((d) => {
          const data = d.data();
          if (allStaff.some((s) => s.id === data.staffId)) map[data.staffId] = data;
        });
        setAttendance(map);
      }
    } catch (err) {
      console.error('Failed to load staff attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const attendanceDocId = (staffId: string) => `${staffId}_${todayKey()}`;

  const checkIn = async (staffMember: StaffMember) => {
    try {
      await setDoc(doc(db, 'staffAttendance', attendanceDocId(staffMember.id)), {
        staffId: staffMember.id,
        staffName: staffMember.name,
        date: todayKey(),
        checkInAt: new Date().toISOString(),
        status: 'present',
      });
      setAttendance((prev) => ({ ...prev, [staffMember.id]: { ...prev[staffMember.id], checkInAt: new Date().toISOString(), status: 'present' } }));
      toast.success(`${staffMember.name} checked in`);
    } catch {
      toast.error('Check-in failed');
    }
  };

  const checkOut = async (staffMember: StaffMember) => {
    try {
      await updateDoc(doc(db, 'staffAttendance', attendanceDocId(staffMember.id)), {
        checkOutAt: new Date().toISOString(),
      });
      setAttendance((prev) => ({ ...prev, [staffMember.id]: { ...prev[staffMember.id], checkOutAt: new Date().toISOString() } }));
      toast.success(`${staffMember.name} checked out`);
    } catch {
      toast.error('Check-out failed');
    }
  };

  const markLeave = async (staffMember: StaffMember) => {
    try {
      await setDoc(doc(db, 'staffAttendance', attendanceDocId(staffMember.id)), {
        staffId: staffMember.id,
        staffName: staffMember.name,
        date: todayKey(),
        status: 'on_leave',
      });
      setAttendance((prev) => ({ ...prev, [staffMember.id]: { status: 'on_leave' } }));
      toast.info(`${staffMember.name} marked on leave today`);
    } catch {
      toast.error('Could not mark leave');
    }
  };

  const openShiftEditor = (staffMember: StaffMember) => {
    setEditingShift(staffMember.id);
    setShiftDraft({ shiftStart: staffMember.shiftStart || '09:00', shiftEnd: staffMember.shiftEnd || '19:00' });
  };

  const saveShift = async (staffMember: StaffMember) => {
    try {
      await updateDoc(doc(db, 'staff', staffMember.id), {
        shiftStart: shiftDraft.shiftStart,
        shiftEnd: shiftDraft.shiftEnd,
      });
      setStaff((prev) => prev.map((s) => (s.id === staffMember.id ? { ...s, ...shiftDraft } : s)));
      setEditingShift(null);
      toast.success('Shift updated');
    } catch {
      toast.error('Could not update shift');
    }
  };

  const toggleWeeklyOff = async (staffMember: StaffMember, dayIndex: number) => {
    const current = staffMember.weeklyOff || [];
    const next = current.includes(dayIndex) ? current.filter((d) => d !== dayIndex) : [...current, dayIndex];
    try {
      await updateDoc(doc(db, 'staff', staffMember.id), { weeklyOff: next });
      setStaff((prev) => prev.map((s) => (s.id === staffMember.id ? { ...s, weeklyOff: next } : s)));
    } catch {
      toast.error('Could not update weekly off');
    }
  };

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <ArrowLeft color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Staff shifts & attendance</Text>
          <Text style={styles.subtitle}>{new Date().toLocaleDateString([], { dateStyle: 'medium' })}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {staff.length === 0 ? (
            <Text style={styles.empty}>No staff added yet — add staff from Staff & Chairs first.</Text>
          ) : (
            staff.map((s) => {
              const att = attendance[s.id];
              const isOnLeave = att?.status === 'on_leave';
              const isCheckedIn = !!att?.checkInAt && !att?.checkOutAt;
              const isDone = !!att?.checkOutAt;

              return (
                <View key={s.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.staffName}>{s.name}</Text>
                    <View style={[
                      styles.statusPill,
                      isOnLeave && styles.pillLeave,
                      isCheckedIn && styles.pillActive,
                      isDone && styles.pillDone,
                    ]}>
                      <Text style={styles.statusPillText}>
                        {isOnLeave ? 'On leave' : isDone ? 'Checked out' : isCheckedIn ? 'Working' : 'Not checked in'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>{s.shopName}</Text>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, (isCheckedIn || isDone || isOnLeave) && styles.actionBtnDisabled]}
                      onPress={() => checkIn(s)}
                      disabled={isCheckedIn || isDone || isOnLeave}
                    >
                      <LogIn size={14} color={isCheckedIn || isDone || isOnLeave ? Colors.textLight : Colors.primary} />
                      <Text style={styles.actionBtnText}>Check in</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, !isCheckedIn && styles.actionBtnDisabled]}
                      onPress={() => checkOut(s)}
                      disabled={!isCheckedIn}
                    >
                      <LogOut size={14} color={!isCheckedIn ? Colors.textLight : Colors.primary} />
                      <Text style={styles.actionBtnText}>Check out</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => markLeave(s)}>
                      <Calendar size={14} color={Colors.primary} />
                      <Text style={styles.actionBtnText}>Mark leave</Text>
                    </TouchableOpacity>
                  </View>

                  {editingShift === s.id ? (
                    <View style={styles.shiftEditor}>
                      <TextInput
                        style={styles.shiftInput}
                        value={shiftDraft.shiftStart}
                        onChangeText={(t) => setShiftDraft((d) => ({ ...d, shiftStart: t }))}
                        placeholder="09:00"
                      />
                      <Text style={styles.shiftDash}>–</Text>
                      <TextInput
                        style={styles.shiftInput}
                        value={shiftDraft.shiftEnd}
                        onChangeText={(t) => setShiftDraft((d) => ({ ...d, shiftEnd: t }))}
                        placeholder="19:00"
                      />
                      <TouchableOpacity style={styles.shiftSave} onPress={() => saveShift(s)}>
                        <Text style={styles.shiftSaveText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => openShiftEditor(s)} style={styles.shiftRow}>
                      <Clock size={14} color={Colors.textLight} />
                      <Text style={styles.shiftText}>
                        {s.shiftStart && s.shiftEnd ? `${s.shiftStart} – ${s.shiftEnd}` : 'Set shift hours'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.weeklyOffRow}>
                    {WEEKDAYS.map((day, i) => (
                      <TouchableOpacity
                        key={day}
                        onPress={() => toggleWeeklyOff(s, i)}
                        style={[styles.dayChip, (s.weeklyOff || []).includes(i) && styles.dayChipOff]}
                      >
                        <Text style={[styles.dayChipText, (s.weeklyOff || []).includes(i) && styles.dayChipTextOff]}>{day}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.weeklyOffHint}>Tap a day to mark it as this staff member's weekly off</Text>
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
  title: { fontSize: 19, fontWeight: '700', color: Colors.text },
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  staffName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: '#f2f4f7' },
  pillActive: { backgroundColor: '#ecfdf3' },
  pillDone: { backgroundColor: '#eef4ff' },
  pillLeave: { backgroundColor: '#fef3f2' },
  statusPillText: { fontSize: 10, fontWeight: '700', color: '#475467' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: 11, fontWeight: '600', color: Colors.text },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  shiftText: { fontSize: 12, color: Colors.textLight },
  shiftEditor: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  shiftInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 70,
    fontSize: 12,
  },
  shiftDash: { color: Colors.textLight },
  shiftSave: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  shiftSaveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  weeklyOffRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  dayChip: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: '#f5f7ff' },
  dayChipOff: { backgroundColor: Colors.error },
  dayChipText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  dayChipTextOff: { color: '#fff' },
  weeklyOffHint: { fontSize: 10, color: Colors.textLight, marginTop: 6 },
});
