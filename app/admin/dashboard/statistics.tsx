import { useState, useEffect } from 'react';
import { View, Text, Dimensions, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useRouter } from 'expo-router';
import { ArrowLeft, Users } from 'lucide-react-native';
import Colors from '@/constants/Colors';

const BUSINESS_HOURS = {
  start: 7,
  end: 21,
  interval: 30,
};
const MAX_BARBERS = 10;

interface User {
  id: string;
  name: string;
  address: string;
  gender: string;
}

interface Appointment {
  id: string;
  status: string;
  shopName: string;
  shopId: string;
  userId: string;
  userName: string;
  dateTime: string;
  user?: User;
  timestamp?: number;
  type?: 'individual' | 'family';
  familySize?: number;
}

interface ShopStats {
  shopName: string;
  shopId: string;
  capacity: number;
  stats: {
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    total: number;
  };
  appointments: Appointment[];
  availableSlots: {
    today: number;
    tomorrow: number;
    total: number;
  };
}

const StatsScreen = () => {
  const router = useRouter();
  const [shopStats, setShopStats] = useState<ShopStats[]>([]);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [realTimeData, setRealTimeData] = useState<any>(null);

  const calculateTotalSlots = (barbers, hours, intervalMinutes) => {
    const totalMinutes = (hours.end - hours.start) * 60;
    const slotsPerBarber = totalMinutes / intervalMinutes;
    return barbers * slotsPerBarber;
  };

  const TOTAL_SLOTS = calculateTotalSlots(MAX_BARBERS, BUSINESS_HOURS, BUSINESS_HOURS.interval);

  const statusColors = {
    pending: '#FFA500',
    confirmed: '#3498db',
    completed: '#2ecc71',
    cancelled: '#e74c3c',
  };

  const statusLabels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch all shops first to get capacities
        const shopsRef = collection(db, 'shops');
        const shopsSnapshot = await getDocs(shopsRef);
        const shopsData = shopsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any),
          capacity: doc.data().capacity || 10 // Default capacity
        }));

        // Initialize shop stats for ALL shops with zero values
        const shopsMap = new Map<string, ShopStats>();
        shopsData.forEach(shop => {
          shopsMap.set(shop.shopName, {
            shopName: shop.shopName,
            shopId: shop.id,
            capacity: shop.capacity,
            stats: {
              pending: 0,
              confirmed: 0,
              completed: 0,
              cancelled: 0,
              total: 0,
            },
            appointments: [],
            availableSlots: {
              today: TOTAL_SLOTS,
              tomorrow: TOTAL_SLOTS,
              total: TOTAL_SLOTS * 2
            }
          });
        });

        // 2. Fetch all appointments and family bookings
        const appointmentsRef = collection(db, 'appointments');
        const familyBookingsRef = collection(db, 'familybookings');
        
        const [appointmentsSnapshot, familyBookingsSnapshot] = await Promise.all([
          getDocs(appointmentsRef),
          getDocs(familyBookingsRef)
        ]);

        // 3. Get unique user IDs from appointments and family bookings
        const userIds = new Set<string>();
        const appointments: Appointment[] = [];
        
        // Process regular appointments
        appointmentsSnapshot.forEach((doc) => {
          const data = doc.data();
          const date = new Date(data.dateTime);
          appointments.push({
            id: doc.id,
            status: data.status,
            shopName: data.shopName,
            shopId: data.shopId,
            userId: data.userId,
            userName: data.userName,
            dateTime: data.dateTime,
            timestamp: date.getTime(),
            type: 'individual'
          });
          if (data.userId) userIds.add(data.userId);
        });

        // Process family bookings - each family member counts as one slot
        familyBookingsSnapshot.forEach((doc) => {
          const data = doc.data();
          const date = new Date(data.dateTime);
          const familySize = data.familySize || 1;
          
          // Create one appointment record for the family booking
          appointments.push({
            id: doc.id,
            status: data.status,
            shopName: data.shopName,
            shopId: data.shopId,
            userId: data.userId,
            userName: data.userName,
            dateTime: data.dateTime,
            timestamp: date.getTime(),
            type: 'family',
            familySize: familySize
          });
          if (data.userId) userIds.add(data.userId);
        });

        // 4. Fetch user details from users collection (only if there are appointments)
        let usersMap = new Map<string, User>();
        if (userIds.size > 0) {
          const usersCollection = collection(db, 'users');
          const usersQuery = query(usersCollection, where('__name__', 'in', Array.from(userIds)));
          const usersSnapshot = await getDocs(usersQuery);
          
          usersSnapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            usersMap.set(userDoc.id, {
              id: userDoc.id,
              name: userData.name || '',
              address: userData.address || '',
              gender: userData.gender || '',
            });
          });
        }

        // 5. Combine appointment data with user details and update shop stats
        appointments.forEach((appointment) => {
          if (!shopsMap.has(appointment.shopName)) {
            // If shop doesn't exist in our initial list, add it (shouldn't happen if data is consistent)
            shopsMap.set(appointment.shopName, {
              shopName: appointment.shopName,
              shopId: appointment.shopId,
              capacity: 10, // default
              stats: {
                pending: 0,
                confirmed: 0,
                completed: 0,
                cancelled: 0,
                total: 0,
              },
              appointments: [],
              availableSlots: {
                today: TOTAL_SLOTS,
                tomorrow: TOTAL_SLOTS,
                total: TOTAL_SLOTS * 2
              }
            });
          }
          
          const shopStats = shopsMap.get(appointment.shopName)!;
          const enrichedAppointment = {
            ...appointment,
            user: usersMap.get(appointment.userId)
          };
          
          shopStats.appointments.push(enrichedAppointment);
          
          // For family bookings, increment status count by family size
          if (appointment.type === 'family') {
            const familySize = appointment.familySize || 1;
            shopStats.stats[appointment.status] += familySize;
            shopStats.stats.total += familySize;
          } else {
            // For individual appointments, increment by 1
            shopStats.stats[appointment.status]++;
            shopStats.stats.total++;
          }
        });

        // Calculate available slots for each shop
        shopsMap.forEach(shop => {
          const today = new Date();
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          
          // Format dates to match appointment dates
          const todayStr = today.toISOString().split('T')[0];
          const tomorrowStr = tomorrow.toISOString().split('T')[0];
          
          // Filter today's appointments (only confirmed/pending/completed)
          const todayAppointments = shop.appointments.filter(appt => 
            appt.dateTime.includes(todayStr) && 
            (appt.status === 'confirmed' || appt.status === 'pending' || appt.status === 'completed')
          );
          
          // Filter tomorrow's appointments (only confirmed/pending)
          const tomorrowAppointments = shop.appointments.filter(appt => 
            appt.dateTime.includes(tomorrowStr) && 
            (appt.status === 'confirmed' || appt.status === 'pending')
          );
          
          // Calculate occupied slots - count family members for family bookings
          const todayOccupiedSlots = todayAppointments.reduce((total, appt) => {
            return total + (appt.type === 'family' ? (appt.familySize || 1) : 1);
          }, 0);
          
          const tomorrowOccupiedSlots = tomorrowAppointments.reduce((total, appt) => {
            return total + (appt.type === 'family' ? (appt.familySize || 1) : 1);
          }, 0);
          
          // Update available slots (can't go below 0)
          shop.availableSlots.today = Math.max(0, TOTAL_SLOTS - todayOccupiedSlots);
          shop.availableSlots.tomorrow = Math.max(0, TOTAL_SLOTS - tomorrowOccupiedSlots);
          
          // Sort appointments by date in descending order (newest first)
          shop.appointments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        });

        const shopsArray = Array.from(shopsMap.values());
        setShopStats(shopsArray);
        
        // Select the first shop by default if available
        if (shopsArray.length > 0) {
          setSelectedShop(shopsArray[0].shopName);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Set up real-time listeners for both appointment types
    const appointmentsRef = collection(db, 'appointments');
    const familyBookingsRef = collection(db, 'familybookings');
    
    const unsubscribeAppointments = onSnapshot(appointmentsRef, () => {
      fetchData(); // Refresh data when appointments change
    });
    
    const unsubscribeFamilyBookings = onSnapshot(familyBookingsRef, () => {
      fetchData(); // Refresh data when family bookings change
    });

    return () => {
      unsubscribeAppointments();
      unsubscribeFamilyBookings();
    };
  }, []);

  const getSelectedShopData = () => {
    if (!selectedShop) return null;
    return shopStats.find(shop => shop.shopName === selectedShop);
  };

  const getChartData = (stats: any) => {
    return Object.entries(stats)
      .filter(([key]) => key !== 'total' && stats[key] > 0)
      .map(([status, count]: [string, any]) => {
        const percentage = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
        return {
          name: `${statusLabels[status]} (${percentage}%)`,
          count,
          color: statusColors[status],
          legendFontColor: Colors.text,
          legendFontSize: 14,
        };
      });
  };
  const screenWidth = Dimensions.get('window').width;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading statistics...</Text>
      </View>
    );
  }

  const currentShop = getSelectedShopData();

  return (
    <ScrollView style={styles.container}>
      {/* Header - Removed Animated.View */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Appointment Statistics</Text>
          <Text style={styles.headerSubtitle}>View your business insights</Text>
        </View>
      </View>

      {/* Shop Selection */}
      {shopStats.length > 0 && (
        <View style={styles.shopSelectorContainer}>
          <Text style={styles.sectionTitle}>Select Shop</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {shopStats.map((shop) => (
              <TouchableOpacity
                key={shop.shopId}
                style={[
                  styles.shopButton,
                  selectedShop === shop.shopName && styles.selectedShopButton
                ]}
                onPress={() => setSelectedShop(shop.shopName)}
              >
                <Text 
                  style={[
                    styles.shopButtonText,
                    selectedShop === shop.shopName && styles.selectedShopButtonText
                  ]}
                >
                  {shop.shopName}
                </Text>
                <Text style={styles.shopStatsText}>Total: {shop.stats.total}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      {currentShop ? (
        <View style={styles.content}>
          {/* Shop Info */}
          <View style={styles.shopInfoContainer}>
            <Text style={styles.shopName}>{currentShop.shopName}</Text>
            
            <View style={styles.capacityContainer}>
              <View style={styles.capacityItem}>
                <Text style={styles.capacityLabel}>Total Capacity</Text>
                <Text style={styles.capacityValue}>{MAX_BARBERS} barbers</Text>
              </View>

              <View style={styles.capacityItem}>
                <Text style={styles.capacityLabel}>Today's Slots</Text>
                <Text style={styles.capacityValue}>
                  <Text style={{ color: Colors.primary }}>
                    {TOTAL_SLOTS - currentShop.availableSlots.today}
                  </Text> / {TOTAL_SLOTS}
                </Text>
              </View>
              <View style={styles.capacityItem}>
                <Text style={styles.capacityLabel}>Tomorrow's Slots</Text>
                <Text style={styles.capacityValue}>
                  <Text style={{ color: Colors.primary }}>
                    {TOTAL_SLOTS - currentShop.availableSlots.tomorrow}
                  </Text> / {TOTAL_SLOTS}
                </Text>
              </View>
            </View>
            
            {/* Available Slots Box */}
            <View style={styles.slotsContainer}>
              <View style={styles.slotItem}>
                <Text style={styles.slotLabel}>Available Today</Text>
                <Text style={[styles.slotValue, { color: currentShop.availableSlots.today > 0 ? '#2ecc71' : '#e74c3c' }]}>
                  {currentShop.availableSlots.today} slots
                </Text>
              </View>
              <View style={styles.slotItem}>
                <Text style={styles.slotLabel}>Available Tomorrow</Text>
                <Text style={[styles.slotValue, { color: currentShop.availableSlots.tomorrow > 10 ? '#2ecc71' : '#e74c3c' }]}>
                  {currentShop.availableSlots.tomorrow} slots
                </Text>
              </View>
            </View>
            <View>
              <Text style={styles.slotLabel}>Total Bookings </Text>
            </View>

            <View style={styles.statsSummary}>
              <View style={styles.statSummaryItem}>
                <Text style={styles.statSummaryNumber}>{currentShop.stats.pending}</Text>
                <Text style={styles.statSummaryLabel}>Pending</Text>
              </View>
              <View style={styles.statSummaryItem}>
                <Text style={styles.statSummaryNumber}>{currentShop.stats.confirmed}</Text>
                <Text style={styles.statSummaryLabel}>Confirmed</Text>
              </View>
              <View style={styles.statSummaryItem}>
                <Text style={styles.statSummaryNumber}>{currentShop.stats.completed}</Text>
                <Text style={styles.statSummaryLabel}>Completed</Text>
              </View>
              <View style={styles.statSummaryItem}>
                <Text style={styles.statSummaryNumber}>{currentShop.stats.cancelled}</Text>
                <Text style={styles.statSummaryLabel}>Cancelled</Text>
              </View>
            </View>
          </View>

          {/* Chart */}
          {getChartData(currentShop.stats).length > 0 && (
            <View style={styles.chartContainer}>
              <PieChart
                data={getChartData(currentShop.stats)}
                width={screenWidth - 40}
                height={220}
                chartConfig={{
                  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  strokeWidth: 0,
                }}
                accessor="count"
                backgroundColor="transparent"
                paddingLeft="15"
                center={[10, 0]}
                absolute
                avoidFalseZero
                hasLegend={true}
                style={{
                  marginVertical: 8,
                  borderRadius: 16,
                }}
              />
            </View>
          )}

          {/* Detailed Stats */}
          <View style={styles.statsContainer}>
            {Object.entries(currentShop.stats)
              .filter(([key]) => key !== 'total')
              .map(([status, count]) => (
                <View key={status} style={styles.statItem}>
                  <View style={[styles.statusBadge, { backgroundColor: statusColors[status] }]}>
                    <Text style={styles.statusBadgeText}>{statusLabels[status]}</Text>
                  </View>
                  <Text style={styles.statCount}>{count}</Text>
                  <View style={styles.statBarContainer}>
                    <View 
                      style={[
                        styles.statBar, 
                        { 
                          width: `${(count / currentShop.stats.total) * 100}%`,
                          backgroundColor: statusColors[status],
                        }
                      ]}
                    />
                  </View>
                </View>
              ))}
          </View>

          {/* Total Appointments */}
          <View style={styles.totalContainer}>
            <Text style={styles.totalText}>Total Appointments</Text>
            <Text style={styles.totalNumber}>{currentShop.stats.total}</Text>
          </View>

          {/* Appointment List */}
          <View style={styles.appointmentsContainer}>
            <Text style={styles.sectionTitle}>Appointment Details (Newest First)</Text>
            {currentShop.appointments.map((appointment) => (
              <View key={appointment.id} style={styles.appointmentCard}>
                <View style={styles.appointmentHeader}>
                  <Text style={[
                    styles.appointmentStatus,
                    { color: statusColors[appointment.status] }
                  ]}>
                    {statusLabels[appointment.status]}
                  </Text>
                  {appointment.type === 'family' && (
                    <View style={styles.familyBadge}>
                      <Users size={14} color={Colors.primary} />
                      <Text style={styles.familyBadgeText}>Family ({appointment.familySize})</Text>
                    </View>
                  )}
                  <Text style={styles.appointmentDate}>
                    {new Date(appointment.dateTime).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.appointmentBody}>
                  <View style={styles.userInfoRow}>
                    <Text style={styles.userInfoLabel}>User:</Text>
                    <Text style={styles.userInfoValue}>{appointment.userName}</Text>
                  </View>
                  {appointment.user && (
                    <>
                      <View style={styles.userInfoRow}>
                        <Text style={styles.userInfoLabel}>Gender:</Text>
                        <Text style={styles.userInfoValue}>{appointment.user.gender || 'Not specified'}</Text>
                      </View>
                      <View style={styles.userInfoRow}>
                        <Text style={styles.userInfoLabel}>Address:</Text>
                        <Text style={styles.userInfoValue}>{appointment.user.address || 'Not specified'}</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No appointment data available</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16
  },
  headerContent: { 
    flex: 1 
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight
  },
  shopSelectorContainer: {
    backgroundColor: 'white',
    padding: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: Colors.text,
  },
  shopButton: {
    padding: 12,
    marginRight: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    minWidth: 120,
  },
  selectedShopButton: {
    backgroundColor: Colors.primary,
  },
  shopButtonText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  selectedShopButtonText: {
    color: 'white',
  },
  shopStatsText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  shopInfoContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  shopName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: Colors.text,
  },
  capacityContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  capacityItem: {
    alignItems: 'center',
  },
  capacityLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  capacityValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  slotsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  slotItem: {
    alignItems: 'center',
    flex: 1,
  },
  slotLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  slotValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statSummaryItem: {
    alignItems: 'center',
  },
  statSummaryNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  statSummaryLabel: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: Colors.text,
  },
  chartContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 10,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginRight:-20,
    marginLeft:-20,
  },
  statsContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginRight: 10,
    minWidth: 90,
  },
  statusBadgeText: {
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
  },
  statCount: {
    fontWeight: 'bold',
    fontSize: 16,
    color: Colors.text,
    marginRight: 10,
    minWidth: 30,
  },
  statBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  statBar: {
    height: '100%',
  },
  totalContainer: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  totalText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  totalNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 5,
  },
  appointmentsContainer: {
    marginTop: 20,
    marginBottom: 40,
  },
  appointmentCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  appointmentStatus: {
    fontWeight: '600',
    fontSize: 16,
  },
  familyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  familyBadgeText: {
    fontSize: 12,
    color: Colors.primary,
    marginLeft: 4,
  },
  appointmentDate: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  appointmentBody: {
    marginTop: 5,
  },
  userInfoRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  userInfoLabel: {
    fontWeight: '600',
    marginRight: 5,
    color: Colors.text,
  },
  userInfoValue: {
    color: '#7f8c8d',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyText: {
    fontSize: 18,
    color: '#7f8c8d',
    textAlign: 'center',
  },
});

export default StatsScreen;