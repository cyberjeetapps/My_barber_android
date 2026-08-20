import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, Platform, TextInput, Linking } from 'react-native';
import { Image } from 'expo-image'; // cached image loading instead of RN's uncached Image
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { Calendar, Clock, MapPin, X, ChevronRight, Star, CreditCard, ShoppingBag, CalendarPlus, Navigation, Repeat2, ReceiptText } from 'lucide-react-native';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { openCashfreeCheckout } from '@/utils/cashfreeCheckout';
import { useLanguage } from '@/context/LanguageContext';
import { toast } from '@/utils/toast';
import { cancelAppointmentReminders } from '@/utils/appointmentReminders';
import { releaseTimeslotChair } from '@/utils/timeslotAvailability';
import { addAppointmentToCalendar, openShopDirections, shareBookingReceipt } from '@/utils/simpleCustomerFeatures';

const BUSINESS_HOURS = {
  start: 9,
  end: 20,
  interval: 30,
};
const MAX_BARBERS = 10;

export default function AppointmentsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { highlight: highlightId } = useLocalSearchParams<{ highlight?: string }>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const upcomingRef = useRef<View>(null);
  const highlightOffsets = useRef<Record<string, number>>({});
  const hasScrolledToHighlight = useRef(false);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [pastAppointments, setPastAppointments] = useState<any[]>([]);
  const [familyBookings, setFamilyBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchasedPackages, setPurchasedPackages] = useState<any[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<any[]>([]);
  const { language, translate } = useLanguage();

  // Reschedule state
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [rescheduleDate, setRescheduleDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<any>(null);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<any[]>([]);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [bookingsPerSlot, setBookingsPerSlot] = useState<any>({});
  // const RAZORPAY_BACKEND_URL = 'https://mybarber.co.in';
  const RAZORPAY_BACKEND_URL = 'https://my-barber-backend.onrender.com';
// Temporary test - use IP instead of domain
// const RAZORPAY_BACKEND_URL = 'http://34.93.185.38:5000';
// const RAZORPAY_BACKEND_URL = 'https://razorpay-backend-d0zt.onrender.com';
// Review state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAppointment, setReviewAppointment] = useState<any>(null);
  const [reviewText, setReviewText] = useState('');
  const [rating, setRating] = useState(0);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  
  // Payment state
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false); // Add this line

  // Translated UI texts
  const [uiTexts, setUiTexts] = useState({
    appointmentsTitle: 'Appointments',
    appointmentsSubtitle: 'Manage your bookings and packages',
    myPackages: 'My Packages',
    noPackages: 'No packages purchased',
    browsePackages: 'Browse Packages',
    upcomingAppointments: 'Upcoming Appointments',
    noUpcoming: 'No upcoming appointments',
    bookNow: 'Book Now',
    pastAppointments: 'Past Appointments',
    noPast: 'No past appointments',
    rescheduleTitle: 'Reschedule Appointment',
    leaveReviewTitle: 'Leave a Review',
    yourRating: 'Your Rating',
    yourReview: 'Your Review',
    reviewPlaceholder: 'Tell us about your experience...',
    submitReview: 'Submit Review',
    completePayment: 'Complete Payment',
    payNow: 'Pay Now',
    paymentSuccess: 'Payment successful!',
    includes: 'Includes:',
    purchased: 'Purchased:',
    giveReview: 'Give Review',
    barber: 'Barber',
    newBarber: 'New Barber',
    currentSlot: 'Current slot',
    spotsLeft: 'spots left',
    confirmReschedule: 'Confirm Reschedule',
    rescheduling: 'Rescheduling...',
    submitting: 'Submitting...',
    deleteAppointment: 'Delete Appointment',
    deleteConfirm: 'Are you sure you want to delete this appointment?',
    cancel: 'Cancel',
    delete: 'Delete',
    makePayment: 'Make Payment',
    rescheduleButton: 'Reschedule',
    availableTimeSlots: 'Available Time Slots',
    packageFor: 'package for',
    appointmentRescheduled: 'Appointment rescheduled with',
    familyBookings: 'Family Bookings',
    noFamilyBookings: 'No family bookings',
  });

  useEffect(() => {
    const translateUI = async () => {
      if (language === 'en') {
        setUiTexts(prev => ({
          ...prev,
          appointmentsTitle: 'Appointments',
          appointmentsSubtitle: 'Manage your bookings and packages',
          myPackages: 'My Packages',
          noPackages: 'No packages purchased',
          browsePackages: 'Browse Packages',
          upcomingAppointments: 'Upcoming Appointments',
          noUpcoming: 'No upcoming appointments',
          bookNow: 'Book Now',
          pastAppointments: 'Past Appointments',
          noPast: 'No past appointments',
          rescheduleTitle: 'Reschedule Appointment',
          leaveReviewTitle: 'Leave a Review',
          yourRating: 'Your Rating',
          yourReview: 'Your Review',
          reviewPlaceholder: 'Tell us about your experience...',
          submitReview: 'Submit Review',
          completePayment: 'Complete Payment',
          payNow: 'Pay Now',
          paymentSuccess: 'Payment successful!',
          includes: 'Includes:',
          purchased: 'Purchased:',
          giveReview: 'Give Review',
          barber: 'Barber',
          newBarber: 'New Barber',
          currentSlot: 'Current slot',
          spotsLeft: 'spots left',
          confirmReschedule: 'Confirm Reschedule',
          rescheduling: 'Rescheduling...',
          submitting: 'Submitting...',
          deleteAppointment: 'Delete Appointment',
          deleteConfirm: 'Are you sure you want to delete this appointment?',
          cancel: 'Cancel',
          delete: 'Delete',
          makePayment: 'Make Payment',
          rescheduleButton: 'Reschedule',
          availableTimeSlots: 'Available Time Slots',
          packageFor: 'package for',
          appointmentRescheduled: 'Appointment rescheduled with',
          familyBookings: 'Family Bookings',
          noFamilyBookings: 'No family bookings',
        }));
      } else {
        const translated = await Promise.all([
          translate('Appointments'),
          translate('Manage your bookings and packages'),
          translate('My Packages'),
          translate('No packages purchased'),
          translate('Browse Packages'),
          translate('Upcoming Appointments'),
          translate('No upcoming appointments'),
          translate('Book Now'),
          translate('Past Appointments'),
          translate('No past appointments'),
          translate('Reschedule Appointment'),
          translate('Leave a Review'),
          translate('Your Rating'),
          translate('Your Review'),
          translate('Tell us about your experience...'),
          translate('Submit Review'),
          translate('Complete Payment'),
          translate('Pay Now'),
          translate('Payment successful!'),
          translate('Includes:'),
          translate('Purchased:'),
          translate('Give Review'),
          translate('Barber'),
          translate('New Barber'),
          translate('Current slot'),
          translate('spots left'),
          translate('Confirm Reschedule'),
          translate('Rescheduling...'),
          translate('Submitting...'),
          translate('Delete Appointment'),
          translate('Are you sure you want to delete this appointment?'),
          translate('Cancel'),
          translate('Delete'),
          translate('Make Payment'),
          translate('Reschedule'),
          translate('Available Time Slots'),
          translate('package for'),
          translate('Appointment rescheduled with'),
          translate('Family Bookings'),
          translate('No family bookings'),
        ]);
        
        setUiTexts(prev => ({
          ...prev,
          appointmentsTitle: translated[0],
          appointmentsSubtitle: translated[1],
          myPackages: translated[2],
          noPackages: translated[3],
          browsePackages: translated[4],
          upcomingAppointments: translated[5],
          noUpcoming: translated[6],
          bookNow: translated[7],
          pastAppointments: translated[8],
          noPast: translated[9],
          rescheduleTitle: translated[10],
          leaveReviewTitle: translated[11],
          yourRating: translated[12],
          yourReview: translated[13],
          reviewPlaceholder: translated[14],
          submitReview: translated[15],
          completePayment: translated[16],
          payNow: translated[17],
          paymentSuccess: translated[18],
          includes: translated[19],
          purchased: translated[20],
          giveReview: translated[21],
          barber: translated[22],
          newBarber: translated[23],
          currentSlot: translated[24],
          spotsLeft: translated[25],
          confirmReschedule: translated[26],
          rescheduling: translated[27],
          submitting: translated[28],
          deleteAppointment: translated[29],
          deleteConfirm: translated[30],
          cancel: translated[31],
          delete: translated[32],
          makePayment: translated[33],
          rescheduleButton: translated[34],
          availableTimeSlots: translated[35],
          packageFor: translated[36],
          appointmentRescheduled: translated[37],
          familyBookings: translated[38],
          noFamilyBookings: translated[39],
        }));
      }
    };

    translateUI();
  }, [language]);

  // Enhanced error handling for UPI payments
// Payment error handler
const handlePaymentError = (error) => {
  console.error('Payment Error Details:', error);

  let devErrorMessage = `Code: ${error.code || 'N/A'}\nDescription: ${error.description || error.message || 'Unknown error'}`;

  switch (error.code) {
    case 'NETWORK_ERROR':
      toast.error('Network error', 'Please check your internet connection.');
      break;
    case 'BAD_REQUEST_ERROR':
      toast.error('Invalid details', 'Please check your payment details and try again.');
      break;
    case 'UPI_APP_NOT_INSTALLED':
      toast.error('UPI app required', 'Please install a UPI app like Google Pay, PhonePe, or Paytm.');
      break;
    case 'PAYMENT_CANCELLED':
      console.log('Payment cancelled by user', 'Payment was cancelled. You can try again anytime.');
      break;
    default:
      toast.error('Payment failed', 'Payment was cancelled. You can try again anytime.');
  }
};

const handlePayment = async (appointment) => {
  if (paymentProcessing || verifyingPayment) return;
  if (!user) return;
  setPaymentProcessing(true);

  try {
    console.log('Starting payment for appointment:', appointment.id);

    // 1️⃣ Create Razorpay order on backend
    const response = await fetch(`${RAZORPAY_BACKEND_URL}/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        amount: appointment.totalPrice ?? appointment.servicePrice,
        currency: 'INR',
        receipt: `rcptid_${appointment.id}`,
        notes: {
          appointment_id: appointment.id,
          service: appointment.serviceName,
          user_id: user.uid
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const { orderId, paymentSessionId, amount, currency } = await response.json();
    console.log('Cashfree order created:', orderId);

    // 3️⃣ Open Cashfree checkout
    openCashfreeCheckout(paymentSessionId, orderId)
      .then(async (data) => {
        console.log('Payment response:', data);

        if (data.success) {
          // 4️⃣ Start verification process
          setVerifyingPayment(true);
          
          try {
            const verifyResponse = await fetch(`${RAZORPAY_BACKEND_URL}/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_id: data.orderId
              })
            });

            const result = await verifyResponse.json();

            if (result.success) {
              // 5️⃣ Update Firestore
              try {
                await updateDoc(doc(db, 'appointments', appointment.id), {
                  paymentStatus: 'paid',
                  paymentDate: new Date().toISOString(),
                  razorpayPaymentId: result.paymentId,
                  paymentMethod: result.paymentMethod || 'online'
                });
              } catch (firestoreError) {
                console.error('Firestore update failed:', firestoreError);
              }

              setSuccessMessage('Payment successful!');
              setShowSuccess(true);
              fetchAppointments();

              setTimeout(() => setShowSuccess(false), 3000);
            } else {
              toast.error('Verification failed', 'Payment could not be verified. Please contact support.');
            }
          } catch (verifyError) {
            console.error('Payment verification error:', verifyError);
            toast.error('Verification error', 'Failed to verify payment. Please check your payment status.');
          } finally {
            setVerifyingPayment(false);
          }
        } else {
          console.log('Payment cancelled by user or failed:', data);
        }
      })
      .catch(handlePaymentError);

  } catch (error: any) {
    console.error('Payment initiation error:', error);
    toast.error('Error', error.message || 'Failed to initiate payment. Please try again.');
  } finally {
    setPaymentProcessing(false);
  }
};

