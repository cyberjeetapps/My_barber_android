import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { query, collection, where, getDocs, setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { ArrowLeft, Clock, Calendar, User, CreditCard, Scissors, CheckCircle, Store, Users } from 'lucide-react-native';
import { db } from '@/config/firebase';
import Colors from '@/constants/Colors';
import { RefreshControl } from 'react-native';
import { useAuth } from '@/context/auth';

interface Appointment {
  id: string;
  barberNumber: number;
  createdAt: string;
  dateTime: string;
  paymentMethod: string;
  paymentStatus: string;
  serviceDescription: string;
  serviceId: string;
  serviceImageUrl: string;
  serviceName: string;
  servicePrice: number;
  shopId: string;
  shopLocation: string;
  shopName: string;
  status: string;
  updatedAt: string;
  userId: string;
  userName: string;
  userPhone: string;
  isFamilyBooking?: boolean;
  familySize?: number;
  totalPrice?: number;
  members?: Array<{
    barberNumber: number;
    memberName: string;
    memberNumber: number;
    status: string;
  }>;
}

export default function OfflinePayments() {
  const router = useRouter();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState<string | null>(null); // Track which appointment is loading
  const [pageLoading, setPageLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ownerShops, setOwnerShops] = useState<string[]>([]);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [currentAppointment, setCurrentAppointment] = useState<Appointment | null>(null);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpResent, setOtpResent] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<Date | null>(null);
  const [remainingTime, setRemainingTime] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    if (otpModalVisible && otpExpiresAt) {
      timer = setInterval(() => {
        const now = new Date();
        const diffMs = otpExpiresAt.getTime() - now.getTime();

        if (diffMs <= 0) {
          setRemainingTime('Expired');
          clearInterval(timer);
        } else {
          const diffMins = Math.floor(diffMs / 60000);
          const diffSecs = Math.floor((diffMs % 60000) / 1000);
          setRemainingTime(`Expires in ${diffMins}m ${diffSecs}s`);
        }
      }, 1000);
    }

    return () => clearInterval(timer);
  }, [otpModalVisible, otpExpiresAt]);

  useEffect(() => {
    fetchOwnerShops();
  }, []);

  useEffect(() => {
    if (otpModalVisible && currentAppointment) {
      const checkExpiration = setInterval(async () => {
        const otpDoc = await getDoc(doc(db, 'otps', currentAppointment.userId));
        if (!otpDoc.exists() || otpDoc.data()?.used) {
          setOtpModalVisible(false);
          clearInterval(checkExpiration);
        }
      }, 10000);
      
      return () => clearInterval(checkExpiration);
    }
  }, [otpModalVisible, currentAppointment]);

  const fetchOwnerShops = async () => {
    try {
      setPageLoading(true);
      if (!user?.uid) return;
      
      const shopsQuery = query(
        collection(db, 'shops'),
        where('ownerId', '==', user.uid)
      );
      const shopsSnapshot = await getDocs(shopsQuery);
      
      const shopIds = shopsSnapshot.docs.map(doc => doc.id);
      setOwnerShops(shopIds);
      
      if (shopIds.length > 0) {
        await fetchCashPayments(shopIds);
      } else {
        setAppointments([]);
      }
    } catch (error) {
      console.error('Error fetching owner shops:', error);
      Alert.alert('Error', 'Failed to load your shops');
    } finally {
      setPageLoading(false);
    }
  };

  const fetchCashPayments = async (shopIds: string[]) => {
    try {
      const cashPayments: Appointment[] = [];
      
      const appointmentsQuery = query(
        collection(db, 'appointments'),
        where('shopId', 'in', shopIds),
        where('paymentMethod', '==', 'cash')
      );
      const appointmentsSnapshot = await getDocs(appointmentsQuery);
      
      appointmentsSnapshot.forEach((doc) => {
        const data = doc.data();
        cashPayments.push({
          id: doc.id,
          barberNumber: data.barberNumber || 0,
          createdAt: data.createdAt?.toDate?.().toString() || '',
          dateTime: data.dateTime || '',
          paymentMethod: data.paymentMethod || '',
          paymentStatus: data.paymentStatus || '',
          serviceDescription: data.serviceDescription || '',
          serviceId: data.serviceId || '',
          serviceImageUrl: data.serviceImageUrl || '',
          serviceName: data.serviceName || '',
          servicePrice: data.servicePrice || 0,
          shopId: data.shopId || '',
          shopLocation: data.shopLocation || '',
          shopName: data.shopName || '',
          status: data.status || '',
          updatedAt: data.updatedAt?.toDate?.().toString() || '',
          userId: data.userId || '',
          userName: data.userName || '',
          userPhone: data.userPhone || '',
          isFamilyBooking: false
        });
      });

      const familyQuery = query(
        collection(db, 'familybookings'),
        where('shopId', 'in', shopIds),
        where('paymentMethod', '==', 'cash')
      );
      const familySnapshot = await getDocs(familyQuery);
      
      familySnapshot.forEach((doc) => {
        const data = doc.data();
        cashPayments.push({
          id: doc.id,
          barberNumber: data.members?.[0]?.barberNumber || 0,
          createdAt: data.createdAt?.toDate?.().toString() || data.createdAt || '',
          dateTime: data.dateTime || '',
          paymentMethod: data.paymentMethod || '',
          paymentStatus: data.paymentStatus || '',
          serviceDescription: data.serviceDescription || '',
          serviceId: data.serviceId || '',
          serviceImageUrl: data.serviceImageUrl || '',
          serviceName: data.serviceName || '',
          servicePrice: data.servicePrice || 0,
          shopId: data.shopId || '',
          shopLocation: data.shopLocation || '',
          shopName: data.shopName || '',
          status: data.status || '',
          updatedAt: data.updatedAt?.toDate?.().toString() || data.updatedAt || '',
          userId: data.userId || '',
          userName: data.userName || '',
          userPhone: data.userPhone || '',
          isFamilyBooking: true,
          familySize: data.familySize || 0,
          totalPrice: data.totalPrice || 0,
          members: data.members || []
        });
      });

      // Sort appointments: pending first, then paid
      const sortedAppointments = [...cashPayments].sort((a, b) => {
        if (a.paymentStatus === 'paid' && b.paymentStatus !== 'paid') return 1;
        if (a.paymentStatus !== 'paid' && b.paymentStatus === 'paid') return -1;
        return 0;
      });

      setAppointments(sortedAppointments);
    } catch (error) {
      console.error('Error fetching cash payments:', error);
      Alert.alert('Error', 'Failed to load cash payments');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOwnerShops();
    setRefreshing(false);
  };

  const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const sendPushNotification = async (expoPushToken: string, message: string) => {
    const notificationBody = {
      to: expoPushToken,
      sound: 'default',
      title: 'Your OTP Code',
      body: message,
      data: { screen: 'OtpVerification' },
    };

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notificationBody),
    });
  };

  const sendOtp = async (appointment: Appointment) => {
    try {
      setOtpLoading(true);
      const otp = generateOtp();
      
      // Calculate expiration time (3 minutes from now)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 3);
      
      // Create or update the OTP document using the user's ID as the document ID
      await setDoc(doc(db, 'otps', appointment.userId), {
        otp,
        expiresAt,
        appointmentId: appointment.id,
        userId: appointment.userId,
        userName: appointment.userName,
        userPhone: appointment.userPhone,
        createdAt: new Date(),
        serviceName: appointment.serviceName,
        servicePrice: appointment.isFamilyBooking ? appointment.totalPrice : appointment.servicePrice,
        shopName: appointment.shopName,
      });
      
      setOtpExpiresAt(expiresAt);
      setOtpResent(false);

      // Try to send push notification
      const tokenQuery = query(
        collection(db, 'pushTokens'),
        where('phoneNumber', '==', appointment.userPhone)
      );
      const tokenSnapshot = await getDocs(tokenQuery);

      if (!tokenSnapshot.empty) {
        const tokenData = tokenSnapshot.docs[0].data();
        const expoPushToken = tokenData.token;
        await sendPushNotification(
          expoPushToken,
          `Your OTP is ${otp}. It expires in 3 minutes.`
        );
      }

      Alert.alert(
        'OTP Sent',
        `A 6-digit OTP has been sent to ${appointment.userPhone}. It will expire in 3 minutes.`,
        [{ text: 'OK', onPress: () => setOtpModalVisible(true) }]
      );
      
    } catch (error) {
      console.error('Error sending OTP:', error);
      Alert.alert('Error', 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleMarkAsPaid = async (appointment: Appointment) => {
    setCurrentAppointment(appointment);
    setLoading(appointment.id); // Set loading state for this specific appointment
    await sendOtp(appointment);
    setLoading(null); // Reset loading state
  };

  const verifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      setOtpError('Please enter a valid 6-digit OTP');
      return;
    }
    
    try {
      setOtpLoading(true);
      
      if (!currentAppointment) return;
      
      // Get the OTP document from Firestore using the user's ID
      const otpDoc = await getDoc(doc(db, 'otps', currentAppointment.userId));
      
      if (!otpDoc.exists()) {
        setOtpError('OTP expired or invalid. Please resend.');
        return;
      }
      
      const otpData = otpDoc.data();
      
      // Check if OTP is expired
      if (otpData.expired || new Date(otpData.expiresAt.toDate()) < new Date()) {
        setOtpError('OTP has expired. Please resend.');
        return;
      }
      
      // Check if OTP matches
      if (otp !== otpData.otp) {
        setOtpError('Incorrect OTP. Please try again.');
        return;
      }
      
      // Check if this OTP is for the current appointment
      if (otpData.appointmentId !== currentAppointment.id) {
        setOtpError('This OTP is for a different appointment. Please request a new one.');
        return;
      }
      
      // Mark payment as paid
      const collectionName = currentAppointment.isFamilyBooking ? 'familybookings' : 'appointments';
      setLoading(currentAppointment.id); // Set loading state for this specific appointment
      await updateDoc(doc(db, collectionName, currentAppointment.id), {
        paymentStatus: 'paid',
        updatedAt: new Date().toISOString(),
      });
      
      // Mark OTP as used
      await updateDoc(doc(db, 'otps', currentAppointment.userId), { 
        used: true,
        usedAt: new Date(),
        usedForAppointment: currentAppointment.id 
      });
      
      setOtpModalVisible(false);
      setOtp('');
      setOtpError('');
      
      await fetchOwnerShops();
      Alert.alert('Success', 'Payment marked as received successfully');
    } catch (error) {
      console.error('Error verifying OTP:', error);
      Alert.alert('Error', 'Could not verify OTP. Please try again.');
    } finally {
      setOtpLoading(false);
      setLoading(null); // Reset loading state
    }
  };

  const resendOtp = async () => {
    if (!currentAppointment) return;
    setOtpResent(true);
    setLoading(currentAppointment.id); // Set loading state for this specific appointment
    await sendOtp(currentAppointment);
    setOtp('');
    setOtpError('');
    setLoading(null); // Reset loading state
  };

  const formatDateTime = (dateTimeString: string) => {
    try {
      const date = new Date(dateTimeString);
      return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return dateTimeString;
    }
  };

  return (
    <View style={styles.container}>
      {pageLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}

      {/* Header - Removed Animated.View */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Offline Payments</Text>
          <Text style={styles.headerSubtitle}>Manage cash payments for your shops</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
          />
        }
      >
        {ownerShops.length === 0 && !pageLoading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No shops assigned to you</Text>
          </View>
        ) : appointments.length === 0 && !pageLoading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No cash payments found for your shops</Text>
          </View>
        ) : (
          appointments.map((appointment) => (
            // Removed Animated.View and replaced with regular View
            <View
              key={appointment.id}
              style={[
                styles.paymentCard,
                appointment.paymentStatus === 'paid' && styles.paidCard,
                appointment.paymentStatus !== 'paid' && styles.pendingCard,
              ]}
            >
              <View style={styles.paymentHeader}>
                <View>
                  <Text style={styles.paymentTitle}>{appointment.serviceName}</Text>
                  <View style={styles.statusContainer}>
                    {appointment.isFamilyBooking && (
                      <View style={styles.familyBadge}>
                        <Users size={14} color={Colors.primary} />
                        <Text style={styles.familyBadgeText}>Family ({appointment.familySize})</Text>
                      </View>
                    )}
                    {appointment.paymentStatus === 'paid' ? (
                      <View style={styles.paidBadge}>
                        <CheckCircle size={16} color={Colors.success} />
                        <Text style={styles.paidBadgeText}>Paid</Text>
                      </View>
                    ) : (
                      <View style={styles.pendingBadge}>
                        <Clock size={16} color={Colors.warning} />
                        <Text style={styles.pendingBadgeText}>Pending</Text>
                      </View>
                    )}
                  </View>
                </View>
                {appointment.paymentStatus !== 'paid' && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleMarkAsPaid(appointment)}
                    disabled={loading === appointment.id || otpLoading}
                  >
                    {loading === appointment.id ? (
                      <ActivityIndicator color={Colors.background} size="small" />
                    ) : (
                      <Text style={styles.actionButtonText}>Mark Paid</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.paymentDescription}>{appointment.serviceDescription}</Text>

              <View style={styles.paymentDetails}>
                <View style={styles.detailItem}>
                  <User size={18} color={Colors.text} />
                  <Text style={styles.detailText}>{appointment.userName}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Calendar size={18} color={Colors.text} />
                  <Text style={styles.detailText}>
                    {formatDateTime(appointment.dateTime)}
                  </Text>
                </View>

                {appointment.isFamilyBooking ? (
                  <>
                    <View style={styles.detailItem}>
                      <Users size={18} color={Colors.text} />
                      <Text style={styles.detailText}>
                        {appointment.familySize} members
                      </Text>
                    </View>
                    <View style={styles.detailItem}>
                      <CreditCard size={18} color={Colors.text} />
                      <Text style={styles.detailText}>
                        ₹{appointment.totalPrice} (Cash)
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.detailItem}>
                      <Scissors size={18} color={Colors.text} />
                      <Text style={styles.detailText}>
                        Barber #{appointment.barberNumber}
                      </Text>
                    </View>
                    <View style={styles.detailItem}>
                      <CreditCard size={18} color={Colors.text} />
                      <Text style={styles.detailText}>
                        ₹{appointment.servicePrice} (Cash)
                      </Text>
                    </View>
                  </>
                )}

                <View style={styles.detailItem}>
                  <Store size={18} color={Colors.text} />
                  <Text style={styles.detailText}>{appointment.shopName}</Text>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* OTP Verification Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={otpModalVisible}
        onRequestClose={() => {
          setOtpModalVisible(false);
          setOtp('');
          setOtpError('');
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Verify OTP</Text>
            <Text style={styles.modalSubtitle}>
              Enter the 6-digit OTP sent to {currentAppointment?.userPhone}
            </Text>
            {otpExpiresAt && (
              <Text style={styles.otpTimer}>{remainingTime}</Text>
            )}

            
            <TextInput
              style={[styles.otpInput, otpError ? styles.otpInputError : null]}
              placeholder="Enter OTP"
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={(text) => {
                setOtp(text);
                setOtpError('');
              }}
              autoFocus
            />
            
            {otpError ? (
              <Text style={styles.errorText}>
                {otpError}
                {otpError.includes('expired') && (
                  <Text onPress={resendOtp} style={{ color: Colors.primary }}>
                    {' '}Resend OTP
                  </Text>
                )}
              </Text>
            ) : null}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setOtpModalVisible(false);
                  setOtp('');
                  setOtpError('');
                }}
                disabled={otpLoading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.verifyButton]}
                onPress={verifyOtp}
                disabled={otpLoading}
              >
                {otpLoading ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.verifyButtonText}>Verify</Text>
                )}
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity onPress={resendOtp} disabled={otpLoading || otpResent}>
              <Text style={styles.resendText}>
                {otpResent ? 'OTP Resent!' : 'Resend OTP'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: Colors.background,
  },
  backButton: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  paymentCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  paidCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  pendingCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  paymentTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  familyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
    alignSelf: 'flex-start',
  },
  familyBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
    marginLeft: 4,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  paidBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.success,
    marginLeft: 4,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  pendingBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.warning,
    marginLeft: 4,
  },
  actionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    height: 36,
    justifyContent: 'center',
    minWidth: 100,
    alignItems: 'center',
  },
  actionButtonText: {
    color: Colors.background,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
  },
  paymentDescription: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginBottom: 16,
    lineHeight: 20,
  },
  paymentDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textLight,
    fontFamily: 'Poppins-Regular',
  },
  bottomSpacer: {
    height: 80,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginBottom: 8,
    textAlign: 'center',
  },
  otpTimer: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: Colors.warning,
    textAlign: 'center',
    marginBottom: 16,
  },
  otpInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 16,
    fontSize: 18,
    fontFamily: 'Poppins-Medium',
    textAlign: 'center',
    marginBottom: 16,
  },
  otpInputError: {
    borderColor: Colors.error,
  },
  errorText: {
    color: Colors.error,
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  cancelButtonText: {
    color: Colors.text,
    fontFamily: 'Poppins-SemiBold',
  },
  verifyButton: {
    backgroundColor: Colors.primary,
    marginLeft: 8,
  },
  verifyButtonText: {
    color: Colors.background,
    fontFamily: 'Poppins-SemiBold',
  },
  resendText: {
    color: Colors.primary,
    fontFamily: 'Poppins-Medium',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});