import React, { useEffect, useMemo, useState } from 'react';
import { Modal, TextInput, TouchableOpacity, View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { addDoc, collection, getDocs, query, serverTimestamp, updateDoc, doc, where } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { ShieldCheck, X, Clock, User, Armchair, CheckCircle2, ChevronRight, UserCircle2, Scissors } from 'lucide-react-native';
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

  // Verification & Check-in Flow State
  const [verifyTarget, setVerifyTarget] = useState<any>(null);
  const [checkInStep, setCheckInStep] = useState<'verify' | 'seat' | 'barber' | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  
  // Resource tracking state
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);

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
        
        // Load staff for assignment
        const st = await getDocs(query(collection(db, 'staff'), where('shopId', 'in', ids)));
        setStaff(st.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
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

  const handleCheckInFlow = (booking: any) => {
    if (booking.status === 'in_service') {
      return;
    }
    
    setVerifyTarget(booking);
    
    if (!booking.verified && booking.verificationCode) {
      setCheckInStep('verify');
      setCodeInput('');
    } else {
      // Skip to seat if already verified or no verification code (walk-in)
      setCheckInStep('seat');
      setSelectedSeat(booking.assignedSeatId || booking.barberNumber || null);
    }
  };

  const submitVerification = async () => {
    if (!verifyTarget) return;
    if (codeInput.trim() !== String(verifyTarget.verificationCode)) {
      toast.error('Code does not match', "Double-check the code with the customer and try again.");
      return;
    }
    setVerifying(true);
    try {
      await updateDoc(doc(db, 'appointments', verifyTarget.id), {
        verified: true,
        verifiedAt: serverTimestamp(),
        verifiedBy: user?.uid || null,
      });
      setBookings(x => x.map(b => (b.id === verifyTarget.id ? { ...b, verified: true } : b)));
      setVerifyTarget((prev: any) => ({ ...prev, verified: true }));
      toast.success('Customer verified', 'Proceed to assign seat and barber.');
      
      // Move to next step
      setCheckInStep('seat');
      setSelectedSeat(verifyTarget.assignedSeatId || verifyTarget.barberNumber || null);
    } catch {
      toast.error('Could not update verification status');
    } finally {
      setVerifying(false);
    }
  };

  const submitSeatAssignment = () => {
    if (!selectedSeat) {
      toast.error('Select a seat');
      return;
    }
    setCheckInStep('barber');
    
    // Default barber selection: check assignedBarberId, then fallback to matching barberName
    let defaultBarberId = verifyTarget.assignedBarberId || null;
    if (!defaultBarberId && verifyTarget.barberName) {
      const matchedStaff = staff.find(s => s.shopId === verifyTarget.shopId && s.name === verifyTarget.barberName);
      if (matchedStaff) {
        defaultBarberId = matchedStaff.id;
      }
    }
    setSelectedBarberId(defaultBarberId);
  };
  
  const startService = async () => {
    if (!selectedBarberId) {
      toast.error('Select a barber');
      return;
    }
    setVerifying(true);
    try {
      await updateDoc(doc(db, 'appointments', verifyTarget.id), {
        status: 'in_service',
        assignedSeatId: selectedSeat,
        assignedBarberId: selectedBarberId,
        serviceStartTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setBookings(x => x.map(b => (b.id === verifyTarget.id ? { 
        ...b, 
        status: 'in_service', 
        assignedSeatId: selectedSeat,
        assignedBarberId: selectedBarberId,
      } : b)));
      toast.success('Service Started', `${verifyTarget.userName || 'Customer'} is now in service.`);
      setVerifyTarget(null);
      setCheckInStep(null);
    } catch {
      toast.error('Could not start service');
    } finally {
      setVerifying(false);
    }
  };

  const completeService = async (booking: any) => {
    try {
      await updateDoc(doc(db, 'appointments', booking.id), {
        status: 'completed',
        serviceEndTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setBookings(x => x.map(b => (b.id === booking.id ? { ...b, status: 'completed' } : b)));
      toast.success('Service Completed', 'Resources have been released.');
    } catch {
      toast.error('Update failed');
    }
  };

  const getShopCapacity = (shopId: string) => {
    const shop = shops.find(s => s.id === shopId);
    return shop?.capacity || 4;
  };
  
  // Active locked resources
  const activeBookings = bookings.filter(b => b.status === 'in_service');
  const lockedSeats = activeBookings.map(b => b.assignedSeatId).filter(Boolean);
  const lockedBarbers = activeBookings.map(b => b.assignedBarberId).filter(Boolean);

  return (
    <FeaturePage title="Salon Operations Centre" subtitle="Daily queue, staff and customer operations">
      <View style={s.panel}>
        <Text style={s.heading}>Quick walk-in</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Customer name" style={s.input} />
        <TextInput value={phone} onChangeText={setPhone} placeholder="Mobile number (optional)" keyboardType="phone-pad" style={s.input} />
        <FeatureCard title="Add to live queue" description="Creates a waiting appointment for the first active shop." onPress={addWalkIn} />
      </View>

      <FeatureCard
        title="Live check-in board"
        description={`${today.length} appointments today. Verify customers, assign seats & barbers.`}
        badge="Live"
      />
      {today.slice(0, 10).map(b => (
        <View key={b.id} style={s.appointmentCard}>
          <View style={s.cardHeader}>
            <Text style={s.customerName}>{b.userName || 'Customer'}</Text>
            {b.verified && (
              <View style={s.verifiedBadge}>
                <ShieldCheck size={12} color="#0a8f3c" />
                <Text style={s.verifiedBadgeText}>Verified</Text>
              </View>
            )}
          </View>
          
          <View style={s.serviceDetails}>
            <Text style={s.serviceName}>{b.serviceName || 'Service'}</Text>
            <View style={s.timeRow}>
              <Clock size={14} color={Colors.textLight} />
              <Text style={s.timeText}>
                {new Date(b.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>

          <View style={s.resourceRow}>
            <View style={s.resourceItem}>
              <Armchair size={16} color={b.assignedSeatId ? Colors.primary : Colors.textLight} />
              <Text style={[s.resourceText, b.assignedSeatId && s.resourceTextActive]}>
                {b.assignedSeatId ? `Seat ${b.assignedSeatId}` : 'No seat'}
              </Text>
            </View>
            <View style={s.resourceItem}>
              <User size={16} color={b.assignedBarberId ? Colors.primary : Colors.textLight} />
              <Text style={[s.resourceText, b.assignedBarberId && s.resourceTextActive]}>
                {b.assignedBarberId ? staff.find(s => s.id === b.assignedBarberId)?.name || 'Barber' : 'No barber'}
              </Text>
            </View>
          </View>

          <View style={s.actionRow}>
            {b.status === 'waiting' || b.status === 'pending' || b.status === 'confirmed' ? (
              <TouchableOpacity style={s.primaryButton} onPress={() => handleCheckInFlow(b)}>
                <Text style={s.primaryButtonText}>Check-in & Start</Text>
              </TouchableOpacity>
            ) : b.status === 'in_service' ? (
              <TouchableOpacity style={s.successButton} onPress={() => completeService(b)}>
                <CheckCircle2 size={16} color="#fff" />
                <Text style={s.successButtonText}>Complete Service</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.statusPill}>
                <Text style={s.statusPillText}>{b.status.toUpperCase()}</Text>
              </View>
            )}
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

      {/* Multi-step Check-in Modal */}
      <Modal visible={!!verifyTarget} transparent animationType="fade" onRequestClose={() => setVerifyTarget(null)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>
                {checkInStep === 'verify' ? 'Verify customer' : 
                 checkInStep === 'seat' ? 'Assign Seat' : 
                 'Assign Barber'}
              </Text>
              <TouchableOpacity onPress={() => setVerifyTarget(null)}>
                <X size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {checkInStep === 'verify' && (
              <View>
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
                  {verifying ? <ActivityIndicator color="#fff" /> : <Text style={s.verifyButtonText}>Verify & Continue</Text>}
                </TouchableOpacity>
              </View>
            )}

            {checkInStep === 'seat' && (
              <View>
                <Text style={s.modalSub}>Select an available seat for this service.</Text>
                <View style={s.resourceGrid}>
                  {Array.from({ length: getShopCapacity(verifyTarget?.shopId) }).map((_, i) => {
                    const seatNum = i + 1;
                    const isOccupied = lockedSeats.includes(seatNum) && verifyTarget?.assignedSeatId !== seatNum;
                    return (
                      <TouchableOpacity 
                        key={seatNum}
                        disabled={isOccupied}
                        style={[
                          s.resourceTile, 
                          selectedSeat === seatNum && s.resourceTileSelected,
                          isOccupied && s.resourceTileDisabled
                        ]}
                        onPress={() => setSelectedSeat(seatNum)}
                      >
                        <Armchair size={24} color={selectedSeat === seatNum ? '#fff' : isOccupied ? Colors.border : Colors.primary} />
                        <Text style={[
                          s.resourceTileText, 
                          selectedSeat === seatNum && s.resourceTileTextSelected,
                          isOccupied && s.resourceTileTextDisabled
                        ]}>
                          Seat {seatNum}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={s.verifyButton} onPress={submitSeatAssignment}>
                  <Text style={s.verifyButtonText}>Continue to Barber</Text>
                </TouchableOpacity>
              </View>
            )}

            {checkInStep === 'barber' && (
              <View>
                <Text style={s.modalSub}>Select an available barber. (Only available barbers are shown)</Text>
                <ScrollView style={{ maxHeight: 250, marginTop: 12 }}>
                  {staff.filter(s => s.shopId === verifyTarget?.shopId).filter(st => {
                    // Only show if not busy, OR if busy but assigned to THIS appointment
                    const isBusy = lockedBarbers.includes(st.id);
                    return !isBusy || verifyTarget?.assignedBarberId === st.id;
                  }).map(st => {
                    return (
                      <TouchableOpacity
                        key={st.id}
                        style={[
                          s.staffListItem,
                          selectedBarberId === st.id && s.staffListItemSelected,
                        ]}
                        onPress={() => setSelectedBarberId(st.id)}
                      >
                        <UserCircle2 size={24} color={selectedBarberId === st.id ? '#fff' : Colors.text} />
                        <Text style={[
                          s.staffListName,
                          selectedBarberId === st.id && s.staffListNameSelected,
                        ]}>
                          {st.name} {verifyTarget?.barberName === st.name ? '(Preferred)' : ''}
                        </Text>
                        {selectedBarberId === st.id && <CheckCircle2 size={20} color="#fff" />}
                      </TouchableOpacity>
                    );
                  })}
                  {staff.filter(s => s.shopId === verifyTarget?.shopId && lockedBarbers.includes(s.id) && verifyTarget?.assignedBarberId !== s.id).length > 0 && (
                     <Text style={{fontSize: 12, color: Colors.textLight, textAlign: 'center', marginTop: 10}}>Some barbers are currently busy and hidden.</Text>
                  )}
                </ScrollView>
                <TouchableOpacity style={s.verifyButton} onPress={startService} disabled={verifying}>
                  {verifying ? <ActivityIndicator color="#fff" /> : <Text style={s.verifyButtonText}>Start Service & Lock</Text>}
                </TouchableOpacity>
              </View>
            )}

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
  
  appointmentCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#f0f0f0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  customerName: { fontSize: 18, fontWeight: '800', color: Colors.text },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ecfdf3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  verifiedBadgeText: { fontSize: 11, fontWeight: '700', color: '#0a8f3c' },
  serviceDetails: { marginBottom: 16 },
  serviceName: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 13, color: Colors.textLight, fontWeight: '500' },
  
  resourceRow: { flexDirection: 'row', gap: 16, marginBottom: 16, backgroundColor: '#f8fafc', padding: 12, borderRadius: 12 },
  resourceItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resourceText: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  resourceTextActive: { color: Colors.primary },
  
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 16 },
  primaryButton: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  successButton: { backgroundColor: '#0a8f3c', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  successButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statusPill: { backgroundColor: '#f1f5f9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  statusPillText: { fontSize: 12, fontWeight: '700', color: Colors.textLight, letterSpacing: 0.5 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  modalSub: { fontSize: 14, color: Colors.textLight, lineHeight: 20 },
  
  codeInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, padding: 16, fontSize: 32, fontWeight: '800', letterSpacing: 12, textAlign: 'center', marginTop: 24 },
  verifyButton: { backgroundColor: Colors.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 24 },
  verifyButtonDisabled: { opacity: 0.5 },
  verifyButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  resourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20, justifyContent: 'center' },
  resourceTile: { width: '30%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#f8fafc', borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 8 },
  resourceTileSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  resourceTileDisabled: { opacity: 0.5 },
  resourceTileText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  resourceTileTextSelected: { color: '#fff' },
  resourceTileTextDisabled: { color: Colors.textLight },

  staffListItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, backgroundColor: '#f8fafc', marginBottom: 8 },
  staffListItemSelected: { backgroundColor: Colors.primary },
  staffListItemDisabled: { opacity: 0.5 },
  staffListName: { fontSize: 15, fontWeight: '600', color: Colors.text, flex: 1, marginLeft: 12 },
  staffListNameSelected: { color: '#fff' },
  staffListNameDisabled: { color: Colors.textLight },
});
