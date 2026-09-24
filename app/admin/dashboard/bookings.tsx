import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
  Linking,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { releaseTimeslotChair } from '@/utils/timeslotAvailability';
import {
  ArrowLeft,
  Search,
  X,
  Calendar,
  Clock,
  MapPin,
  Phone,
  User,
  Users,
  Scissors,
  Check,
  AlertCircle,
  RefreshCw,
  CreditCard,
  ChevronRight,
  Eye,
  ShieldCheck,
  Tag,
  CircleDollarSign,
  Store,
} from 'lucide-react-native';
import {
  collection,
  query,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface AdminBooking {
  id: string;
  sourceCollection: 'appointments' | 'familybookings';
  userId?: string;
  userName: string;
  userPhone: string;
  serviceId?: string;
  serviceName: string;
  servicePrice?: number;
  serviceDescription?: string;
  addOnServices?: Array<{ serviceName: string; servicePrice: number; serviceId?: string }>;
  totalPrice: number;
  shopId?: string;
  shopName: string;
  shopLocation?: string;
  barberName?: string | null;
  barberNumber?: number | null;
  dateTime: string;
  formattedDate: string;
  formattedTime: string;
  rawDate: Date;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show' | string;
  paymentMethod: 'online' | 'cash' | string;
  paymentStatus: 'paid' | 'pending' | 'failed' | 'refunded' | string;
  cashfreeOrderId?: string | null;
  cashfreePaymentId?: string | null;
  razorpayPaymentId?: string | null;
  verificationCode?: string;
  verified?: boolean;
  verifiedAt?: any;
  verifiedBy?: string;
  familySize?: number;
  members?: Array<{ memberNumber?: number; barberNumber?: number; memberName?: string; status?: string }>;
  isWalkIn?: boolean;
  couponCode?: string | null;
  couponDiscount?: number;
  createdAt?: any;
  updatedAt?: any;
}

const parseBookingDate = (
  dateTimeStr: any,
  createdAt: any
): { formattedDate: string; formattedTime: string; rawDate: Date } => {
  let d: Date | null = null;

  if (dateTimeStr) {
    const parsed = new Date(dateTimeStr);
    if (!isNaN(parsed.getTime())) d = parsed;
  }

  if (!d && createdAt) {
    if (typeof createdAt.toDate === 'function') {
      d = createdAt.toDate();
    } else if (createdAt._seconds) {
      d = new Date(createdAt._seconds * 1000);
    } else if (typeof createdAt === 'string') {
      const parsed = new Date(createdAt);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }

  if (!d) d = new Date();

  const formattedDate = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return { formattedDate, formattedTime, rawDate: d };
};

export default function AdminBookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchAllBookings = useCallback(async () => {
    try {
      // 1. Fetch from regular appointments collection
      let regularDocs: any[] = [];
      try {
        const snap = await getDocs(
          query(collection(db, 'appointments'), orderBy('createdAt', 'desc'), limit(300))
        );
        regularDocs = snap.docs;
      } catch {
        const snap = await getDocs(query(collection(db, 'appointments'), limit(300)));
        regularDocs = snap.docs;
      }

      // 2. Fetch from familybookings collection
      let familyDocs: any[] = [];
      try {
        const snap = await getDocs(
          query(collection(db, 'familybookings'), orderBy('createdAt', 'desc'), limit(150))
        );
        familyDocs = snap.docs;
      } catch {
        const snap = await getDocs(query(collection(db, 'familybookings'), limit(150)));
        familyDocs = snap.docs;
      }

      const allItems: AdminBooking[] = [];

      // Map regular appointments
      regularDocs.forEach((docSnap) => {
        const data = docSnap.data();
        const { formattedDate, formattedTime, rawDate } = parseBookingDate(
          data.dateTime,
          data.createdAt
        );

        const customerName =
          data.userName || data.customerName || data.name || (data.isWalkIn ? 'Walk-in Customer' : 'Customer');
        const phone = data.userPhone || data.phone || '—';
        const price = Number(data.totalPrice ?? data.totalAmount ?? data.servicePrice ?? 0);

        allItems.push({
          id: docSnap.id,
          sourceCollection: 'appointments',
          userId: data.userId,
          userName: customerName,
          userPhone: phone,
          serviceId: data.serviceId,
          serviceName: data.serviceName || data.service || 'Hair & Grooming',
          servicePrice: Number(data.servicePrice || price),
          serviceDescription: data.serviceDescription,
          addOnServices: Array.isArray(data.addOnServices) ? data.addOnServices : [],
          totalPrice: price,
          shopId: data.shopId,
          shopName: data.shopName || 'Salon',
          shopLocation: data.shopLocation,
          barberName: data.barberName || null,
          barberNumber: data.barberNumber || null,
          dateTime: data.dateTime || rawDate.toISOString(),
          formattedDate,
          formattedTime,
          rawDate,
          status: (data.status || 'pending').toLowerCase(),
          paymentMethod: (data.paymentMethod || 'cash').toLowerCase(),
          paymentStatus: (data.paymentStatus || (data.paymentMethod === 'online' ? 'paid' : 'pending')).toLowerCase(),
          cashfreeOrderId: data.cashfreeOrderId || null,
          cashfreePaymentId: data.cashfreePaymentId || null,
          razorpayPaymentId: data.razorpayPaymentId || null,
          verificationCode: data.verificationCode || '—',
          verified: Boolean(data.verified),
          verifiedAt: data.verifiedAt,
          verifiedBy: data.verifiedBy,
          isWalkIn: Boolean(data.isWalkIn),
          couponCode: data.couponCode || null,
          couponDiscount: Number(data.couponDiscount || 0),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      });

      // Map family bookings
      familyDocs.forEach((docSnap) => {
        const data = docSnap.data();
        const { formattedDate, formattedTime, rawDate } = parseBookingDate(
          data.dateTime,
          data.createdAt
        );

        const customerName =
          data.userName || data.customerName || data.name || 'Family Booking';
        const phone = data.userPhone || data.phone || '—';
        const price = Number(data.totalPrice ?? data.totalAmount ?? data.servicePrice ?? 0);

        allItems.push({
          id: docSnap.id,
          sourceCollection: 'familybookings',
          userId: data.userId,
          userName: customerName,
          userPhone: phone,
          serviceId: data.serviceId,
          serviceName: data.serviceName || data.service || 'Family Package',
          servicePrice: Number(data.servicePrice || 0),
          serviceDescription: data.serviceDescription,
          addOnServices: Array.isArray(data.addOnServices) ? data.addOnServices : [],
          totalPrice: price,
          shopId: data.shopId,
          shopName: data.shopName || 'Salon',
          shopLocation: data.shopLocation,
          barberName: data.barberName || null,
          barberNumber: null,
          dateTime: data.dateTime || rawDate.toISOString(),
          formattedDate,
          formattedTime,
          rawDate,
          status: (data.status || 'pending').toLowerCase(),
          paymentMethod: (data.paymentMethod || 'cash').toLowerCase(),
          paymentStatus: (data.paymentStatus || (data.paymentMethod === 'online' ? 'paid' : 'pending')).toLowerCase(),
          cashfreeOrderId: data.cashfreeOrderId || null,
          cashfreePaymentId: data.cashfreePaymentId || null,
          razorpayPaymentId: data.razorpayPaymentId || null,
          verificationCode: data.verificationCode || '—',
          verified: Boolean(data.verified),
          verifiedAt: data.verifiedAt,
          familySize: Number(data.familySize || (Array.isArray(data.members) ? data.members.length : 1)),
          members: Array.isArray(data.members) ? data.members : [],
          isWalkIn: false,
          couponCode: data.couponCode || null,
          couponDiscount: Number(data.couponDiscount || 0),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      });

      // Sort by rawDate / createdAt descending
      allItems.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

      setBookings(allItems);
    } catch (error: any) {
      console.error('Error loading bookings:', error);
      Alert.alert('Load Error', error?.message || 'Failed to load bookings from database.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllBookings();
  }, [fetchAllBookings]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAllBookings();
  };

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = {
      all: bookings.length,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      'no-show': 0,
    };
    bookings.forEach((b) => {
      const s = b.status.toLowerCase();
      if (s === 'pending') counts.pending++;
      else if (s === 'confirmed') counts.confirmed++;
      else if (s === 'completed') counts.completed++;
      else if (s === 'cancelled') counts.cancelled++;
      else if (s === 'no-show' || s === 'noshow') counts['no-show']++;
    });
    return counts;
  }, [bookings]);

  // Filtered list
  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return bookings.filter((b) => {
      // 1. Status Filter
      if (selectedStatusFilter !== 'all') {
        const s = b.status.toLowerCase();
        if (selectedStatusFilter === 'no-show') {
          if (s !== 'no-show' && s !== 'noshow') return false;
        } else if (s !== selectedStatusFilter) {
          return false;
        }
      }

      // 2. Type Filter
      if (selectedTypeFilter === 'individual' && (b.sourceCollection === 'familybookings' || b.isWalkIn)) {
        return false;
      }
      if (selectedTypeFilter === 'family' && b.sourceCollection !== 'familybookings') {
        return false;
      }
      if (selectedTypeFilter === 'walkin' && !b.isWalkIn) {
        return false;
      }

      // 3. Search query
      if (q) {
        const matchesName = b.userName.toLowerCase().includes(q);
        const matchesPhone = b.userPhone.toLowerCase().includes(q);
        const matchesShop = b.shopName.toLowerCase().includes(q);
        const matchesService = b.serviceName.toLowerCase().includes(q);
        const matchesCode = b.verificationCode?.toLowerCase().includes(q);
        const matchesId = b.id.toLowerCase().includes(q);
        const matchesCashfree = b.cashfreeOrderId?.toLowerCase().includes(q) || b.cashfreePaymentId?.toLowerCase().includes(q);
        const matchesBarber = b.barberName?.toLowerCase().includes(q);

        if (!matchesName && !matchesPhone && !matchesShop && !matchesService && !matchesCode && !matchesId && !matchesCashfree && !matchesBarber) {
          return false;
        }
      }

      return true;
    });
  }, [bookings, selectedStatusFilter, selectedTypeFilter, searchQuery]);

  // Update status function
  const handleUpdateStatus = async (booking: AdminBooking, newStatus: string) => {
    try {
      setActionLoadingId(booking.id);

      const targetRef = doc(db, booking.sourceCollection, booking.id);
      await updateDoc(targetRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      // If cancelling: release occupied timeslot chair
      if (newStatus === 'cancelled' && booking.shopId && booking.dateTime) {
        const chairNumbers: number[] = [];
        if (booking.barberNumber) {
          chairNumbers.push(booking.barberNumber);
        } else if (booking.members && booking.members.length > 0) {
          booking.members.forEach((m) => {
            if (typeof m.barberNumber === 'number') chairNumbers.push(m.barberNumber);
          });
        }

        await releaseTimeslotChair({
          shopId: booking.shopId,
          dateTimeISO: booking.dateTime,
          chairNumbers,
          slotsToRelease: booking.familySize || 1,
        });
      }

      // Optimistic update
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, status: newStatus } : b))
      );

      if (selectedBooking && selectedBooking.id === booking.id) {
        setSelectedBooking((prev) => (prev ? { ...prev, status: newStatus } : null));
      }

      Alert.alert('Status Updated', `Booking has been marked as ${newStatus.toUpperCase()}.`);
    } catch (err: any) {
      console.error('Update status error:', err);
      Alert.alert('Error', err?.message || 'Failed to update booking status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmStatusChange = (booking: AdminBooking, newStatus: string) => {
    Alert.alert(
      'Confirm Status Change',
      `Are you sure you want to mark this booking as "${newStatus.toUpperCase()}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: newStatus === 'cancelled' ? 'destructive' : 'default',
          onPress: () => handleUpdateStatus(booking, newStatus),
        },
      ]
    );
  };

  const getStatusBadgeStyle = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'confirmed':
        return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', label: 'Confirmed' };
      case 'completed':
        return { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0', label: 'Completed' };
      case 'cancelled':
        return { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA', label: 'Cancelled' };
      case 'no-show':
      case 'noshow':
        return { bg: '#F1F5F9', text: '#475467', border: '#CBD5E1', label: 'No-show' };
      case 'pending':
      default:
        return { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', label: 'Pending' };
    }
  };

  const statusFilterTabs = [
    { id: 'all', label: 'All', count: statusCounts.all },
    { id: 'pending', label: 'Pending', count: statusCounts.pending },
    { id: 'confirmed', label: 'Confirmed', count: statusCounts.confirmed },
    { id: 'completed', label: 'Completed', count: statusCounts.completed },
    { id: 'cancelled', label: 'Cancelled', count: statusCounts.cancelled },
    { id: 'no-show', label: 'No-show', count: statusCounts['no-show'] },
  ];

  const typeFilterChips = [
    { id: 'all', label: 'All Types' },
    { id: 'individual', label: '👤 Individual' },
    { id: 'family', label: '👨‍👩‍👧‍👦 Family' },
    { id: 'walkin', label: '🚶 Walk-in' },
  ];

  const renderBookingCard = ({ item }: { item: AdminBooking }) => {
    const statusStyle = getStatusBadgeStyle(item.status);
    const isUpdating = actionLoadingId === item.id;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => setSelectedBooking(item)}
      >
        {/* Card Header: Customer Name & Status Badge */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={styles.customerRow}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.userName}
              </Text>
              {item.sourceCollection === 'familybookings' ? (
                <View style={styles.familyBadge}>
                  <Users size={12} color="#7C3AED" />
                  <Text style={styles.familyBadgeText}>{item.familySize || 2} Pax</Text>
                </View>
              ) : item.isWalkIn ? (
                <View style={styles.walkInBadge}>
                  <Text style={styles.walkInBadgeText}>Walk-in</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.phoneRow}>
              <Phone size={12} color={Colors.textLight} />
              <Text style={styles.phoneText}>{item.userPhone}</Text>
            </View>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
            <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
              {statusStyle.label}
            </Text>
          </View>
        </View>

        {/* Salon & Service */}
        <View style={styles.cardBody}>
          <View style={styles.metaRow}>
            <Store size={14} color="#2563EB" />
            <Text style={styles.shopName} numberOfLines={1}>
              {item.shopName}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Scissors size={14} color="#64748B" />
            <Text style={styles.serviceName} numberOfLines={1}>
              {item.serviceName}
            </Text>
            {item.addOnServices && item.addOnServices.length > 0 && (
              <View style={styles.addOnTag}>
                <Text style={styles.addOnTagText}>+{item.addOnServices.length} add-on</Text>
              </View>
            )}
          </View>

          {/* Barber or Chair */}
          {item.barberName ? (
            <View style={styles.metaRow}>
              <User size={14} color="#64748B" />
              <Text style={styles.metaText}>
                Barber: <Text style={styles.metaHighlight}>{item.barberName}</Text>
              </Text>
            </View>
          ) : item.barberNumber ? (
            <View style={styles.metaRow}>
              <User size={14} color="#64748B" />
              <Text style={styles.metaText}>
                Assigned Chair: <Text style={styles.metaHighlight}>Chair #{item.barberNumber}</Text>
              </Text>
            </View>
          ) : null}

          {/* Date & Time */}
          <View style={styles.scheduleRow}>
            <View style={styles.scheduleItem}>
              <Calendar size={13} color="#2563EB" />
              <Text style={styles.scheduleText}>{item.formattedDate}</Text>
            </View>
            <View style={styles.scheduleItem}>
              <Clock size={13} color="#2563EB" />
              <Text style={styles.scheduleText}>{item.formattedTime}</Text>
            </View>
          </View>
        </View>

        {/* Price & Payment Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.priceContainer}>
            <Text style={styles.totalPrice}>₹{item.totalPrice}</Text>
            <View
              style={[
                styles.paymentPill,
                item.paymentStatus === 'paid' ? styles.paymentPaid : styles.paymentPending,
              ]}
            >
              <CreditCard size={11} color={item.paymentStatus === 'paid' ? '#047857' : '#B45309'} />
              <Text
                style={[
                  styles.paymentPillText,
                  item.paymentStatus === 'paid' ? styles.paymentPaidText : styles.paymentPendingText,
                ]}
              >
                {item.paymentMethod.toUpperCase()} · {item.paymentStatus.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Verification Code */}
          <View style={styles.verificationContainer}>
            {item.verified ? (
              <View style={styles.verifiedTag}>
                <ShieldCheck size={12} color="#059669" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : (
              <View style={styles.codeTag}>
                <Text style={styles.codeLabel}>Code:</Text>
                <Text style={styles.codeValue}>{item.verificationCode}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick Action Toolbar */}
        <View style={styles.actionToolbar}>
          {isUpdating ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ padding: 8 }} />
          ) : (
            <>
              {item.status === 'pending' && (
                <TouchableOpacity
                  style={[styles.quickButton, styles.confirmButton]}
                  onPress={() => confirmStatusChange(item, 'confirmed')}
                >
                  <Check size={13} color="#FFFFFF" />
                  <Text style={styles.quickButtonTextLight}>Confirm</Text>
                </TouchableOpacity>
              )}

              {item.status === 'confirmed' && (
                <>
                  <TouchableOpacity
                    style={[styles.quickButton, styles.completeButton]}
                    onPress={() => confirmStatusChange(item, 'completed')}
                  >
                    <Check size={13} color="#FFFFFF" />
                    <Text style={styles.quickButtonTextLight}>Complete</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.quickButton, styles.noShowButton]}
                    onPress={() => confirmStatusChange(item, 'no-show')}
                  >
                    <Text style={styles.noShowButtonText}>No-show</Text>
                  </TouchableOpacity>
                </>
              )}

              {item.status !== 'cancelled' && item.status !== 'completed' && (
                <TouchableOpacity
                  style={[styles.quickButton, styles.cancelButton]}
                  onPress={() => confirmStatusChange(item, 'cancelled')}
                >
                  <X size={13} color="#B91C1C" />
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.quickButton, styles.viewDetailsButton]}
                onPress={() => setSelectedBooking(item)}
              >
                <Eye size={13} color="#334155" />
                <Text style={styles.viewDetailsText}>Details</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle}>All Bookings</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{bookings.length}</Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>
            Platform-wide appointment & family booking operations
          </Text>
        </View>

        <TouchableOpacity
          onPress={onRefresh}
          style={styles.refreshButton}
          activeOpacity={0.7}
        >
          <RefreshCw size={19} color={Colors.textLight} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color="#64748B" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by customer, phone, salon, code..."
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
            <X size={18} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status Filter Tabs (High contrast, clearly visible text) */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContent}
        >
          {statusFilterTabs.map((tab) => {
            const isActive = selectedStatusFilter === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setSelectedStatusFilter(tab.id)}
                activeOpacity={0.7}
                style={[
                  styles.filterTab,
                  isActive ? styles.filterTabActive : styles.filterTabInactive,
                ]}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    isActive ? styles.filterTabTextActive : styles.filterTabTextInactive,
                  ]}
                >
                  {tab.label}
                </Text>
                <View
                  style={[
                    styles.tabBadge,
                    isActive ? styles.tabBadgeActive : styles.tabBadgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      isActive ? styles.tabBadgeTextActive : styles.tabBadgeTextInactive,
                    ]}
                  >
                    {tab.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Booking Type Filter Chips */}
      <View style={styles.typeSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.typesScroll}
          contentContainerStyle={styles.typesContent}
        >
          {typeFilterChips.map((chip) => {
            const isActive = selectedTypeFilter === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                onPress={() => setSelectedTypeFilter(chip.id)}
                activeOpacity={0.7}
                style={[
                  styles.typeChip,
                  isActive ? styles.typeChipActive : styles.typeChipInactive,
                ]}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    isActive ? styles.typeChipTextActive : styles.typeChipTextInactive,
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Results Header Count */}
      <View style={styles.resultsInfo}>
        <Text style={styles.resultsCountText}>
          Showing {filteredBookings.length} of {bookings.length} bookings
        </Text>
      </View>

      {/* Bookings List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Syncing bookings from database...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => item.id}
          renderItem={renderBookingCard}
          contentContainerStyle={
            filteredBookings.length === 0 ? styles.emptyListContainer : styles.listContainer
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <AlertCircle size={44} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No bookings found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No bookings match "${searchQuery}". Try a different term or clear filters.`
                  : 'No appointments recorded in this category yet.'}
              </Text>
              {(searchQuery !== '' || selectedStatusFilter !== 'all' || selectedTypeFilter !== 'all') && (
                <TouchableOpacity
                  style={styles.clearFiltersButton}
                  onPress={() => {
                    setSearchQuery('');
                    setSelectedStatusFilter('all');
                    setSelectedTypeFilter('all');
                  }}
                >
                  <Text style={styles.clearFiltersText}>Reset All Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Booking Details Modal */}
      <Modal
        visible={!!selectedBooking}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedBooking(null)}
      >
        {selectedBooking && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              {/* Modal Head */}
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Booking Details</Text>
                  <Text style={styles.modalSubtitle}>ID: {selectedBooking.id}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedBooking(null)}
                  style={styles.modalCloseButton}
                >
                  <X size={20} color={Colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Customer Information Card */}
                <View style={styles.modalSectionCard}>
                  <Text style={styles.sectionHeader}>Customer Information</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Name</Text>
                    <Text style={styles.detailValueBold}>{selectedBooking.userName}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Phone</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.detailValue}>{selectedBooking.userPhone}</Text>
                      {selectedBooking.userPhone !== '—' && (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(`tel:${selectedBooking.userPhone}`)}
                          style={styles.callIconBtn}
                        >
                          <Phone size={12} color="#2563EB" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  {selectedBooking.userId && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>User UID</Text>
                      <Text style={[styles.detailValue, { fontSize: 11, color: '#64748B' }]}>
                        {selectedBooking.userId}
                      </Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Booking Type</Text>
                    <Text style={styles.detailValue}>
                      {selectedBooking.sourceCollection === 'familybookings'
                        ? `👨‍👩‍👧‍👦 Family (${selectedBooking.familySize || 2} Pax)`
                        : selectedBooking.isWalkIn
                        ? '🚶 Walk-in'
                        : '👤 Individual Booking'}
                    </Text>
                  </View>
                </View>

                {/* Salon & Service Details */}
                <View style={styles.modalSectionCard}>
                  <Text style={styles.sectionHeader}>Salon & Service</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Salon</Text>
                    <Text style={styles.detailValueBold}>{selectedBooking.shopName}</Text>
                  </View>
                  {selectedBooking.shopLocation && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Address</Text>
                      <Text style={[styles.detailValue, { maxWidth: '65%' }]}>
                        {selectedBooking.shopLocation}
                      </Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Primary Service</Text>
                    <Text style={styles.detailValueBold}>{selectedBooking.serviceName}</Text>
                  </View>
                  {selectedBooking.barberName && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Assigned Barber</Text>
                      <Text style={styles.detailValue}>{selectedBooking.barberName}</Text>
                    </View>
                  )}
                  {selectedBooking.barberNumber && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Chair Number</Text>
                      <Text style={styles.detailValue}>Chair #{selectedBooking.barberNumber}</Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Scheduled Date</Text>
                    <Text style={styles.detailValueBold}>{selectedBooking.formattedDate}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Scheduled Time</Text>
                    <Text style={styles.detailValueBold}>{selectedBooking.formattedTime}</Text>
                  </View>

                  {/* Add-ons if present */}
                  {selectedBooking.addOnServices && selectedBooking.addOnServices.length > 0 && (
                    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: '#F1F5F9' }}>
                      <Text style={[styles.detailLabel, { marginBottom: 6 }]}>Add-on Services:</Text>
                      {selectedBooking.addOnServices.map((addon, index) => (
                        <View key={index} style={styles.addonItemRow}>
                          <Text style={styles.addonName}>• {addon.serviceName}</Text>
                          <Text style={styles.addonPrice}>₹{addon.servicePrice}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Family Members breakdown if family booking */}
                {selectedBooking.members && selectedBooking.members.length > 0 && (
                  <View style={styles.modalSectionCard}>
                    <Text style={styles.sectionHeader}>Family Members ({selectedBooking.members.length})</Text>
                    {selectedBooking.members.map((m, idx) => (
                      <View key={idx} style={styles.memberRow}>
                        <Text style={styles.memberName}>{m.memberName || `Member ${idx + 1}`}</Text>
                        <Text style={styles.memberChair}>Chair #{m.barberNumber || '—'}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Payment & Verification */}
                <View style={styles.modalSectionCard}>
                  <Text style={styles.sectionHeader}>Payment & Verification</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Total Amount</Text>
                    <Text style={[styles.detailValueBold, { fontSize: 16, color: '#047857' }]}>
                      ₹{selectedBooking.totalPrice}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Payment Method</Text>
                    <Text style={styles.detailValue}>{selectedBooking.paymentMethod.toUpperCase()}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Payment Status</Text>
                    <Text style={[styles.detailValueBold, { textTransform: 'uppercase' }]}>
                      {selectedBooking.paymentStatus}
                    </Text>
                  </View>
                  {selectedBooking.cashfreeOrderId && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Cashfree Order ID</Text>
                      <Text style={[styles.detailValue, { fontSize: 11, color: '#2563EB' }]}>
                        {selectedBooking.cashfreeOrderId}
                      </Text>
                    </View>
                  )}
                  {selectedBooking.cashfreePaymentId && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Cashfree Payment ID</Text>
                      <Text style={[styles.detailValue, { fontSize: 11, color: '#2563EB' }]}>
                        {selectedBooking.cashfreePaymentId}
                      </Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Check-in Code</Text>
                    <Text style={[styles.detailValueBold, { fontSize: 16, letterSpacing: 2 }]}>
                      {selectedBooking.verificationCode}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Check-in Status</Text>
                    <Text
                      style={[
                        styles.detailValueBold,
                        { color: selectedBooking.verified ? '#047857' : '#B45309' },
                      ]}
                    >
                      {selectedBooking.verified ? '✅ Verified at Salon' : '⏳ Not yet verified'}
                    </Text>
                  </View>
                </View>

                {/* Change Status Section */}
                <View style={[styles.modalSectionCard, { marginBottom: 32 }]}>
                  <Text style={styles.sectionHeader}>Change Booking Status</Text>
                  <View style={styles.statusButtonsGrid}>
                    {['pending', 'confirmed', 'completed', 'cancelled', 'no-show'].map((st) => {
                      const isCurrent = selectedBooking.status === st;
                      return (
                        <TouchableOpacity
                          key={st}
                          onPress={() => confirmStatusChange(selectedBooking, st)}
                          disabled={isCurrent}
                          style={[
                            styles.statusOptionButton,
                            isCurrent && styles.statusOptionCurrent,
                            st === 'cancelled' && !isCurrent && styles.statusOptionCancel,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusOptionText,
                              isCurrent && styles.statusOptionTextCurrent,
                              st === 'cancelled' && !isCurrent && { color: '#B91C1C' },
                            ]}
                          >
                            {st === 'no-show' ? 'No-show' : st.charAt(0).toUpperCase() + st.slice(1)}
                            {isCurrent ? ' (Current)' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Poppins-Bold',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
    marginTop: 1,
  },
  countBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    color: '#1D4ED8',
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchContainer: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: '#0F172A',
  },

  // High contrast filter tabs
  filterSection: {
    marginTop: 12,
  },
  filtersScroll: {
    flexGrow: 0,
    minHeight: 46,
  },
  filtersContent: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
  },
  filterTabInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  filterTabActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterTabText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
  },
  filterTabTextInactive: {
    color: '#1E293B', // Bold dark text — 100% visible on white/light gray
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#FFFFFF', // Crisp white text on blue
    fontWeight: '700',
  },
  tabBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeInactive: {
    backgroundColor: '#F1F5F9',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
  },
  tabBadgeTextInactive: {
    color: '#475467',
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },

  // Type filter chips
  typeSection: {
    marginTop: 8,
  },
  typesScroll: {
    flexGrow: 0,
  },
  typesContent: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  typeChipInactive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  typeChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  typeChipText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
  },
  typeChipTextInactive: {
    color: '#475467',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  resultsInfo: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 6,
  },
  resultsCountText: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    color: '#64748B',
  },

  // List & Cards
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    paddingBottom: 10,
    marginBottom: 10,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  customerName: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    color: '#0F172A',
  },
  familyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  familyBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: '#7C3AED',
  },
  walkInBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  walkInBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: '#92400E',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  phoneText: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
  },
  cardBody: {
    gap: 6,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shopName: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#1E293B',
    flex: 1,
  },
  serviceName: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: '#475467',
  },
  addOnTag: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  addOnTagText: {
    fontSize: 10,
    fontFamily: 'Poppins-Medium',
    color: '#4F46E5',
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },
  metaHighlight: {
    fontFamily: 'Poppins-SemiBold',
    color: '#0F172A',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: '#F8FAFC',
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scheduleText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: '#334155',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 10,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  totalPrice: {
    fontSize: 17,
    fontFamily: 'Poppins-Bold',
    color: '#0F172A',
  },
  paymentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  paymentPillText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
  },
  paymentPaid: {
    backgroundColor: '#ECFDF5',
  },
  paymentPaidText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: '#047857',
  },
  paymentPending: {
    backgroundColor: '#FFFBEB',
  },
  paymentPendingText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: '#B45309',
  },
  verificationContainer: {},
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  verifiedText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: '#047857',
  },
  codeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  codeLabel: {
    fontSize: 10,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },
  codeValue: {
    fontSize: 12,
    fontFamily: 'Poppins-Bold',
    color: '#0F172A',
    letterSpacing: 1,
  },

  // Action Toolbar
  actionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#F8FAFC',
    justifyContent: 'flex-end',
  },
  quickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  confirmButton: {
    backgroundColor: '#2563EB',
  },
  completeButton: {
    backgroundColor: '#059669',
  },
  noShowButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  noShowButtonText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    color: '#475467',
  },
  cancelButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelButtonText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    color: '#B91C1C',
  },
  viewDetailsButton: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  viewDetailsText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    color: '#334155',
  },
  quickButtonTextLight: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFFFFF',
  },

  // Center / Empty States
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    color: '#0F172A',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 260,
  },
  clearFiltersButton: {
    marginTop: 12,
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  clearFiltersText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFFFFF',
  },

  // Modal Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 22,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 19,
    fontFamily: 'Poppins-Bold',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalSectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    gap: 8,
  },
  sectionHeader: {
    fontSize: 14,
    fontFamily: 'Poppins-Bold',
    color: '#0F172A',
    marginBottom: 4,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },
  detailValue: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: '#0F172A',
    textAlign: 'right',
  },
  detailValueBold: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#0F172A',
    textAlign: 'right',
  },
  callIconBtn: {
    backgroundColor: '#EFF6FF',
    padding: 5,
    borderRadius: 8,
  },
  addonItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  addonName: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#334155',
  },
  addonPrice: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    color: '#0F172A',
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  memberName: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: '#1E293B',
  },
  memberChair: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },
  statusButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  statusOptionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  statusOptionCurrent: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  statusOptionCancel: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  statusOptionText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: '#334155',
  },
  statusOptionTextCurrent: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