const handleFamilyPayment = async (booking) => {
  if (paymentProcessing || verifyingPayment) return; // Add verifyingPayment check
  if (!user) return;
  setPaymentProcessing(true);

  try {
    const response = await fetch(`${RAZORPAY_BACKEND_URL}/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: booking.totalPrice,
        currency: 'INR',
        receipt: `rcptid_family_${booking.id}`,
        notes: {
          booking_id: booking.id,
          service: booking.serviceName,
          user_id: user.uid,
          family_size: booking.familySize
        }
      })
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const { orderId, paymentSessionId, amount, currency } = await response.json();

    openCashfreeCheckout(paymentSessionId, orderId)
      .then(async (data) => {
        console.log('Family payment data:', data);

        if (data.success) {
          setVerifyingPayment(true); // Add this line
          try {
            const verifyResponse = await fetch(`${RAZORPAY_BACKEND_URL}/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_id: data.orderId
              }),
            });

            const result = await verifyResponse.json();

            if (result.success) {
              try {
                await updateDoc(doc(db, 'familybookings', booking.id), {
                  paymentStatus: 'paid',
                  paymentDate: new Date().toISOString(),
                  razorpayPaymentId: result.paymentId,
                  paymentMethod: result.paymentMethod || 'online'
                });
              } catch (firestoreError) {
                console.error('Firestore update failed:', firestoreError);
              }

              setSuccessMessage('Payment successful!');
              setShowSuccess(true);
              fetchAppointments();

              setTimeout(() => setShowSuccess(false), 3000);
            } else {
              toast.error('Verification failed', 'Payment could not be verified.');
            }
          } catch (error) {
            console.error('Family payment verification error:', error);
            toast.error('Verification error', 'Failed to verify payment.');
          } finally {
            setVerifyingPayment(false); // Add this line
          }
        }
      })
      .catch(handlePaymentError);

  } catch (error) {
    console.error('Family payment initiation failed:', error);
    toast.error('Error', 'Failed to initiate payment. Please try again.');
  } finally {
    setPaymentProcessing(false);
  }
};


