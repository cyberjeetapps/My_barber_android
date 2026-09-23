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
  RefreshControl,
  FlatList,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/auth';
import {
  ArrowLeft,
  Search,
  X,
  Calendar,
  Store,
  CheckCircle2,
  Clock,
  AlertCircle,
  IndianRupee,
  RefreshCw,
  TrendingUp,
  Percent,
  Wallet,
  ShieldCheck,
  Building2,
  FileSpreadsheet,
} from 'lucide-react-native';
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface OwnerEarningsRecord {
  id: string;
  bookingId: string;
  bookingDisplayId: string;
  serviceName: string;
  shopId: string;
  shopName: string;
  ownerId: string;
  customerPayment: number;
  platformCommission: number;
  ownerEarnings: number;
  paymentStatus: 'SUCCESS' | 'PENDING' | 'FAILED';
  settlementStatus: 'SUCCESS' | 'PENDING' | 'FAILED';
  paymentMethod: 'ONLINE' | 'CASH';
  cashfreeOrderId?: string | null;
  cashfreePaymentId?: string | null;
  cashfreeVendorId?: string | null;
  customerName?: string;
  customerPhone?: string;
  formattedDate: string;
  formattedTime: string;
  rawDate: Date;
}

const parseDate = (dateTimeStr: any, createdAt: any): { formattedDate: string; formattedTime: string; rawDate: Date } => {
  let d: Date | null = null;
  if (dateTimeStr) {
    const parsed = new Date(dateTimeStr);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  if (!d && createdAt) {
    if (typeof createdAt.toDate === 'function') d = createdAt.toDate();
    else if (createdAt._seconds) d = new Date(createdAt._seconds * 1000);
    else if (typeof createdAt === 'string') {
      const parsed = new Date(createdAt);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }
  if (!d) d = new Date();

  return {
    formattedDate: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    formattedTime: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    rawDate: d,
  };
};

export default function OwnerEarningsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [records, setRecords] = useState<OwnerEarningsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'settled' | 'pending'>('all');
  const [shopFilter, setShopFilter] = useState<string>('all');
  const [ownerShops, setOwnerShops] = useState<{ id: string; name: string }[]>([]);

  // Fetch only this owner's financial records
  const fetchOwnerEarnings = useCallback(async () => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    try {
      const currentOwnerId = user.uid;

      // 1. Fetch shops owned by this user
      const shopsQuery = query(
        collection(db, 'shops'),
        where('ownerId', '==', currentOwnerId)
      );
      const shopsSnap = await getDocs(shopsQuery);
      const shopMap: { [id: string]: string } = {};
      const shopList: { id: string; name: string }[] = [];

      shopsSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const sName = d.shopName || 'My Salon';
        shopMap[docSnap.id] = sName;
        shopList.push({ id: docSnap.id, name: sName });
      });
      setOwnerShops(shopList);

      const ownerShopIds = Object.keys(shopMap);
      const earningsList: OwnerEarningsRecord[] = [];
      const seenBookingIds = new Set<string>();

      // 2. Fetch records from payments collection strictly for this owner
      try {
        const paymentsQuery = query(
          collection(db, 'payments'),
          where('ownerId', '==', currentOwnerId)
        );
        const paymentsSnap = await getDocs(paymentsQuery);

        paymentsSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const { formattedDate, formattedTime, rawDate } = parseDate(null, data.createdAt);

          const customerPay = Number(data.totalAmount || 0);
          const platformComm = Number(data.platformAmount || Math.round(customerPay * 0.1));
          const ownerEarn = Number(data.ownerAmount || Math.round(customerPay * 0.9));

          const rawPayStatus = (data.paymentStatus || '').toUpperCase();
          const isPaySuccess = rawPayStatus === 'SUCCESS' || rawPayStatus === 'PAID';
          const isPayFailed = rawPayStatus === 'FAILED';

          const rawSplitStatus = (data.splitStatus || '').toUpperCase();
          const isSettled =
            isPaySuccess &&
            (rawSplitStatus === 'SUCCESS' || rawSplitStatus === 'COMPLETED' || data.cashfreeVendorId);

          const bId = data.bookingId || data.orderId || docSnap.id;
          seenBookingIds.add(bId);

          // Format clean Booking ID
          let displayId = bId;
          if (bId.startsWith('bk_')) {
            const parts = bId.split('_');
            displayId = `BK-${parts[parts.length - 1]}`;
          }

          earningsList.push({
            id: docSnap.id,
            bookingId: bId,
            bookingDisplayId: displayId,
            serviceName: data.serviceName || 'Salon Service',
            shopId: data.shopId || '',
            shopName: shopMap[data.shopId] || 'My Salon',
            ownerId: currentOwnerId,
            customerPayment: customerPay,
            platformCommission: platformComm,
            ownerEarnings: ownerEarn,
            paymentStatus: isPaySuccess ? 'SUCCESS' : isPayFailed ? 'FAILED' : 'PENDING',
            settlementStatus: isSettled ? 'SUCCESS' : isPayFailed ? 'FAILED' : 'PENDING',
            paymentMethod: 'ONLINE',
            cashfreeOrderId: data.cashfreeOrderId || data.orderId || null,
            cashfreePaymentId: data.cashfreePaymentId || null,
            cashfreeVendorId: data.cashfreeVendorId || null,
            customerName: data.customerName,
            formattedDate,
            formattedTime,
            rawDate,
          });
        });
      } catch (pErr) {
        console.warn('Could not query payments by ownerId:', pErr);
      }

      // 3. Also fetch appointments for the owner's shops to cover all paid/completed appointments
      if (ownerShopIds.length > 0) {
        // Chunk shop IDs by 10 (Firestore 'in' query limit)
        for (let i = 0; i < ownerShopIds.length; i += 10) {
          const chunk = ownerShopIds.slice(i, i + 10);
          try {
            const apptQuery = query(
              collection(db, 'appointments'),
              where('shopId', 'in', chunk)
            );
            const apptSnap = await getDocs(apptQuery);

            apptSnap.docs.forEach((docSnap) => {
              const data = docSnap.data();
              const bId = docSnap.id;

              // Avoid duplicates if already fetched via payments
              if (seenBookingIds.has(bId) || seenBookingIds.has(data.cashfreeOrderId)) {
                return;
              }

              const isPaid =
                data.paymentStatus === 'paid' ||
                data.status === 'completed' ||
                data.paymentMethod === 'cash';

              // Only include bookings with payments or completed status
              if (!isPaid && data.status !== 'confirmed') return;

              seenBookingIds.add(bId);

              const customerPay = Number(data.totalPrice ?? data.totalAmount ?? data.servicePrice ?? 0);
              const platformComm = Math.round(customerPay * 0.1);
              const ownerEarn = customerPay - platformComm;

              const isPaySuccess = data.paymentStatus === 'paid' || data.status === 'completed';
              const isSettled =
                isPaySuccess && (data.paymentMethod === 'cash' || data.verified || data.status === 'completed');

              const { formattedDate, formattedTime, rawDate } = parseDate(data.dateTime, data.createdAt);

              let displayId = bId;
              if (bId.length > 8) {
                displayId = `BK-${bId.substring(0, 6).toUpperCase()}`;
              }

              earningsList.push({
                id: docSnap.id,
                bookingId: bId,
                bookingDisplayId: displayId,
                serviceName: data.serviceName || data.service || 'Haircut',
                shopId: data.shopId,
                shopName: shopMap[data.shopId] || data.shopName || 'My Salon',
                ownerId: currentOwnerId,
                customerPayment: customerPay,
                platformCommission: platformComm,
                ownerEarnings: ownerEarn,
                paymentStatus: isPaySuccess ? 'SUCCESS' : 'PENDING',
                settlementStatus: isSettled ? 'SUCCESS' : 'PENDING',
                paymentMethod: (data.paymentMethod || 'cash').toUpperCase() === 'ONLINE' ? 'ONLINE' : 'CASH',
                cashfreeOrderId: data.cashfreeOrderId || null,
                cashfreePaymentId: data.cashfreePaymentId || null,
                customerName: data.userName || data.customerName,
                customerPhone: data.userPhone || data.phone,
                formattedDate,
                formattedTime,
                rawDate,
              });
            });
          } catch (apptErr) {
            console.warn('Could not query appointments for shop chunk:', apptErr);
          }
        }
      }

      // 4. Strict owner isolation filter — enforce in memory as double protection
      const strictOwnerList = earningsList.filter(
        (rec) => rec.ownerId === currentOwnerId
      );

      // Sort by newest first
      strictOwnerList.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

      setRecords(strictOwnerList);
    } catch (err: any) {
      console.error('Error fetching owner earnings:', err);
      Alert.alert('Error', err?.message || 'Failed to load your earnings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    fetchOwnerEarnings();
  }, [fetchOwnerEarnings]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOwnerEarnings();
  };

  // Financial summary metrics
  const summary = useMemo(() => {
    let totalCustomerPayment = 0;
    let totalCommission = 0;
    let totalOwnerEarnings = 0;
    let settledEarnings = 0;
    let pendingEarnings = 0;

    records.forEach((r) => {
      totalCustomerPayment += r.customerPayment;
      totalCommission += r.platformCommission;
      totalOwnerEarnings += r.ownerEarnings;

      if (r.settlementStatus === 'SUCCESS') {
        settledEarnings += r.ownerEarnings;
      } else {
        pendingEarnings += r.ownerEarnings;
      }
    });

    return {
      totalCustomerPayment,
      totalCommission,
      totalOwnerEarnings,
      settledEarnings,
      pendingEarnings,
      count: records.length,
    };
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return records.filter((r) => {
      // Status filter
      if (statusFilter === 'settled' && r.settlementStatus !== 'SUCCESS') return false;
      if (statusFilter === 'pending' && r.settlementStatus !== 'PENDING') return false;

      // Shop filter
      if (shopFilter !== 'all' && r.shopId !== shopFilter) return false;

      // Search filter
      if (q) {
        const matchService = r.serviceName.toLowerCase().includes(q);
        const matchBooking = r.bookingId.toLowerCase().includes(q) || r.bookingDisplayId.toLowerCase().includes(q);
        const matchCustomer = (r.customerName || '').toLowerCase().includes(q);
        const matchShop = r.shopName.toLowerCase().includes(q);
        if (!matchService && !matchBooking && !matchCustomer && !matchShop) return false;
      }

      return true;
    });
  }, [records, statusFilter, shopFilter, searchQuery]);

  // Render individual card matching requested design
  const renderRecordCard = ({ item }: { item: OwnerEarningsRecord }) => {
    const isPaymentSuccess = item.paymentStatus === 'SUCCESS';
    const isSettlementSuccess = item.settlementStatus === 'SUCCESS';

    return (
      <View style={styles.card}>
        {/* Header with Shop & Date */}
        <View style={styles.cardHeader}>
          <View style={styles.shopRow}>
            <Store size={14} color="#2563EB" />
            <Text style={styles.shopName} numberOfLines={1}>
              {item.shopName}
            </Text>
          </View>
          <View style={styles.dateRow}>
            <Calendar size={12} color="#64748B" />
            <Text style={styles.dateText}>{item.formattedDate}</Text>
          </View>
        </View>

        {/* 1. Service */}
        <View style={styles.fieldSection}>
          <Text style={styles.fieldLabel}>Service:</Text>
          <Text style={styles.serviceValue}>{item.serviceName}</Text>
        </View>

        {/* 2. Booking */}
        <View style={styles.fieldSection}>
          <Text style={styles.fieldLabel}>Booking:</Text>
          <Text style={styles.bookingValue}>{item.bookingDisplayId}</Text>
        </View>

        {/* Financial Breakdown Container */}
        <View style={styles.financialBox}>
          {/* 3. Customer payment */}
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Customer payment:</Text>
            <Text style={styles.customerPaymentText}>₹{item.customerPayment.toLocaleString('en-IN')}</Text>
          </View>

          {/* 4. Platform commission */}
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Platform commission (10%):</Text>
            <Text style={styles.commissionText}>-₹{item.platformCommission.toLocaleString('en-IN')}</Text>
          </View>

          <View style={styles.divider} />

          {/* 5. Your earnings */}
          <View style={styles.amountRow}>
            <Text style={styles.yourEarningsLabel}>Your earnings (90%):</Text>
            <Text style={styles.yourEarningsValue}>₹{item.ownerEarnings.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* 6. Payment & 7. Settlement Status Badges */}
        <View style={styles.statusRow}>
          {/* Payment Status */}
          <View style={styles.statusItem}>
            <Text style={styles.fieldLabel}>Payment:</Text>
            <View
              style={[
                styles.badge,
                isPaymentSuccess ? styles.badgeSuccess : styles.badgePending,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  isPaymentSuccess ? styles.badgeTextSuccess : styles.badgeTextPending,
                ]}
              >
                {item.paymentStatus}
              </Text>
            </View>
          </View>

          {/* Settlement Status */}
          <View style={styles.statusItem}>
            <Text style={styles.fieldLabel}>Settlement:</Text>
            <View
              style={[
                styles.badge,
                isSettlementSuccess ? styles.badgeSuccess : styles.badgePending,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  isSettlementSuccess ? styles.badgeTextSuccess : styles.badgeTextPending,
                ]}
              >
                {item.settlementStatus}
              </Text>
            </View>
          </View>
        </View>

        {/* Payment Method Footnote */}
        <View style={styles.cardFooter}>
          <Text style={styles.footerNote}>
            Method: <Text style={{ fontWeight: '600', color: '#1E293B' }}>{item.paymentMethod}</Text>
            {item.cashfreeOrderId ? ` · Cashfree: ${item.cashfreeOrderId}` : ''}
          </Text>
        </View>
      </View>
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
          <Text style={styles.headerTitle}>Earnings & Payouts</Text>
          <Text style={styles.headerSubtitle}>
            Your 90% salon payout records & settlements
          </Text>
        </View>

        <TouchableOpacity
          onPress={onRefresh}
          style={styles.refreshButton}
          activeOpacity={0.7}
        >
          <RefreshCw size={18} color={Colors.textLight} />
        </TouchableOpacity>
      </View>

      {/* KPI Summary Cards */}
      <View style={styles.summaryContainer}>
        {/* Main Net Earnings Card */}
        <View style={styles.mainKpiCard}>
          <View style={styles.kpiTopRow}>
            <Text style={styles.mainKpiLabel}>Your Total Net Earnings (90%)</Text>
            <View style={styles.walletIconContainer}>
              <Wallet size={18} color="#2563EB" />
            </View>
          </View>
          <Text style={styles.mainKpiValue}>₹{summary.totalOwnerEarnings.toLocaleString('en-IN')}</Text>
          <Text style={styles.kpiSubtext}>
            From ₹{summary.totalCustomerPayment.toLocaleString('en-IN')} gross customer payments
          </Text>
        </View>

        {/* Secondary KPI Row */}
        <View style={styles.kpiRow}>
          <View style={[styles.miniKpiCard, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}>
            <Text style={styles.miniKpiLabel}>Settled (SUCCESS)</Text>
            <Text style={[styles.miniKpiValue, { color: '#047857' }]}>
              ₹{summary.settledEarnings.toLocaleString('en-IN')}
            </Text>
          </View>

          <View style={[styles.miniKpiCard, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
            <Text style={styles.miniKpiLabel}>Pending Settlement</Text>
            <Text style={[styles.miniKpiValue, { color: '#B45309' }]}>
              ₹{summary.pendingEarnings.toLocaleString('en-IN')}
            </Text>
          </View>

          <View style={[styles.miniKpiCard, { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }]}>
            <Text style={styles.miniKpiLabel}>Platform Fee (10%)</Text>
            <Text style={[styles.miniKpiValue, { color: '#475467' }]}>
              ₹{summary.totalCommission.toLocaleString('en-IN')}
            </Text>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color="#64748B" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by service, booking ID..."
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

      {/* Status Filter Tabs (High contrast, clearly visible) */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContent}
        >
          <TouchableOpacity
            style={[styles.filterTab, statusFilter === 'all' ? styles.filterTabActive : styles.filterTabInactive]}
            onPress={() => setStatusFilter('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, statusFilter === 'all' ? styles.filterTabTextActive : styles.filterTabTextInactive]}>
              All ({records.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, statusFilter === 'settled' ? styles.filterTabActive : styles.filterTabInactive]}
            onPress={() => setStatusFilter('settled')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, statusFilter === 'settled' ? styles.filterTabTextActive : styles.filterTabTextInactive]}>
              Settled: SUCCESS
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, statusFilter === 'pending' ? styles.filterTabActive : styles.filterTabInactive]}
            onPress={() => setStatusFilter('pending')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, statusFilter === 'pending' ? styles.filterTabTextActive : styles.filterTabTextInactive]}>
              Pending Settlement
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Records Count Bar */}
      <View style={styles.countBar}>
        <Text style={styles.countText}>
          Showing {filteredRecords.length} financial record{filteredRecords.length === 1 ? '' : 's'}
        </Text>
        <Text style={styles.privacyGuarantee}>🔒 Only your salon records</Text>
      </View>

      {/* Records List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading your earnings...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => item.id}
          renderItem={renderRecordCard}
          contentContainerStyle={
            filteredRecords.length === 0 ? styles.emptyListContainer : styles.listContainer
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <AlertCircle size={44} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No earnings records</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No records found matching "${searchQuery}".`
                  : 'Appointments and online payments will appear here as soon as customers book.'}
              </Text>
            </View>
          }
        />
      )}
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
  headerTitle: {
    fontSize: 21,
    fontFamily: 'Poppins-Bold',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
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

  // KPI Summary
  summaryContainer: {
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 12,
  },
  mainKpiCard: {
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
  kpiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  mainKpiLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: '#64748B',
  },
  walletIconContainer: {
    backgroundColor: '#EFF6FF',
    padding: 6,
    borderRadius: 10,
  },
  mainKpiValue: {
    fontSize: 26,
    fontFamily: 'Poppins-Bold',
    color: '#2563EB',
  },
  kpiSubtext: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: '#94A3B8',
    marginTop: 2,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  miniKpiCard: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
  },
  miniKpiLabel: {
    fontSize: 10,
    fontFamily: 'Poppins-Medium',
    color: '#64748B',
    marginBottom: 2,
  },
  miniKpiValue: {
    fontSize: 14,
    fontFamily: 'Poppins-Bold',
  },

  // Search
  searchContainer: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: '#0F172A',
  },

  // Filters
  filterSection: {
    marginTop: 10,
  },
  filtersScroll: {
    flexGrow: 0,
    minHeight: 44,
  },
  filtersContent: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
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
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
  },
  filterTabTextInactive: {
    color: '#334155',
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  countBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  countText: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    color: '#64748B',
  },
  privacyGuarantee: {
    fontSize: 10,
    fontFamily: 'Poppins-Medium',
    color: '#059669',
  },

  // List & Record Cards
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
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    paddingBottom: 8,
    marginBottom: 4,
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  shopName: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    color: '#1E293B',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },

  fieldSection: {
    marginBottom: 2,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
    marginBottom: 1,
  },
  serviceValue: {
    fontSize: 16,
    fontFamily: 'Poppins-Bold',
    color: '#0F172A',
  },
  bookingValue: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#2563EB',
    letterSpacing: 0.5,
  },

  financialBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 4,
    gap: 6,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#475467',
  },
  customerPaymentText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#0F172A',
  },
  commissionText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: '#B42318',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 2,
  },
  yourEarningsLabel: {
    fontSize: 13,
    fontFamily: 'Poppins-Bold',
    color: '#047857',
  },
  yourEarningsValue: {
    fontSize: 17,
    fontFamily: 'Poppins-Bold',
    color: '#047857',
  },

  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  statusItem: {
    flex: 1,
    gap: 4,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgePending: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.5,
  },
  badgeTextSuccess: {
    color: '#047857',
  },
  badgeTextPending: {
    color: '#B45309',
  },

  cardFooter: {
    marginTop: 4,
  },
  footerNote: {
    fontSize: 10,
    fontFamily: 'Poppins-Regular',
    color: '#94A3B8',
  },

  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
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
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 260,
  },
});
