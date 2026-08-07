import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Animated,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { 
  Calendar, 
  CalendarClock,
  Armchair,
  Users, 
  Scissors, 
  LogOut, 
  ChevronRight, 
  Box, 
  Tag, 
  Receipt,
  Store,
  User,
  Sparkles,
  BarChart3,
  ContactRound,
  UserRoundCog,
  Globe,
  ClipboardList,
  Settings,
  Megaphone,
  Clock,
  Thermometer,
  Car,
  Home,
  Edit2,
  XCircle,
  CheckCircle2,
} from 'lucide-react-native';
import { useAuth } from '@/context/auth';
import { useLanguage } from '@/context/LanguageContext';
import LanguagePicker from '@/components/LanguagePicker';
import * as SecureStore from 'expo-secure-store';
import { auth, db } from '@/config/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';

// Custom FadeIn component using react-native Animated
const FadeInView = ({ children, delay = 0, duration = 500, style }: any) => {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration,
        useNativeDriver: true,
      }).start();
    }, delay);

    return () => {
      clearTimeout(timer);
      fadeAnim.setValue(0);
    };
  }, [delay, duration, fadeAnim]);

  return (
    <Animated.View style={[style, { opacity: fadeAnim }]}>
      {children}
    </Animated.View>
  );
};

// Custom FadeInUp component
const FadeInUpView = ({ children, delay = 0, duration = 500, style }: any) => {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(20)).current;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => {
      clearTimeout(timer);
      fadeAnim.setValue(0);
      translateY.setValue(20);
    };
  }, [delay, duration, fadeAnim, translateY]);

  return (
    <Animated.View 
      style={[
        style, 
        { 
          opacity: fadeAnim,
          transform: [{ translateY }]
        }
      ]}
    >
      {children}
    </Animated.View>
  );
};

