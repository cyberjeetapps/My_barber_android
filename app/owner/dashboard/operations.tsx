import React, { useEffect, useMemo, useState } from 'react';
import { Modal, TextInput, TouchableOpacity, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { addDoc, collection, getDocs, query, serverTimestamp, updateDoc, doc, where } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { ShieldCheck, X } from 'lucide-react-native';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import { FeaturePage, FeatureCard, Pill } from '@/components/FeatureUI';
import { toast } from '@/utils/toast';

export default function OwnerOperations() {
  const { user } = useAuth();
  const router = useRouter();
  const [shops, setShops] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [name, setName] = useState('Walk-in customer');
  const [phone, setPhone] = useState('');

  // Check-in verification — gates only the "in progress" transition,
  // since that's the one moment identity actually matters (the customer is
  // physically in front of the owner claiming to be who booked).
  const [verifyTarget, setVerifyTarget] = useState<any>(null);
  const [codeInput, setCodeInput] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      const ss = await getDocs(query(collection(db, 'shops'), where('ownerId', '==', user.uid)));
      const sh = ss.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setShops(sh);
      if (sh.length) {
        const ids = sh.map(x => x.id).slice(0, 30);
        const bs = await getDocs(query(collection(db, 'appointments'), where('shopId', 'in', ids)));
        setBookings(bs.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }
    })().catch(console.warn);
  }, [user?.uid]);

  const today = useMemo(
    () => bookings.filter(b => b.dateTime && new Date(b.dateTime).toDateString() === new Date().toDateString()),
    [bookings]
  );

  const addWalkIn = async () => {
    if (!user?.uid || !shops[0]) return toast.info('Shop required', 'Add or select an owner shop first.');
    try {
      // Walk-ins skip verification entirely — the owner is looking at the
      // customer in person while creating this, there's no "is this really
      // them" question to answer, unlike a booking made remotely in-app.
      await addDoc(collection(db, 'appointments'), {
        shopId: shops[0].id,
        shopName: shops[0].name || shops[0].shopName || 'Salon',
        ownerId: user.uid,
        userName: name.trim() || 'Walk-in customer',
        phoneNumber: phone.trim(),
        serviceName: 'Walk-in service',
        dateTime: new Date().toISOString(),
        status: 'waiting',
        source: 'walk_in',
        queueJoinedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      toast.success('Walk-in added', 'Customer has been added to the live queue.');
      setPhone('');
    } catch {
      toast.error('Unable to add', 'Check Firestore rules for appointments.');
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, 'appointments', id), {
        status,
        updatedAt: serverTimestamp(),
        [`${status}At`]: serverTimestamp(),
      });
      setBookings(x => x.map(b => (b.id === id ? { ...b, status } : b)));
    } catch {
      toast.error('Update failed');
    }
  };

  const handlePillPress = (booking: any, status: string) => {
    // "In progress" is the one transition that needs verification, and
    // only for a real in-app booking that actually has a code — walk-ins
    // never get one, and older bookings from before this feature existed
    // won't either, so those fall back to a plain status change instead
    // of a dead end waiting for a code that was never generated.
    if (status === 'in_service' && booking.verificationCode && !booking.verified) {
      setVerifyTarget(booking);
      setCodeInput('');
      return;
    }
    updateStatus(booking.id, status);
  };

  const submitVerification = async () => {
    if (!verifyTarget) return;
    if (codeInput.trim() !== String(verifyTarget.verificationCode)) {
      toast.error('Code does not match', "Double-check the code with the customer and try again.");
      return;
    }
    setVerifying(true);
    try {
      // Verified customers go straight to "in progress" — there's no
      // separate waiting-room step in a typical salon visit between
      // being confirmed and service actually starting.
      await updateDoc(doc(db, 'appointments', verifyTarget.id), {
        status: 'in_service',
        verified: true,
        verifiedAt: serverTimestamp(),
        verifiedBy: user?.uid || null,
        updatedAt: serverTimestamp(),
      });
      setBookings(x => x.map(b => (b.id === verifyTarget.id ? { ...b, status: 'in_service', verified: true } : b)));
      toast.success('Customer verified', `${verifyTarget.userName || 'Customer'} is now in progress.`);
      setVerifyTarget(null);
    } catch {
      toast.error('Could not update status');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <FeaturePage title="Salon Operations Centre" subtitle="Daily queue, staff and customer operations">
      <View style={s.panel}>
        <Text style={s.heading}>Quick walk-in</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Customer name" style={s.input} />
        <TextInput value={phone} onChangeText={setPhone} placeholder="Mobile number (optional)" keyboardType="phone-pad" style={s.input} />
        <FeatureCard title="Add to live queue" description="Creates a waiting appointment for the first active shop." onPress={addWalkIn} />
      </View>

      <FeatureCard
        title="Live queue board"
        description={`${today.length} appointments today. "In progress" asks for the customer's 4-digit code first.`}
        badge="Live"
      />
      {today.slice(0, 10).map(b => (
        <View key={b.id} style={s.queue}>
          <View style={s.queueTop}>
            <Text style={s.qTitle}>{b.userName || 'Customer'} · {b.serviceName || 'Service'}</Text>
            {b.verified && (
              <View style={s.verifiedBadge}>
                <ShieldCheck size={12} color="#0a8f3c" />
                <Text style={s.verifiedBadgeText}>Verified</Text>
              </View>
            )}
          </View>
          <View style={s.pills}>
            {['waiting', 'in_service', 'completed', 'no_show'].map(st => (
              <Pill key={st} label={st === 'in_service' ? 'in progress' : st.replace('_', ' ')} active={b.status === st} onPress={() => handlePillPress(b, st)} />
            ))}
          </View>
        </View>
      ))}

      <FeatureCard title="Staff shifts & attendance" description="Check staff in/out, mark leave, set shift hours and weekly off." onPress={() => router.push('/owner/dashboard/staff-attendance')} />
      <FeatureCard title="Blocked time slots" description="Block a chair, a break, or a full closure — removed from customer booking automatically." onPress={() => router.push('/owner/dashboard/blocked-slots')} />
      <FeatureCard title="No-show history" description="See every recorded no-show, with repeat-offender counts." onPress={() => router.push('/owner/dashboard/no-shows')} />
      <FeatureCard
        title="Owner support"
        description="Raise payment, dispute, technical, settlement or verification tickets."
        onPress={async () => {
          if (!user?.uid) return;
          await addDoc(collection(db, 'supportTickets'), {
            createdBy: user.uid,
            createdByRole: 'owner',
            category: 'technical',
            priority: 'normal',
            status: 'open',
            subject: 'Owner support request',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          toast.success('Ticket created');
        }}
      />
      <FeatureCard title="Daily closing summary" description="Completed, cancelled, cash vs online revenue and pending payments for today." onPress={() => router.push('/owner/dashboard/daily-closing')} />
      <FeatureCard title="Chair performance" description="Completed services, revenue, ratings and no-shows per chair." onPress={() => router.push('/owner/dashboard/staff-performance')} />

      <Modal visible={!!verifyTarget} transparent animationType="fade" onRequestClose={() => setVerifyTarget(null)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Verify customer</Text>
              <TouchableOpacity onPress={() => setVerifyTarget(null)}>
                <X size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalSub}>
              Ask {verifyTarget?.userName || 'the customer'} for their 4-digit check-in code —
              it's shown on their appointment in the app.
            </Text>
            <TextInput
              style={s.codeInput}
              value={codeInput}
              onChangeText={(t) => setCodeInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="0000"
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
            />
            <TouchableOpacity
              style={[s.verifyButton, codeInput.length !== 4 && s.verifyButtonDisabled]}
              onPress={submitVerification}
              disabled={codeInput.length !== 4 || verifying}
            >
              {verifying ? <ActivityIndicator color="#fff" /> : <Text style={s.verifyButtonText}>Verify & check in</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </FeaturePage>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 14 },
  heading: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, marginBottom: 9 },
  queue: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  queueTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qTitle: { fontWeight: '700', fontSize: 15, flex: 1 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ecfdf3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  verifiedBadgeText: { fontSize: 10, fontWeight: '700', color: '#0a8f3c' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 18, padding: 20, width: '100%', maxWidth: 340 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalSub: { fontSize: 13, color: Colors.textLight, marginTop: 8, lineHeight: 18 },
  codeInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
    marginTop: 16,
  },
  verifyButton: { backgroundColor: Colors.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 16 },
  verifyButtonDisabled: { opacity: 0.5 },
  verifyButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