const handlePackagePayment = async (pkg) => {
  if (paymentProcessing || verifyingPayment) return; // Add verifyingPayment check
  if (!user) return;

  setPaymentProcessing(true);

  try {
    const response = await fetch(`${RAZORPAY_BACKEND_URL}/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: pkg.price,
        currency: 'INR',
        receipt: `rcptid_package_${pkg.id}`,
        notes: {
          package_id: pkg.id,
          package_name: pkg.packageName,
          user_id: user.uid
        }
      })
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const { orderId, paymentSessionId, amount, currency } = await response.json();

    const paymentData = await openCashfreeCheckout(paymentSessionId, orderId);

    // Start verification process
    setVerifyingPayment(true);
    
    try {
      const verifyResponse = await fetch(`${RAZORPAY_BACKEND_URL}/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: paymentData.orderId
        }),
      });

      const result = await verifyResponse.json();

      if (result.success) {
        try {
          await updateDoc(doc(db, 'package_purchases', pkg.id), {
            paymentStatus: 'paid',
            paymentDate: new Date().toISOString(),
            razorpayPaymentId: result.paymentId,
            status: 'active',
            paymentMethod: result.paymentMethod || 'online'
          });
        } catch (firestoreError) {
          console.error('Firestore update failed:', firestoreError);
        }

        setSuccessMessage('Payment successful!');
        setShowSuccess(true);
        fetchAppointments();

        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        toast.error('Verification failed', 'Payment could not be verified.');
      }
    } catch (verifyError) {
      console.error('Package payment verification error:', verifyError);
      toast.error('Verification error', 'Failed to verify payment. Please check your payment status.');
    } finally {
      setVerifyingPayment(false);
    }

  } catch (error) {
    console.error('Package Payment Error:', error);
    handlePaymentError(error);
  } finally {
    setPaymentProcessing(false);
  }
};

  const handleOpenReview = (appointment) => {
    setReviewAppointment(appointment);
    setReviewText('');
    setRating(0);
    setShowReviewModal(true);
  };

  const handleSubmitReview = async () => {
    if (!reviewText || rating === 0) {
      toast.info('Missing info', 'Please provide both a rating and review text');
      return;
    }
    if (!user) return;

    setReviewSubmitting(true);
    try {
      await addDoc(collection(db, 'Pending reviews'), {
        appointmentId: reviewAppointment.id,
        userId: user.uid,
        userName: user.name || 'Anonymous',
        barberId: reviewAppointment.barberId || 'unknown',
        barberNumber: reviewAppointment.barberNumber,
        serviceName: reviewAppointment.serviceName,
        shopId: reviewAppointment.shopId,
        shopName: reviewAppointment.shopName,
        rating: rating,
        review: reviewText,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      await updateDoc(doc(db, 'appointments', reviewAppointment.id), {
        reviewed: true
      });

      setShowReviewModal(false);
      setSuccessMessage('Thank you for your review!');
      setShowSuccess(true);
      fetchAppointments();

      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error submitting review:', error);
      toast.error('Error', 'Failed to submit review. Please try again.');
    } finally {
      setReviewSubmitting(false);
    }
  };

const renderPackage = (pkg, index, isUpcoming = false, isPast = false) => {
  const packageName = language === 'en' ? pkg.packageName : pkg.languagePackageName || pkg.packageName;
  const packageDescription = language === 'en' ? pkg.packageDescription : pkg.languagePackageDescription || pkg.packageDescription;
  const shopName = language === 'en' ? pkg.shopName : pkg.languageShopName || pkg.shopName;
  const services = language === 'en' ? pkg.services : pkg.languageServices || pkg.services;

  const isPaid = pkg.paymentStatus === 'paid';
  const isExpired = pkg.status === 'expired' || (pkg.expiryDate && new Date(pkg.expiryDate) < new Date());

  return (
    <Animated.View 
      key={pkg.id}
      entering={FadeInUp.delay(300 + (index * 100)).duration(500)}
      style={[
        styles.packageCard,
        isPaid && !isExpired ? styles.paidPackageCard : styles.pendingPackageCard,
        isExpired && styles.expiredPackageCard
      ]}
    >
      <Image 
        source={{ uri: pkg.imageUrl }} 
        style={styles.barberImage} 
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
      
      <View style={styles.appointmentContent}>
        <View style={styles.appointmentHeader}>
          <Text style={styles.serviceName}>{packageName}</Text>
          {isPaid && (
            <Text style={[styles.statusText1, { color: Colors.success }]}>
              PAID
            </Text>
          )}
        </View>
        
        {shopName && (
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <ShoppingBag size={14} color={Colors.primary} />
              <Text style={styles.detailText}>{shopName}</Text>
            </View>
          </View>
        )}
        
        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Calendar size={14} color={Colors.primary} />
            <Text style={styles.detailText}>
              {uiTexts.purchased} {new Date(pkg.purchaseDate).toLocaleDateString()}
            </Text>
          </View>
        </View>
        
        <View style={styles.detailItem}>
          <Text style={styles.priceText}>₹{pkg.price}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailText}>
            {packageDescription || 'Premium service package'}
          </Text>
        </View>

        <View style={styles.servicesContainer}>
          <Text style={styles.servicesTitle}>{uiTexts.includes}</Text>
          {services?.map((service, i) => (
            <View key={i} style={styles.serviceItem}>
              <Text style={styles.serviceText}>• {service}</Text>
            </View>
          ))}
        </View>
        
      <View>
  {isExpired && (
    <View style={[styles.statusBadge, { backgroundColor: `${Colors.error}20` }]}>
      <Text style={[styles.statusText, { color: Colors.error }]}>
        EXPIRED
      </Text>
    </View>
  )}

  {isPaid && !isExpired && (
    <View style={[styles.statusBadge, { backgroundColor: `${Colors.success}20` }]}>
      <Text style={[styles.statusText, { color: Colors.success }]}>
        ACTIVE
      </Text>
    </View>
  )}
</View>


       {!isPaid && !isExpired && (
  <View style={styles.actionButtonsContainer}>
    <TouchableOpacity 
      style={[styles.paymentButton1, (paymentProcessing || verifyingPayment) && styles.disabledButton]}
      onPress={() => handlePackagePayment(pkg)}
      disabled={paymentProcessing || verifyingPayment}
    >
      {paymentProcessing ? (
        <ActivityIndicator size="small" color="white" />
      ) : verifyingPayment ? (
        <>
          <Text style={styles.paymentButtonText}>Verifying...</Text>
          <ActivityIndicator size="small" color="white" />
        </>
      ) : (
        <>
          <Text style={styles.paymentButtonText}>Pay ₹{pkg.price}</Text>
          <CreditCard size={16} color="white" />
        </>
      )}
    </TouchableOpacity>
  </View>
)}
      </View>
    </Animated.View>
  );
};
  // const renderFamilyBooking = (booking, index, isUpcoming = false) => {
  //   const serviceName = language === 'en' ? booking.serviceName : booking.languageServiceName || booking.serviceName;
  //   const shopName = language === 'en' ? booking.shopName : booking.languageShopName || booking.shopName;

  //   return (
  //     <Animated.View 
  //       key={booking.id} 
  //       entering={FadeInUp.delay(300 + (index * 100)).duration(500)}
  //       style={[
  //         styles.appointmentCard, 
  //         isUpcoming && styles.upcomingCard,
  //         booking.status === 'completed' && styles.completedCard
  //       ]}
  //     >
  //       <Image 
  //         source={{ uri: booking.serviceImageUrl || 'https://via.placeholder.com/80' }} 
  //         style={styles.barberImage} 
  //       />
        
  //       <View style={styles.appointmentContent}>
  //         <View style={styles.appointmentHeader}>
  //           <Text style={styles.serviceName}>{serviceName} (Family Booking)</Text>
            
  //           <View style={styles.statusContainer}>
  //             {booking.paymentStatus === 'paid' && (
  //               <View style={[styles.statusBadge1, { backgroundColor: `${Colors.success}` }]}>
  //                 <Text style={[styles.statusText1, { color: Colors.success }]}>
  //                   PAID
  //                 </Text>
  //               </View>
  //             )}
  //             {isUpcoming && booking.status === 'pending' && (
  //               <TouchableOpacity 
  //                 style={styles.cancelButton} 
  //                 onPress={() => handleDeleteFamilyBooking(booking.id)}
  //               >
  //                 <X size={20} color={Colors.error} />
  //               </TouchableOpacity>
  //             )}
              
  //             <View style={[
  //               styles.statusBadge,
  //               { backgroundColor: `${getStatusColor(booking.status)}20` }
  //             ]}>
  //               <Text style={[
  //                 styles.statusText,
  //                 { color: getStatusColor(booking.status) }
  //               ]}>
  //                 {booking.status.toUpperCase()}
  //               </Text>
  //             </View>
  //           </View>
  //         </View>
                
  //         <View style={styles.appointmentDetails}>
  //           <View style={styles.detailRow}>
  //             <View style={styles.detailItem}>
  //               <Calendar size={14} color={Colors.primary} />
  //               <Text style={styles.detailText}>
  //                 {new Date(booking.dateTime).toLocaleDateString('en-US', {
  //                   weekday: 'short',
  //                   month: 'short',
  //                   day: 'numeric'
  //                 })}
  //               </Text>
  //             </View>
              
  //             <View style={styles.detailItem}>
  //               <Clock size={14} color={Colors.primary} />
  //               <Text style={styles.detailText}>
  //                 {new Date(booking.dateTime).toLocaleTimeString([], { 
  //                   hour: '2-digit', 
  //                   minute: '2-digit',
  //                   hour12: true 
  //                 })}
  //               </Text>
  //             </View>
  //           </View>
            
  //           <View style={styles.detailRow}>
  //             <View style={styles.detailItem}>
  //               <MapPin size={14} color={Colors.primary} />
  //               <Text style={styles.detailText}>
  //                 {shopName}
  //               </Text>
  //             </View>
              
  //             <View style={styles.detailItem}>
  //               <Text style={styles.priceText}>₹{booking.totalPrice}</Text>
  //             </View>
  //           </View>
            
  //           <View style={styles.detailRow}>
  //             <Text style={styles.detailText}>Family Size: {booking.familySize}</Text>
  //           </View>
  //         </View>
          
  //         {isUpcoming && (
  //           <View style={styles.actionButtonsContainer}>
  //             {booking.paymentStatus !== 'paid' && (
  //               <TouchableOpacity 
  //                 style={styles.paymentButton}
  //                 onPress={() => handleFamilyPayment(booking)}
  //               >
  //                 <Text style={styles.paymentButtonText}>Pay ₹{booking.totalPrice}</Text>
  //                 <CreditCard size={16} color="white" />
  //               </TouchableOpacity>
  //             )}
              
  //             <TouchableOpacity 
  //               style={[
  //                 styles.rescheduleButton,
  //                 booking.paymentStatus === 'paid' && { marginLeft: 0 }
  //               ]} 
  //               onPress={() => handleRescheduleFamilyBooking(booking)}
  //             >
  //               <Text style={styles.rescheduleText}>{uiTexts.rescheduleButton}</Text>
  //               <ChevronRight size={16} color="white" />
  //             </TouchableOpacity>
  //           </View>
  //         )}

  //         {!isUpcoming && booking.status === 'completed' && !booking.reviewed && (
  //           <TouchableOpacity 
  //             style={styles.reviewButton} 
  //             onPress={() => handleOpenReview(booking)}
  //           >
  //             <Text style={styles.reviewButtonText}>{uiTexts.giveReview}</Text>
  //             <Star size={16} color={Colors.primary} />
  //           </TouchableOpacity>
  //         )}
  //       </View>
  //     </Animated.View>
  //   );
  // };
 const renderAppointment = (appointment, index, isUpcoming = false) => {
    // Handle packages in past appointments
    if (appointment.isPackage) {
      return renderPackage(appointment, index, false, true);
    }
    // Handle language-specific text
    const serviceName = language === 'en' ? appointment.serviceName : appointment.languageServiceName || appointment.serviceName;
    const shopName = language === 'en' ? appointment.shopName : appointment.languageShopName || appointment.shopName;

    return (
      <Animated.View 
        key={appointment.id} 
        entering={FadeInUp.delay(300 + (index * 100)).duration(500)}
        onLayout={(e) => { highlightOffsets.current[appointment.id] = e.nativeEvent.layout.y; }}
        style={[
          styles.appointmentCard, 
          isUpcoming && styles.upcomingCard,
          appointment.status === 'completed' && styles.completedCard,
          appointment.isFamilyBooking && styles.familyCard,
          highlightId === appointment.id && styles.deepLinkedCard,
        ]}
      >
        <Image 
          source={{ uri: appointment.serviceImageUrl || 'https://via.placeholder.com/80' }} 
          style={styles.barberImage} 
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
        
        <View style={styles.appointmentContent}>
          <View style={styles.appointmentHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.serviceName}>{serviceName}</Text>
            </View>
            
            <View style={styles.statusContainer}>
              {appointment.paymentStatus === 'paid' && (
                <View style={[styles.statusBadge, { backgroundColor: `${Colors.success}20` }]}>
                  <Text style={[styles.statusText1, { color: Colors.success }]}>
                    PAID
                  </Text>
                </View>
              )}
              {isUpcoming && appointment.status === 'pending' && (
                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={() => 
                    appointment.isFamilyBooking 
                      ? handleDeleteFamilyBooking(appointment)
                      : handleDelete(appointment)
                  }
                >
                  <X size={20} color={Colors.error} />
                </TouchableOpacity>
              )}
              
              <View style={[
                styles.statusBadge,
                { backgroundColor: `${getStatusColor(appointment.status)}20` }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: getStatusColor(appointment.status) }
                ]}>
                  {appointment.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
                
          <View style={styles.appointmentDetails}>
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Calendar size={14} color={Colors.primary} />
                <Text style={styles.detailText}>
                  {appointment.dateTime.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </Text>
              </View>
              
              <View style={styles.detailItem}>
                <Clock size={14} color={Colors.primary} />
                <Text style={styles.detailText}>
                  {appointment.dateTime.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                  })}
                </Text>
              </View>
            </View>
            
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <MapPin size={14} color={Colors.primary} />
                <Text style={styles.detailText}>
                  {shopName}
                </Text>
              </View>
            </View>
             <View style={styles.detailItem}>
                <Text style={styles.priceText}>
                  ₹{appointment.totalPrice ?? appointment.servicePrice}
                </Text>
              </View>
            
            {appointment.isFamilyBooking && (
              <View style={styles.detailRow}>
                <Text style={styles.detailText}>Family Size: {appointment.familySize}</Text>
              </View>
            )}

            {isUpcoming && appointment.verificationCode && !appointment.verified && appointment.status !== 'cancelled' && (
              <View style={styles.verificationCodeBox}>
                <Text style={styles.verificationCodeLabel}>Show this code at the salon to check in</Text>
                <Text style={styles.verificationCodeValue}>{appointment.verificationCode}</Text>
              </View>
            )}
          </View>
          
      {isUpcoming && (
  <View style={styles.actionButtonsContainer}>
    {/* Only show payment button if payment method is online and status is pending */}
    {appointment.paymentStatus !== 'paid' && appointment.paymentMethod === 'online' && (
      <TouchableOpacity 
        style={[styles.paymentButton, (paymentProcessing || verifyingPayment) && styles.disabledButton]}
        onPress={() => 
          appointment.isFamilyBooking 
            ? handleFamilyPayment(appointment)
            : handlePayment(appointment)
        }
        disabled={paymentProcessing || verifyingPayment}
      >
        {paymentProcessing ? (
          <ActivityIndicator size="small" color="white" />
        ) : verifyingPayment ? (
          <>
            <Text style={styles.paymentButtonText}>Verifying...</Text>
            <ActivityIndicator size="small" color="white" />
          </>
        ) : (
          <>
            <Text style={styles.paymentButtonText}>
              Pay ₹{appointment.totalPrice ?? appointment.servicePrice}
            </Text>
            <CreditCard size={16} color="white" />
          </>
        )}
      </TouchableOpacity>
    )}
    
    {/* Always show reschedule button for upcoming appointments */}
    <TouchableOpacity 
      style={[
        styles.rescheduleButton,
        (appointment.paymentStatus === 'paid' || appointment.paymentMethod === 'cash') && { marginLeft: 0 }
      ]} 
      onPress={() => 
        appointment.isFamilyBooking 
          ? handleRescheduleFamilyBooking(appointment)
          : handleReschedule(appointment)
      }
    >
      <Text style={styles.rescheduleText}>{uiTexts.rescheduleButton}</Text>
      <ChevronRight size={16} color="white" />
    </TouchableOpacity>
  </View>
)}
          {!isUpcoming && appointment.status === 'completed' && !appointment.reviewed && (
            <TouchableOpacity 
              style={styles.reviewButton} 
              onPress={() => handleOpenReview(appointment)}
            >
              <Text style={styles.reviewButtonText}>{uiTexts.giveReview}</Text>
              <Star size={16} color={Colors.primary} />
            </TouchableOpacity>
          )}

          <View style={styles.quickActionsRow}>
            {isUpcoming ? (
              <TouchableOpacity style={styles.quickActionButton} onPress={() => addAppointmentToCalendar(appointment)}>
                <CalendarPlus size={16} color={Colors.primary} />
                <Text style={styles.quickActionText}>Add to Calendar</Text>
              </TouchableOpacity>
            ) : (
              !appointment.isFamilyBooking && !appointment.isPackage && (
                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={() => router.push({
                    pathname: '/services',
                    params: {
                      rebook: '1',
                      serviceId: appointment.serviceId || '',
                      shopId: appointment.shopId || '',
                    },
                  })}
                >
                  <Repeat2 size={16} color={Colors.primary} />
                  <Text style={styles.quickActionText}>Book Again</Text>
                </TouchableOpacity>
              )
            )}

            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => openShopDirections({
                shopName: appointment.shopName,
                shopLocation: appointment.shopLocation,
                googleMapLink: appointment.googleMapLink,
                latitude: appointment.latitude,
                longitude: appointment.longitude,
              })}
            >
              <Navigation size={16} color={Colors.primary} />
              <Text style={styles.quickActionText}>Directions</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionButton} onPress={() => shareBookingReceipt(appointment)}>
              <ReceiptText size={16} color={Colors.primary} />
              <Text style={styles.quickActionText}>Receipt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };


  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return Colors.warning;
      case 'confirmed':
        return Colors.success;
      case 'completed':
        return Colors.primary;
      case 'cancelled':
        return Colors.error;
      default:
        return Colors.textLight;
    }
  };