export default function OwnerDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, owner, logout, isLoading } = useAuth();
  const { language, translate } = useLanguage();
  const [showLanguagePicker, setShowLanguagePicker] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [navigationState, setNavigationState] = React.useState<{ [key: string]: boolean }>({});
  const [ownerShops, setOwnerShops] = React.useState<any[]>([]);
  const [shopsLoading, setShopsLoading] = React.useState(true);
  const [ownerData, setOwnerData] = React.useState<any>(null);

  // Owners created before the referral feature existed won't have a code
  // yet — generate and save one the first time their dashboard loads,
  // rather than leaving them permanently unable to refer anyone.
  React.useEffect(() => {
    if (!user?.uid || !ownerData || ownerData.ownerReferralCode) return;
    const code = `OW${user.uid.slice(0, 6).toUpperCase()}`;
    updateDoc(doc(db, 'barberowner', user.uid), { ownerReferralCode: code })
      .then(() => setOwnerData((prev: any) => ({ ...prev, ownerReferralCode: code })))
      .catch((err) => console.warn('Could not backfill owner referral code:', err));
  }, [user?.uid, ownerData]);

  // Fetch owner's data and shops
  React.useEffect(() => {
    const fetchOwnerData = async () => {
      if (!user?.uid) return;
      
      try {
        setShopsLoading(true);
        
        // 1. Fetch owner profile data from barberowner collection
        const ownerRef = doc(db, 'barberowner', user.uid);
        const ownerSnap = await getDoc(ownerRef);
        
        if (ownerSnap.exists()) {
          setOwnerData(ownerSnap.data());
        }

        // 2. Fetch owner's shops
        const shopsQuery = query(
          collection(db, 'shops'),
          where('ownerId', '==', user.uid)
        );
        const shopsSnapshot = await getDocs(shopsQuery);
        
        const shopsData = shopsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any)
        }));
        
        setOwnerShops(shopsData);
      } catch (error) {
        console.error('Error fetching owner data:', error);
      } finally {
        setShopsLoading(false);
      }
    };

    fetchOwnerData();
  }, [user?.uid]);



  const handleNavigation = (route: string) => {
    if (navigationState[route]) return;

    setNavigationState(prev => ({ ...prev, [route]: true }));

    try {
      setTimeout(() => {
        router.push(route as any);
        setTimeout(() => {
          setNavigationState(prev => ({ ...prev, [route]: false }));
        }, 1500);
      }, 200);
    } catch (error) {
      console.error(`Navigation error for ${route}:`, error);
      Alert.alert('Navigation Error', `Failed to navigate to ${route}`);
      setNavigationState(prev => ({ ...prev, [route]: false }));
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;

    try {
      setIsSigningOut(true);

      // 1. Update Firestore status
      if (user?.uid) {
        try {
          const ownerRef = doc(db, 'barberowner', user.uid);
          await updateDoc(ownerRef, {
            isLoggedIn: false,
            lastLogout: new Date().toISOString(),
          });
        } catch (firestoreError) {
          console.warn('Firestore status update failed:', firestoreError);
        }
      }

      // 2. Clear storage
      await clearOwnerStorage();

      // 3. Auth context logout
      await logout();

      // 4. Navigate to login
      if (Platform.OS === 'web') {
        (window as any).location.href = '/owner/login';
      } else {
        router.replace('/owner/login' as any);
      }

    } catch (error: any) {
      console.error('Sign out error:', error?.message);

      // Fallback
      try {
        await clearOwnerStorage();
        if (Platform.OS === 'web') {
          (window as any).location.href = '/owner/login?error=signout';
        } else {
          router.replace('/owner/login' as any);
        }
      } catch (fallbackError: any) {
        console.error('Fallback sign out failed:', fallbackError?.message);
        Alert.alert('Error', 'Failed to sign out. Please close and reopen the app.');
      }
    } finally {
      setIsSigningOut(false);
    }
  };

  const clearOwnerStorage = async () => {
    try {
      const storageKeys = ['owner_session', 'user_session'];
      for (const key of storageKeys) {
        if (Platform.OS === 'web') {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        } else {
          await SecureStore.deleteItemAsync(key);
        }
      }
    } catch {
      // storage clearance is best-effort
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    // Refresh owner data and shops
    if (user?.uid) {
      try {
        // Refresh owner profile
        const ownerRef = doc(db, 'barberowner', user.uid);
        const ownerSnap = await getDoc(ownerRef);
        if (ownerSnap.exists()) {
          setOwnerData(ownerSnap.data());
        }

        // Refresh shops
        const shopsQuery = query(
          collection(db, 'shops'),
          where('ownerId', '==', user.uid)
        );
        const shopsSnapshot = await getDocs(shopsQuery);
        const shopsData = shopsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any)
        }));
        setOwnerShops(shopsData);
      } catch (error) {
        console.error('Error refreshing data:', error);
      }
    }
    setRefreshing(false);
  }, [user?.uid]);

  const baseMenuItems = [
    {
      icon: <CalendarClock size={24} color={Colors.primary} />,
      title: "Today's Board",
      subtitle: "Live timeline for today's appointments",
      route: '/owner/dashboard/today-board',
    },
    {
      icon: <Calendar size={24} color={Colors.primary} />,
      title: 'Bookings',
      subtitle: 'Manage appointments',
      route: '/owner/dashboard/bookings',
    },
    {
      icon: <Scissors size={24} color={Colors.primary} />,
      title: 'Services',
      subtitle: 'Manage services and pricing',
      route: '/owner/dashboard/services',
    },
    {
      icon: <Box size={24} color={Colors.primary} />,
      title: 'Packages',
      subtitle: 'Create and manage packages',
      route: '/owner/dashboard/packages',
    },
    {
      icon: <Tag size={24} color={Colors.primary} />,
      title: 'Offers',
      subtitle: 'Manage offers and discounts',
      route: '/owner/dashboard/offers',
    },
    {
      icon: <Receipt size={24} color={Colors.primary} />,
      title: 'Offline payments',
      subtitle: 'Manage your offline payments',
      route: '/owner/dashboard/offlinepayments',
    },
    {
      icon: <ContactRound size={24} color={Colors.primary} />,
      title: 'Customer CRM',
      subtitle: 'Customer value, visits and retention',
      route: '/owner/dashboard/customers',
    },
    {
      icon: <UserRoundCog size={24} color={Colors.primary} />,
      title: 'Staff & Chairs',
      subtitle: 'Manage your team directly',
      route: '/owner/dashboard/staff',
    },
    {
      icon: <Armchair size={24} color={Colors.primary} />,
      title: 'Shop Seating',
      subtitle: 'Set how many chairs customers can pick from (1–10)',
      route: '/owner/dashboard/shop-seating',
    },
    {
      icon: <BarChart3 size={24} color={Colors.primary} />,
      title: 'Business Analytics',
      subtitle: 'Revenue, retention and performance',
      route: '/owner/dashboard/analytics',
    },
    {
      icon: <Sparkles size={24} color={Colors.primary} />,
      title: 'AI Try-On Gallery',
      subtitle: 'Add styles for the AI hairstyle preview',
      route: '/owner/dashboard/hairstyle-catalog',
    },
    {
      icon: <Settings size={24} color={Colors.primary} />,
      title: 'Settings',
      subtitle: 'Account and app preferences',
      route: '/owner/dashboard/settings',
    },
    {
      icon: <Megaphone size={24} color={Colors.primary} />,
      title: 'Announcements',
      subtitle: 'Post banners your customers will see',
      route: '/owner/dashboard/announcements',
    },
    {
      icon: <Store size={24} color={Colors.primary} />,
      title: 'Shop Settings',
      subtitle: 'Opening hours, holidays & amenities',
      route: '/owner/dashboard/shop-settting',
    },
  ];

  const [translatedMenuItems, setTranslatedMenuItems] = React.useState(baseMenuItems);
  const [headerText, setHeaderText] = React.useState({
    title: 'Owner Dashboard',
    subtitle: 'Manage your barbershop',
  });

  // Re-translate the dashboard's own labels whenever the language changes.
  // Deeper screens (Bookings, Services, etc.) have their own translation
  // coverage already or don't yet — this covers the screen the language
  // switcher itself lives on.
  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (language === 'en') {
        if (!cancelled) {
          setTranslatedMenuItems(baseMenuItems);
          setHeaderText({ title: 'Owner Dashboard', subtitle: 'Manage your barbershop' });
        }
        return;
      }
      const [title, subtitle, ...itemTexts] = await Promise.all([
        translate('Owner Dashboard'),
        translate('Manage your barbershop'),
        ...baseMenuItems.flatMap((item) => [translate(item.title), translate(item.subtitle)]),
      ]);
      if (cancelled) return;
      setHeaderText({ title, subtitle });
      setTranslatedMenuItems(
        baseMenuItems.map((item, i) => ({
          ...item,
          title: itemTexts[i * 2],
          subtitle: itemTexts[i * 2 + 1],
        }))
      );
    };
    run();
    return () => { cancelled = true; };
    // baseMenuItems is redefined each render but stable in shape/order, so
    // only `language` should actually trigger a re-translate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  // Get owner name from multiple possible sources
  const getOwnerName = () => {
    // Priority 1: Local owner data from barberowner collection
    if (ownerData?.name) return ownerData.name;
    
    // Priority 2: Auth context owner data
    if (owner?.name) return owner.name;
    
    // Priority 3: Firebase user display name
    if (user?.displayName) return user.displayName;
    
    // Priority 4: Email username
    if (user?.email) return user.email.split('@')[0];
    
    // Fallback
    return 'Owner';
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
            progressBackgroundColor={Colors.background}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        <FadeInView delay={0} duration={500} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity
            style={styles.languageBar}
            onPress={() => setShowLanguagePicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Change language"
          >
            <Globe size={16} color={Colors.primary} />
            <Text style={styles.languageBarText}>{language.toUpperCase()}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{headerText.title}</Text>
          <Text style={styles.headerSubtitle}>{headerText.subtitle}</Text>
          
          {/* Owner and Shop Information */}
          <View style={styles.infoContainer}>
            {/* Owner name row */}
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <User size={16} color={Colors.primary} />
              </View>
              <Text style={styles.infoText}>{getOwnerName()}</Text>
            </View>

            {shopsLoading && (
              <View style={styles.infoRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.infoText}>Loading shop information...</Text>
              </View>
            )}

            {!shopsLoading && ownerShops.length === 0 && (
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Store size={16} color={Colors.warning} />
                </View>
                <Text style={[styles.infoText, styles.warningText]}>No shops assigned</Text>
              </View>
            )}

            {!shopsLoading && ownerShops.length > 0 && (() => {
              const shop = ownerShops[0];
              const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const;
              type DayKey = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun';
              const todayKey = DAYS_SHORT[new Date().getDay()] as DayKey;
              const timings: Record<DayKey, {open:string;close:string;isClosed:boolean}> = shop.timings ?? {};
              const todayT = timings[todayKey];
              const holidays: DayKey[] = shop.holidays ?? [];
              const isHoliday = holidays.includes(todayKey);
              const isClosed = isHoliday || todayT?.isClosed;
              const amenities = shop.amenities ?? {};

              return (
                <>
                  {/* Shop name + edit */}
                  <View style={styles.shopCardHeader}>
                    <View style={styles.infoIcon}>
                      <Store size={16} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoText}>
                        {ownerShops.length === 1
                          ? shop.shopName
                          : `${ownerShops.length} shops`}
                      </Text>
                      {ownerShops.length > 1 && (
                        <Text style={styles.shopList}>
                          {ownerShops.map((s: any) => s.shopName).join(', ')}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => handleNavigation('/owner/dashboard/shop-settting')}
                      accessibilityLabel="Edit shop settings"
                    >
                      <Edit2 size={13} color={Colors.primary} />
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Today's hours */}
                  <View style={styles.hoursRow}>
                    <Clock size={13} color={isClosed ? Colors.error : Colors.success} />
                    {isClosed ? (
                      <Text style={styles.hoursTextClosed}>
                        Closed today{isHoliday ? ' (Weekly Off)' : ''}
                      </Text>
                    ) : todayT ? (
                      <Text style={styles.hoursTextOpen}>
                        Today: {todayT.open} – {todayT.close}
                      </Text>
                    ) : (
                      <Text style={styles.hoursTextOpen}>Hours not set</Text>
                    )}
                  </View>

                  {/* Amenity badges */}
                  {(amenities.ac || amenities.parking || amenities.homeService) && (
                    <View style={styles.amenityBadgeRow}>
                      {amenities.ac && (
                        <View style={styles.amenityBadge}>
                          <Thermometer size={11} color={Colors.primary} />
                          <Text style={styles.amenityBadgeText}>AC</Text>
                        </View>
                      )}
                      {amenities.parking && (
                        <View style={styles.amenityBadge}>
                          <Car size={11} color={Colors.primary} />
                          <Text style={styles.amenityBadgeText}>Parking</Text>
                        </View>
                      )}
                      {amenities.homeService && (
                        <View style={styles.amenityBadge}>
                          <Home size={11} color={Colors.primary} />
                          <Text style={styles.amenityBadgeText}>Home Service</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Holiday days */}
                  {holidays.length > 0 && (
                    <View style={styles.holidayBadgeRow}>
                      <XCircle size={12} color={Colors.error} />
                      <Text style={styles.holidayBadgeText}>
                        Weekly off: {holidays.join(', ')}
                      </Text>
                    </View>
                  )}
                </>
              );
            })()}
          </View>
        </FadeInView>

        {ownerData && (
          <View style={styles.referralCard}>
            <View style={styles.referralCardTop}>
              <Text style={styles.referralCardLabel}>Your owner referral code</Text>
              <Text style={styles.referralCardCode}>
                {ownerData.ownerReferralCode || 'Generating…'}
              </Text>
            </View>
            <Text style={styles.referralCardHint}>
              Share this with other salon owners. When they're onboarded with your code,
              you get 10 appointments with zero platform charges.
            </Text>
            {(ownerData.freeAppointmentCredits || 0) > 0 && (
              <View style={styles.creditsBadge}>
                <Text style={styles.creditsBadgeText}>
                  🎁 {ownerData.freeAppointmentCredits} free appointment credit{ownerData.freeAppointmentCredits === 1 ? '' : 's'} available
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.content}>
          {translatedMenuItems.map((item, index) => {
            const isNavigating = navigationState[item.route];
            return (
              <FadeInUpView 
                key={index}
                delay={300 + (index * 100)} 
                duration={500}
              >
                <TouchableOpacity 
                  style={[
                    styles.menuItem,
                    isNavigating && styles.disabledItem
                  ]}
                  onPress={() => handleNavigation(item.route)}
                  activeOpacity={0.7}
                  disabled={isNavigating}
                >
                  <View style={styles.menuIcon}>
                    {item.icon}
                  </View>
                  <View style={styles.menuContent}>
                    <Text style={styles.menuTitle}>{item.title}</Text>
                    <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                  </View>
                  {isNavigating ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <ChevronRight size={20} color={Colors.textLight} />
                  )}
                </TouchableOpacity>
              </FadeInUpView>
            );
          })}

          <FadeInUpView delay={600} duration={500}>
            <TouchableOpacity 
              style={[
                styles.signOutButton, 
                (isSigningOut || Object.values(navigationState).some(Boolean)) && styles.disabledButton
              ]}
              onPress={handleSignOut} 
              activeOpacity={0.7}
              disabled={isSigningOut || Object.values(navigationState).some(Boolean)}
            >
              {isSigningOut ? (
                <ActivityIndicator size="small" color={Colors.error} />
              ) : (
                <LogOut size={20} color={Colors.error} />
              )}
              <Text style={styles.signOutText}>
                {isSigningOut ? 'Signing Out...' : 'Sign Out'}
              </Text>
            </TouchableOpacity>
          </FadeInUpView>
        </View>
      
          <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigation('/owner/dashboard/operations')}>
            <View style={styles.menuIcon}><ClipboardList size={23} color={Colors.primary} /></View>
            <View style={styles.menuContent}><Text style={styles.menuTitle}>Operations Centre</Text><Text style={styles.menuSubtitle}>Walk-ins, live queue, staff availability and daily closing</Text></View>
            <ChevronRight size={21} color={Colors.textLight} />
          </TouchableOpacity>
</ScrollView>
      <LanguagePicker
        visible={showLanguagePicker}
        onClose={() => setShowLanguagePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  languageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 5,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
  },
  languageBarText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
    letterSpacing: 0.5,
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
  referralCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  referralCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  referralCardLabel: {
    fontSize: 12,
    color: Colors.textLight,
  },
  referralCardCode: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 1,
  },
  referralCardHint: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 8,
    lineHeight: 16,
  },
  creditsBadge: {
    marginTop: 10,
    backgroundColor: '#ecfdf3',
    borderRadius: 10,
    padding: 10,
  },
  creditsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0a8f3c',
  },
  infoContainer: {
    marginTop: 16,
    backgroundColor: Colors.primaryLight,
    padding: 14,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  infoIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    flex: 1,
  },
  shopInfo: {
    flex: 1,
  },
  shopList: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 2,
  },
  warningText: {
    color: Colors.warning,
  },
  /* shop card header row (name + edit btn) */
  shopCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginLeft: 6,
  },
  editBtnText: {
    fontSize: 11,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
  },
  /* hours row */
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  hoursTextOpen: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.success,
  },
  hoursTextClosed: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.error,
  },
  /* amenity badges */
  amenityBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 4,
  },
  amenityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  amenityBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  /* holiday row */
  holidayBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 4,
  },
  holidayBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: Colors.error,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  disabledItem: {
    opacity: 0.6,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  menuSubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 2,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.errorLight,
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  disabledButton: {
    opacity: 0.6,
  },
  signOutText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.error,
    marginLeft: 8,
  },
});