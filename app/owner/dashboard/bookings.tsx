import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { releaseTimeslotChair } from '@/utils/timeslotAvailability';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Calendar, Clock, User, Scissors, Check, X, Users, Store } from 'lucide-react-native';
import { collection, query, where, getDocs, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';

interface Shop {
  id: string;
  shopName: string;
  ownerId: string;
}

interface Booking {
  id: string;
  userId: string;
  userName: string;
  serviceName: string;
  service: string;
  dateTime: string;
  status: string;
  type: string;
  shopId: string;
  shopName: string;
  familySize?: number;
  barberNumber?: number;
  members?: { barberNumber?: number }[];
  createdAt: any;
}

export default function BookingsManagement() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [familyBookings, setFamilyBookings] = useState<Booking[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageLoading, setPageLoading] = useState(false);
  const [userNames, setUserNames] = useState({});

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  // Fetch shops owned by the current user
  const fetchShops = async () => {
    try {
      const q = query(collection(db, 'shops'), where('ownerId', '==', user?.uid));
      const querySnapshot = await getDocs(q);
      const shopsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        shopName: doc.data().shopName,
        ownerId: doc.data().ownerId,
      }));
      setShops(shopsData);
      return shopsData;
    } catch (error) {
      console.error('Error fetching shops:', error);
      Alert.alert('Error', 'Failed to load shops');
      return [];
    }
  };

  const fetchUserNames = async (userIds: string[]) => {
    try {
      const uniqueIds = [...new Set(userIds)].filter(id => id);
      
      if (uniqueIds.length === 0) {
        return;
      }

      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('uid', 'in', uniqueIds));
      const querySnapshot = await getDocs(q);
      
      const names = {};
      querySnapshot.forEach((doc) => {
        names[doc.id] = doc.data().name || doc.data().email?.split('@')[0] || 'Customer';
      });
      
      setUserNames(names);
    } catch (error) {
      console.error('Error fetching user names:', error);
    }
  };

  useEffect(() => {
    if (!user) return;

    const initializeData = async () => {
      setLoading(true);
      const userShops = await fetchShops();
      
      if (userShops.length === 0) {
        setLoading(false);
        return;
      }

      const shopIds = userShops.map(shop => shop.id);

      // Set up real-time listeners for appointments in owner's shops
      const appointmentsQuery = query(
        collection(db, 'appointments'),
        where('shopId', 'in', shopIds)
      );

      const familyBookingsQuery = query(
        collection(db, 'familybookings'),
        where('shopId', 'in', shopIds)
      );

      const unsubscribeAppointments = onSnapshot(appointmentsQuery, async (querySnapshot) => {
        const bookingsData: Booking[] = [];
        const userIds: string[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          bookingsData.push({ 
            id: doc.id, 
            ...data,
            type: 'individual'
          } as Booking);
          if (data.userId) {
            userIds.push(data.userId);
          }
        });

        if (userIds.length > 0) {
          await fetchUserNames(userIds);
        }
        
        bookingsData.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
        setBookings(bookingsData);
      }, (error) => {
        console.error('Error loading appointments:', error);
        setError('Failed to load bookings');
      });

      const unsubscribeFamilyBookings = onSnapshot(familyBookingsQuery, async (querySnapshot) => {
        const familyBookingsData: Booking[] = [];
        const userIds: string[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          familyBookingsData.push({ 
            id: doc.id, 
            ...data,
            type: 'family'
          } as Booking);
          if (data.userId) {
            userIds.push(data.userId);
          }
        });

        if (userIds.length > 0) {
          await fetchUserNames(userIds);
        }
        
        familyBookingsData.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
        setFamilyBookings(familyBookingsData);
        setLoading(false);
      }, (error) => {
        console.error('Error loading family bookings:', error);
        setError('Failed to load family bookings');
        setLoading(false);
      });

      return () => {
        unsubscribeAppointments();
        unsubscribeFamilyBookings();
      };
    };

    initializeData();
  }, [user]);

  const allBookings = [...bookings, ...familyBookings];
  const filteredBookings = selectedFilter === 'all' 
    ? allBookings 
    : allBookings.filter(booking => booking.status === selectedFilter);

  const getStatusColor = (status: string) => {
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

  const handleUpdateStatus = async (booking: Booking, newStatus: string) => {
    try {
      const collectionName = booking.type === 'family' ? 'familybookings' : 'appointments';
      const bookingRef = doc(db, collectionName, booking.id);
      await updateDoc(bookingRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });

      // An owner cancelling a future booking needs to free that chair up
      // for other customers the same way a customer cancelling their own
      // booking does — this was only wired up on the customer side until now.
      if (newStatus === 'cancelled' && booking.shopId && booking.dateTime) {
        const chairNumbers = booking.type === 'family'
          ? (booking.members || []).map((m) => m.barberNumber).filter((n): n is number => typeof n === 'number')
          : (typeof booking.barberNumber === 'number' ? [booking.barberNumber] : []);
        if (chairNumbers.length) {
          await releaseTimeslotChair({
            shopId: booking.shopId,
            dateTimeISO: booking.dateTime,
            chairNumbers,
            slotsToRelease: booking.familySize || chairNumbers.length,
          });
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update booking status');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Show message if no shops are assigned to the owner
  if (shops.length === 0 && !loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Bookings</Text>
            <Text style={styles.headerSubtitle}>Manage appointments</Text>
          </View>
        </View>

        <View style={styles.noShopsContainer}>
          <Store size={64} color={Colors.textLight} />
          <Text style={styles.noShopsTitle}>No Shops Assigned</Text>
          <Text style={styles.noShopsMessage}>
            You need to have at least one shop assigned to manage bookings.
          </Text>
          <Text style={styles.noShopsMessage}>
            Please contact admin to assign shops to your account.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Bookings</Text>
          <Text style={styles.headerSubtitle}>Manage appointments</Text>
        </View>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
      >
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[
              styles.filterButton,
              selectedFilter === filter.id && styles.filterButtonActive
            ]}
            onPress={() => setSelectedFilter(filter.id)}
          >
            <Text style={[
              styles.filterText,
              selectedFilter === filter.id && styles.filterTextActive
            ]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {filteredBookings.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No bookings found</Text>
              <Text style={styles.emptySubtext}>
                {selectedFilter === 'all' 
                  ? 'No bookings in your shops yet' 
                  : `No ${selectedFilter} bookings in your shops`}
              </Text>
            </View>
          ) : (
            filteredBookings.map((booking) => (
              <View 
                key={booking.id}
                style={styles.bookingCard}
              >
                <View style={styles.bookingHeader}>
                  <Text style={styles.customerName}>
                    {userNames[booking.userId] || `Customer (${booking.userId?.slice(0, 6) || 'N/A'})`}
                    {booking.type === 'family' && (
                      <Text style={{ color: Colors.primary }}> (Family Booking)</Text>
                    )}
                  </Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: `${getStatusColor(booking.status)}20` }
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: getStatusColor(booking.status) }
                    ]}>
                      {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                    </Text>
                  </View>
                </View>

                <View style={styles.bookingDetails}>
                  <View style={styles.detailRow}>
                    <Store size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>{booking.shopName || 'Unknown Shop'}</Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Calendar size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>{formatDate(booking.dateTime)}</Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Clock size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>{formatTime(booking.dateTime)}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Scissors size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>{booking.serviceName || booking.service}</Text>
                  </View>

                  {booking.type === 'family' && (
                    <View style={styles.detailRow}>
                      <Users size={16} color={Colors.primary} />
                      <Text style={styles.detailText}>
                        {booking.familySize} members
                      </Text>
                    </View>
                  )}

                  <View style={styles.detailRow}>
                    <Clock size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>
                      Booked at {formatTime(
                        booking.createdAt?.toDate?.() || 
                        booking.createdAt || 
                        new Date().toISOString()
                      )}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionButtons}>
                  {booking.status === 'pending' && (
                    <>
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.confirmButton]}
                        onPress={() => handleUpdateStatus(booking, 'confirmed')}
                      >
                        <Check size={16} color="white" />
                        <Text style={styles.actionButtonText}>Confirm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.cancelButton]}
                        onPress={() => handleUpdateStatus(booking, 'cancelled')}
                      >
                        <X size={16} color={Colors.error} />
                        <Text style={[styles.actionButtonText, styles.cancelButtonText]}>
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {booking.status === 'confirmed' && (
                    <TouchableOpacity 
                      style={[styles.actionButton, styles.completeButton]}
                      onPress={() => handleUpdateStatus(booking, 'completed')}
                    >
                      <Check size={16} color="white" />
                      <Text style={styles.actionButtonText}>Complete</Text>
                    </TouchableOpacity>
                  )}
                  {(booking.status === 'completed' || booking.status === 'cancelled') && (
                    <View style={styles.statusInfo}>
                      <Text style={styles.statusInfoText}>
                        {booking.status === 'completed' ? 'Completed' : 'Cancelled'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: Colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
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
  },
  filtersContainer: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.backgroundLight,
    marginRight: 12,
  },
  filterButtonActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  filterTextActive: {
    color: 'white',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  bookingCard: {
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
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  customerName: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
  },
  bookingDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginLeft: 8,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 100,
    justifyContent: 'center',
    gap: 8,
  },
  confirmButton: {
    backgroundColor: Colors.success,
  },
  completeButton: {
    backgroundColor: Colors.primary,
  },
  cancelButton: {
    backgroundColor: Colors.errorLight,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },
  cancelButtonText: {
    color: Colors.error,
  },
  statusInfo: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.backgroundLight,
  },
  statusInfoText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.textLight,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.textLight,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
  },
  errorText: {
    color: Colors.error,
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    textAlign: 'center',
    marginTop: 40,
  },
  noShopsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  noShopsTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  noShopsMessage: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
});