const fetchAppointments = useCallback(async () => {
  if (!user?.uid) {
    console.log('No user logged in');
    setUpcomingAppointments([]);
    setPastAppointments([]);
    setPurchasedPackages([]);
    setLoading(false);
    return;
  }

  setLoading(true);
  setError('');
  try {
    // Fetch regular appointments
    const appointmentsRef = collection(db, 'appointments');
    const q = query(appointmentsRef, where('userId', '==', user.uid));
    const querySnapshot = await getDocs(q);
    
    // Fetch family bookings
    const familyBookingsRef = collection(db, 'familybookings');
    const familyQuery = query(familyBookingsRef, where('userId', '==', user.uid));
    const familySnapshot = await getDocs(familyQuery);
    
    // Fetch packages
    const packagesRef = collection(db, 'package_purchases');
    const packagesQuery = query(packagesRef, where('userId', '==', user.uid));
    const packagesSnapshot = await getDocs(packagesQuery);
    
    const now = new Date();
    const activePackages: any[] = [];
    const expiredPackages: any[] = [];

    packagesSnapshot.docs.forEach(doc => {
      const pkg = {
        id: doc.id,
        ...(doc.data() as any),
        purchaseDate: new Date(doc.data().purchaseDate),
        expiryDate: doc.data().expiryDate ? new Date(doc.data().expiryDate) : null
      };

      // Check if package is expired
      if (pkg.expiryDate && pkg.expiryDate < now) {
        expiredPackages.push(pkg);
      } else {
        activePackages.push(pkg);
      }
    });

    // Update expired packages in Firestore if they're still marked as active
    const updatePromises = expiredPackages
      .filter(pkg => pkg.status === 'active')
      .map(pkg => 
        updateDoc(doc(db, 'package_purchases', pkg.id), {
          status: 'expired',
          updatedAt: new Date().toISOString()
        })
      );

    await Promise.all(updatePromises);

    // After updates, re-fetch packages to get the latest status
    const updatedPackagesSnapshot = await getDocs(packagesQuery);
    const updatedPackages = updatedPackagesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as any),
      purchaseDate: new Date(doc.data().purchaseDate),
      expiryDate: doc.data().expiryDate ? new Date(doc.data().expiryDate) : null
    }));

    // Separate active and expired packages again after updates
    const finalActivePackages: any[] = [];
    const finalExpiredPackages: any[] = [];

    updatedPackages.forEach(pkg => {
      if (pkg.status === 'expired' || (pkg.expiryDate && pkg.expiryDate < now)) {
        finalExpiredPackages.push(pkg);
      } else {
        finalActivePackages.push(pkg);
      }
    });

    setPurchasedPackages(finalActivePackages);

    // Process both types together
    const upcoming: any[] = [];
    const past: any[] = [];

    // Process regular appointments
    querySnapshot.docs.forEach(doc => {
      const data: any = doc.data();
      const appointment = {
        id: doc.id,
        ...data,
        dateTime: data.dateTime ? new Date(data.dateTime) : null,
        isFamilyBooking: false
      };

      if (appointment.status === 'completed' || appointment.status === 'cancelled') {
        past.push(appointment);
      } else if (appointment.dateTime && appointment.dateTime >= now) {
        upcoming.push(appointment);
      } else {
        past.push(appointment);
      }
    });

    // Process family bookings
    familySnapshot.docs.forEach(doc => {
      const data: any = doc.data();
      const booking = {
        id: doc.id,
        ...data,
        dateTime: data.dateTime ? new Date(data.dateTime) : null,
        isFamilyBooking: true
      };

      if (booking.status === 'completed' || booking.status === 'cancelled') {
        past.push(booking);
      } else if (booking.dateTime && booking.dateTime >= now) {
        upcoming.push(booking);
      } else {
        past.push(booking);
      }
    });

    // Add expired packages to past appointments section
    finalExpiredPackages.forEach(pkg => {
      past.push({
        ...pkg,
        isPackage: true,
        status: 'expired'
      });
    });

    setUpcomingAppointments(upcoming.sort((a, b) => a.dateTime - b.dateTime));
    setPastAppointments(past.sort((a, b) => {
      const dateA = a.dateTime || a.purchaseDate || new Date(0);
      const dateB = b.dateTime || b.purchaseDate || new Date(0);
      return dateB - dateA;
    }));

  } catch (err) {
    console.error('Fetch error:', err);
    setError('Failed to load data');
  } finally {
    setLoading(false);
  }
}, [user?.uid, language]);

  const handleDelete = (appointment) => {
    Alert.alert(
      uiTexts.deleteAppointment,
      uiTexts.deleteConfirm,
      [
        { text: uiTexts.cancel, style: 'cancel' },
        { 
          text: uiTexts.delete, 
          style: 'destructive', 
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'appointments', appointment.id));
              await cancelAppointmentReminders(appointment.id);
              if (appointment.shopId && appointment.dateTime && typeof appointment.barberNumber === 'number') {
                await releaseTimeslotChair({
                  shopId: appointment.shopId,
                  dateTimeISO: appointment.dateTime,
                  chairNumbers: [appointment.barberNumber],
                  slotsToRelease: 1,
                });
              }
              fetchAppointments();
            } catch (error) {
              toast.error('Error', 'Failed to delete appointment');
            }
          } 
        },
      ]
    );
  };

  const handleDeleteFamilyBooking = (booking) => {
    Alert.alert(
      uiTexts.deleteAppointment,
      uiTexts.deleteConfirm,
      [
        { text: uiTexts.cancel, style: 'cancel' },
        { 
          text: uiTexts.delete, 
          style: 'destructive', 
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'familybookings', booking.id));
              await cancelAppointmentReminders(booking.id);
              if (booking.shopId && booking.dateTime) {
                const chairNumbers = (booking.members || [])
                  .map((m) => m.barberNumber)
                  .filter((n) => typeof n === 'number');
                await releaseTimeslotChair({
                  shopId: booking.shopId,
                  dateTimeISO: booking.dateTime,
                  chairNumbers,
                  slotsToRelease: booking.familySize || chairNumbers.length || 1,
                });
              }
              fetchAppointments();
            } catch (error) {
              toast.error('Error', 'Failed to delete family booking');
            }
          } 
        },
      ]
    );
  };

  const handleReschedule = (appointment) => {
    setSelectedAppointment(appointment);
    setRescheduleDate(new Date(appointment.dateTime));
    setSelectedTimeSlot(null);
    setShowRescheduleModal(true);
    generateAvailableTimeSlots();
  };

  const handleRescheduleFamilyBooking = (booking) => {
    setSelectedAppointment(booking);
    setRescheduleDate(new Date(booking.dateTime));
    setSelectedTimeSlot(null);
    setShowRescheduleModal(true);
    generateAvailableTimeSlots();
  };

  const generateTimeSlots = () => {
    const slots: any[] = [];
    const serviceDuration = 30;
    
    for (let hour = BUSINESS_HOURS.start; hour < BUSINESS_HOURS.end; hour++) {
      for (let minute = 0; minute < 60; minute += BUSINESS_HOURS.interval) {
        const time = new Date(rescheduleDate);
        time.setHours(hour, minute, 0, 0);
        
        if (time > new Date()) {
          slots.push(time);
        }
      }
    }
    return slots;
  };

  const generateAvailableTimeSlots = async () => {
    try {
      const slots = generateTimeSlots();
      
      const start = new Date(rescheduleDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(rescheduleDate);
      end.setHours(23, 59, 59, 999);
      
      const appointmentsRef = collection(db, 'appointments');
      const q = query(
        appointmentsRef,
        where('dateTime', '>=', start.toISOString()),
        where('dateTime', '<=', end.toISOString())
      );
      
      const querySnapshot = await getDocs(q);
      
      const bookingsCount = {};
      querySnapshot.docs.forEach(doc => {
        const slot = doc.data().dateTime;
        bookingsCount[slot] = (bookingsCount[slot] || 0) + 1;
      });
      
      setBookingsPerSlot(bookingsCount);
      
      const available = slots.filter(slot => {
        const slotKey = slot.toISOString();
        return (bookingsCount[slotKey] || 0) < MAX_BARBERS || 
              slotKey === selectedAppointment?.dateTime?.toISOString();
      });
      
      setAvailableTimeSlots(available);
    } catch (error) {
      console.error('Error fetching available slots:', error);
      setRescheduleError('Failed to load available time slots');
    }
  };

  const handleDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || rescheduleDate;
    setShowDatePicker(Platform.OS === 'ios');
    setRescheduleDate(currentDate);
    setSelectedTimeSlot(null);
  };

  const handleSubmitReschedule = async () => {
    try {
      if (!selectedTimeSlot) {
        setRescheduleError('Please select a time slot');
        return;
      }

      setRescheduleLoading(true);
      setRescheduleError('');

      if (!user) {
        throw new Error('Please sign in to reschedule an appointment');
      }

      const newSlotKey = selectedTimeSlot.toISOString();
      const oldSlotKey = selectedAppointment.dateTime instanceof Date
        ? selectedAppointment.dateTime.toISOString()
        : selectedAppointment.dateTime;
      const isSameSlot = newSlotKey === oldSlotKey;
      const shopId = selectedAppointment.shopId;

      // Real per-shop chair count — the old version of this hardcoded
      // 10 chairs for every shop regardless of what was actually
      // configured, which meant a 3-chair shop could get "rescheduled"
      // into a chair that doesn't physically exist.
      let shopCapacity = MAX_BARBERS;
      if (shopId) {
        try {
          const shopSnap = await getDoc(doc(db, 'shops', shopId));
          if (shopSnap.exists()) shopCapacity = shopSnap.data().capacity || MAX_BARBERS;
        } catch (err) {
          console.warn('Could not read shop capacity for reschedule, falling back to default:', err);
        }
      }

      if (selectedAppointment.isFamilyBooking) {
        const familySize = selectedAppointment.familySize || 1;
        const oldChairNumbers = (selectedAppointment.members || [])
          .map((m) => m.barberNumber)
          .filter((n) => typeof n === 'number');

        if (isSameSlot) {
          await updateDoc(doc(db, 'familybookings', selectedAppointment.id), {
            status: 'pending',
            updatedAt: new Date().toISOString(),
          });
        } else {
          const newTimeslotRef = doc(db, 'timeslots', `${shopId}_${newSlotKey}`);
          const newChairNumbers: number[] = await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(newTimeslotRef);
            const data = snap.exists() ? snap.data() : null;
            const occupied: number[] = data?.occupiedChairs || [];
            const available = data ? data.availableSlots : shopCapacity;

            if (available < familySize) {
              throw new Error(`Only ${available} slot(s) available at this new time. Please choose another time.`);
            }

            const freeChairs: number[] = [];
            for (let c = 1; c <= shopCapacity && freeChairs.length < familySize; c++) {
              if (!occupied.includes(c)) freeChairs.push(c);
            }
            if (freeChairs.length < familySize) {
              throw new Error('Not enough free chairs at this new time. Please choose another time.');
            }

            transaction.set(newTimeslotRef, {
              shopId,
              totalSlots: shopCapacity,
              availableSlots: available - familySize,
              occupiedChairs: [...occupied, ...freeChairs],
              lastUpdated: new Date().toISOString(),
            }, { merge: true });

            return freeChairs;
          });

          await updateDoc(doc(db, 'familybookings', selectedAppointment.id), {
            dateTime: newSlotKey,
            status: 'pending',
            updatedAt: new Date().toISOString(),
            members: (selectedAppointment.members || []).map((m, i) => ({ ...m, barberNumber: newChairNumbers[i] })),
          });

          if (shopId && oldSlotKey && oldChairNumbers.length) {
            await releaseTimeslotChair({ shopId, dateTimeISO: oldSlotKey, chairNumbers: oldChairNumbers, slotsToRelease: familySize });
          }
        }
      } else {
        const oldChairNumber = selectedAppointment.barberNumber;

        if (isSameSlot) {
          await updateDoc(doc(db, 'appointments', selectedAppointment.id), {
            status: 'pending',
            updatedAt: new Date().toISOString(),
          });
        } else {
          const newTimeslotRef = doc(db, 'timeslots', `${shopId}_${newSlotKey}`);
          const newChairNumber: number = await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(newTimeslotRef);
            const data = snap.exists() ? snap.data() : null;
            const occupied: number[] = data?.occupiedChairs || [];
            const available = data ? data.availableSlots : shopCapacity;

            if (available < 1) {
              throw new Error('This time slot is now fully booked. Please choose another time.');
            }

            let freeChair = -1;
            for (let c = 1; c <= shopCapacity; c++) {
              if (!occupied.includes(c)) { freeChair = c; break; }
            }
            if (freeChair === -1) {
              throw new Error('No free chairs at this new time. Please choose another time.');
            }

            transaction.set(newTimeslotRef, {
              shopId,
              totalSlots: shopCapacity,
              availableSlots: available - 1,
              occupiedChairs: [...occupied, freeChair],
              lastUpdated: new Date().toISOString(),
            }, { merge: true });

            return freeChair;
          });

          await updateDoc(doc(db, 'appointments', selectedAppointment.id), {
            dateTime: newSlotKey,
            status: 'pending',
            updatedAt: new Date().toISOString(),
            barberNumber: newChairNumber,
          });

          if (shopId && oldSlotKey && typeof oldChairNumber === 'number') {
            await releaseTimeslotChair({ shopId, dateTimeISO: oldSlotKey, chairNumbers: [oldChairNumber], slotsToRelease: 1 });
          }
        }
      }

      setShowRescheduleModal(false);
      setSuccessMessage(`${uiTexts.appointmentRescheduled} ${uiTexts.barber}!`);
      setShowSuccess(true);
      fetchAppointments();

      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);

    } catch (error: any) {
      setRescheduleError(error.message);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const renderStars = () => {
    const stars: any[] = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity key={i} onPress={() => setRating(i)}>
          <Star 
            size={32} 
            color={i <= rating ? Colors.primary : Colors.border}
            fill={i <= rating ? Colors.primary : 'transparent'}
          />
        </TouchableOpacity>
      );
    }
    return stars;
  };

  const fetchWaitlist = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const snap = await getDocs(query(collection(db, 'waitlist'), where('userId', '==', user.uid)));
      const entries = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setWaitlistEntries(entries);
    } catch (err) {
      console.error('Error fetching waitlist entries:', err);
    }
  }, [user?.uid]);

  const handleLeaveWaitlist = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'waitlist', id));
      setWaitlistEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      toast.error('Error', 'Could not leave the waitlist. Please try again.');
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchAppointments();
      fetchWaitlist();
    }, [fetchAppointments, fetchWaitlist])
  );

  // Deep-link support: a notification tap can pass ?highlight={bookingId}
  // to scroll straight to that booking and mark it, instead of dropping
  // the customer on a generic list they have to search through.
  useEffect(() => {
    if (!highlightId || hasScrolledToHighlight.current) return;
    const offset = highlightOffsets.current[highlightId];
    if (offset === undefined) return; // not rendered/laid out yet
    hasScrolledToHighlight.current = true;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(offset - 24, 0), animated: true });
    }, 300); // let entrance animations settle first
    return () => clearTimeout(timer);
  }, [highlightId, upcomingAppointments, pastAppointments, familyBookings]);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} ref={scrollRef}>
        <Animated.View entering={FadeIn.duration(500)} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>{uiTexts.appointmentsTitle}</Text>
          <Text style={styles.headerSubtitle}>{uiTexts.appointmentsSubtitle}</Text>
        </Animated.View>

          <View style={styles.content}>
          {loading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
          ) : error ? (
            <Text style={[styles.emptyText, { color: Colors.error }]}>{error}</Text>
          ) : (
            <>
              {/* Packages Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{uiTexts.myPackages}</Text>
                {purchasedPackages.length > 0 ? (
                  purchasedPackages.map((pkg, index) => renderPackage(pkg, index))
                ) :  (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>{uiTexts.noPackages}</Text>
                    <TouchableOpacity
                      style={styles.bookButton}
                      onPress={() => router.push('/services')}
                    >
                      <Text style={styles.bookButtonText}>{uiTexts.browsePackages}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
 <View ref={upcomingRef} style={styles.section}>
                <Text style={styles.sectionTitle}>{uiTexts.upcomingAppointments}</Text>
                {upcomingAppointments.length > 0 ? (
                  upcomingAppointments.map((appointment, index) =>
                    renderAppointment(appointment, index, true)
                  )
                ) :  (
                  <Animated.View
                    entering={FadeIn.delay(300).duration(500)}
                    style={styles.emptyContainer}
                  >
                    <Text style={styles.emptyText}>{uiTexts.noUpcoming}</Text>
                    <TouchableOpacity
                      style={styles.bookButton}
                      onPress={() => router.push('/(tabs)/services')}
                    >
                      <Text style={styles.bookButtonText}>{uiTexts.bookNow}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </View>

              {waitlistEntries.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Your Waitlist</Text>
                  {waitlistEntries.map((entry) => (
                    <View key={entry.id} style={styles.waitlistCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.waitlistCardTitle}>{entry.serviceName}</Text>
                        <Text style={styles.waitlistCardMeta}>{entry.shopName}</Text>
                        <Text style={styles.waitlistCardMeta}>
                          {new Date(entry.dateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </Text>
                        <Text style={styles.waitlistCardStatus}>
                          {entry.status === 'notified' ? 'A spot opened up — book now!' : 'Waiting for a spot to open up'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => handleLeaveWaitlist(entry.id)}>
                        <X size={18} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

         <View style={styles.section}>
                <Text style={styles.sectionTitle}>{uiTexts.pastAppointments}</Text>
                {pastAppointments.length > 0 ? (
                  pastAppointments.map((appointment, index) => renderAppointment(appointment, index))
                ) : (
                  <Text style={styles.emptyText}>{uiTexts.noPast}</Text>
                )}
              </View>
            </>
          )}
        </View>
        
        <View style={styles.bottomPadding} />
      </ScrollView>
      
      {/* Reschedule Modal */}
      <Modal
        visible={showRescheduleModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRescheduleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{uiTexts.rescheduleTitle}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowRescheduleModal(false)}
              >
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {rescheduleError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{rescheduleError}</Text>
              </View>
            ) : null}

            {selectedAppointment && (
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceInfoName}>
                  {selectedAppointment.serviceName}
                  {selectedAppointment.isFamilyBooking && ' (Family Booking)'}
                </Text>
                <Text style={styles.serviceInfoText}>{selectedAppointment.shopName}</Text>
                <Text style={styles.serviceInfoPrice}>
                  ₹{selectedAppointment.totalPrice ?? selectedAppointment.servicePrice}
                </Text>
                <Text style={styles.serviceInfoText}>
                  {selectedAppointment.duration || '30 min'}
                  {selectedAppointment.isFamilyBooking && ` • Family Size: ${selectedAppointment.familySize}`}
                </Text>
                {selectedTimeSlot && selectedTimeSlot.toISOString() !== selectedAppointment.dateTime?.toISOString() && !selectedAppointment.isFamilyBooking && (
                  <Text style={styles.serviceInfoBarber}>
                    {uiTexts.newBarber}: #{(bookingsPerSlot[selectedTimeSlot.toISOString()] || 0) % MAX_BARBERS + 1}
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Calendar size={20} color={Colors.primary} />
              <Text style={styles.datePickerButtonText}>
                {rescheduleDate.toLocaleDateString()}
              </Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={rescheduleDate}
                mode="date"
                display="default"
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
            )}

            <ScrollView style={styles.timeSlotsContainer}>
              <Text style={styles.timeSlotsTitle}>{uiTexts.availableTimeSlots}</Text>
              <View style={styles.timeSlotsList}>
                {availableTimeSlots.map((slot, index) => {
                  const slotKey = slot.toISOString();
                  const bookedCount = bookingsPerSlot[slotKey] || 0;
                  const availableSpots = MAX_BARBERS - bookedCount;
                  const isCurrentSlot = slotKey === selectedAppointment?.dateTime?.toISOString();
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.timeSlot,
                        selectedTimeSlot?.getTime() === slot.getTime() && styles.timeSlotSelected,
                        isCurrentSlot && styles.currentTimeSlot
                      ]}
                      onPress={() => !isCurrentSlot && setSelectedTimeSlot(slot)}
                      disabled={isCurrentSlot}
                    >
                      <Text style={[
                        styles.timeSlotText,
                        selectedTimeSlot?.getTime() === slot.getTime() && styles.timeSlotTextSelected,
                        isCurrentSlot && styles.currentTimeSlotText
                      ]}>
                        {slot.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={[
                        styles.timeSlotAvailability,
                        selectedTimeSlot?.getTime() === slot.getTime() && styles.timeSlotAvailabilitySelected,
                        isCurrentSlot && styles.currentTimeSlotText
                      ]}>
                        {isCurrentSlot ? uiTexts.currentSlot : `${availableSpots} ${uiTexts.spotsLeft}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.confirmButton, 
                rescheduleLoading && styles.confirmButtonDisabled,
                (!selectedTimeSlot || selectedTimeSlot.toISOString() === selectedAppointment?.dateTime?.toISOString()) && 
                  styles.disabledButton
              ]}
              onPress={handleSubmitReschedule}
              disabled={
                rescheduleLoading || 
                !selectedTimeSlot || 
                selectedTimeSlot.toISOString() === selectedAppointment?.dateTime?.toISOString()
              }
            >
              <Text style={styles.confirmButtonText}>
                {rescheduleLoading ? uiTexts.rescheduling : uiTexts.confirmReschedule}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Review Modal */}
      <Modal
        visible={showReviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{uiTexts.leaveReviewTitle}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowReviewModal(false)}
              >
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {reviewAppointment && (
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceInfoName}>
                  {reviewAppointment.serviceName}
                  {reviewAppointment.isFamilyBooking && ' (Family Booking)'}
                </Text>
                <Text style={styles.serviceInfoText}>{reviewAppointment.shopName}</Text>
              </View>
            )}

            <View style={styles.ratingContainer}>
              <Text style={styles.ratingTitle}>{uiTexts.yourRating}</Text>
              <View style={styles.starsContainer}>
                {renderStars()}
              </View>
            </View>

            <View style={styles.reviewInputContainer}>
              <Text style={styles.reviewInputLabel}>{uiTexts.yourReview}</Text>
              <TextInput
                style={styles.reviewInput}
                multiline
                numberOfLines={4}
                placeholder={uiTexts.reviewPlaceholder}
                value={reviewText}
                onChangeText={setReviewText}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.confirmButton,
                reviewSubmitting && styles.confirmButtonDisabled,
                (!reviewText || rating === 0) && styles.disabledButton
              ]}
              onPress={handleSubmitReview}
              disabled={reviewSubmitting || !reviewText || rating === 0}
            >
              <Text style={styles.confirmButtonText}>
                {reviewSubmitting ? uiTexts.submitting : uiTexts.submitReview}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      {showSuccess && (
        <Modal
          transparent={true}
          visible={showSuccess}
          onRequestClose={() => setShowSuccess(false)}
          animationType="fade"
        >
          <View style={styles.successOverlay}>
            <Animated.View 
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(300)}
              style={styles.successContainer}
            >
              <Text style={styles.successText}>{successMessage}</Text>
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 4,
  },
  content: {
    paddingHorizontal: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 16,
  },
  waitlistCard: {
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
  waitlistCardTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  waitlistCardMeta: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 2,
  },
  waitlistCardStatus: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
    marginTop: 4,
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  quickActionButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}10`,
    borderWidth: 1,
    borderColor: `${Colors.primary}25`,
  },
  quickActionText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  appointmentCard: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  upcomingCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  deepLinkedCard: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}08`,
  },
  barberImage: {
    width: 80,
    height: '100%',
  },
   expiredPackageCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
    opacity: 0.8,
  },
  appointmentContent: {
    flex: 1,
    padding: 16,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    width: '50%',
  },
  cancelButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft:-25,
  },
  appointmentDetails: {
    marginBottom: 12,
  },
   actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end', // Changed from 'space-between' to 'flex-end'
    marginTop: 12,
  },
  paymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8, // Added margin between buttons
  },
  rescheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  paymentButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: 'white',
    marginRight: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginLeft: 8,
  },
  priceText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
    marginLeft: 22,
  },
  servicesContainer: {
    marginTop: 8,
  },
  servicesTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 4,
  },
  serviceItem: {
    marginLeft: 8,
    marginBottom: 2,
  },
  serviceText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  verificationCodeBox: {
    marginTop: 12,
    backgroundColor: `${Colors.primary}10`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    borderStyle: 'dashed',
    padding: 12,
    alignItems: 'center',
  },
  verificationCodeLabel: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  verificationCodeValue: {
    fontSize: 28,
    fontFamily: 'Poppins-Bold',
    color: Colors.primary,
    letterSpacing: 8,
    marginTop: 4,
  },
  barberText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.textLight,
    marginLeft: 8,
  },
  rescheduleText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: 'white',
    marginRight: 4,
  },
  reviewButton: {
    backgroundColor: Colors.backgroundLight,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  reviewButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
    marginRight: 8,
  },
  emptyContainer: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.textLight,
    marginBottom: 16,
  },
  bookButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  bookButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: 'white',
  },
  bottomPadding: {
    height: 80,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
  },
  closeButton: {
    padding: 8,
  },
  serviceInfo: {
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  serviceInfoName: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 8,
  },
  serviceInfoPrice: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
    marginBottom: 4,
  },
  serviceInfoTime: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  serviceInfoBarber: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.textLight,
    marginTop: 4,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  datePickerButtonText: {
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  confirmButton: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
  },
  errorContainer: {
    backgroundColor: Colors.errorLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
  },
  timeSlotsContainer: {
    maxHeight: 200,
    marginVertical: 16,
  },
  timeSlotsTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 12,
  },
  timeSlotsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeSlot: {
    backgroundColor: Colors.backgroundLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  timeSlotSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  currentTimeSlot: {
    backgroundColor: Colors.backgroundLight,
    borderColor: Colors.textLight,
    opacity: 0.7,
  },
  timeSlotText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  timeSlotTextSelected: {
    color: 'white',
  },
  currentTimeSlotText: {
    color: Colors.textLight,
  },
  timeSlotAvailability: {
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 2,
  },
  timeSlotAvailabilitySelected: {
    color: 'white',
  },
  successOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  successContainer: {
    backgroundColor: Colors.success,
    padding: 20,
    borderRadius: 10,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  successText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    textAlign: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completedCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
 
  statusText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
  },
  statusText1: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    marginLeft: -60,
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: Colors.backgroundLight,
  },
  ratingContainer: {
    marginBottom: 20,
  },
  ratingTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginBottom: 8,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  reviewInputContainer: {
    marginBottom: 16,
  },
  reviewInputLabel: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginBottom: 8,
  },
  reviewInput: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  packageCard: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  paidPackageCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  pendingPackageCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  shopInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  shopIcon: {
    marginRight: 8,
  },
  shopNameText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  paymentButton1: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 105,
  },
   userTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
 familyCard: {
    borderLeftColor: Colors.secondary, // Different color for family bookings
  },
  familyBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  familyBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.secondary
  },
  familySizeText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginTop: 4
  },
  userTypeText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
  },
  serviceInfoText: {
    fontSize: 12,
  },
  // Add to your styles if you want different visual feedback
verifyingButton: {
  backgroundColor: Colors.warning, // Orange/yellow color for verifying state
},
});