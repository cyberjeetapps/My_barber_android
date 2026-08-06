// app/admin/dashboard/index.tsx
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth } from '@/config/firebase';
import Colors from '@/constants/Colors';
import {
  Users,
  Scissors,
  Box,
  Store,
  Settings,
  LogOut,
  ChevronRight,
  User,
  Star,
  Tag,
  PieChart,
  ContactRound,
  CalendarDays,
  UserCog,
  BookOpenCheck,
  ShieldCheck,
  Bell,
  Headphones,
  CreditCard,
  Percent,
  Landmark,
  FileClock,
  FileDown,
  Megaphone,
} from 'lucide-react-native';
import { useAuth } from '@/context/auth';
import { Ionicons } from '@expo/vector-icons';

// Simple wrapper without animations
const SafeView = ({ children, style }: any) => {
  return <View style={style}>{children}</View>;
};

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading, isAdmin } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [navigationState, setNavigationState] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      router.replace('/admin/login');
    }
  }, [user, isLoading, isAdmin]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace('/admin/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleNavigation = (route: string) => {
    if (navigationState[route]) return;

    setNavigationState(prev => ({ ...prev, [route]: true }));
    
    // Use setTimeout instead of promises to avoid potential issues
    setTimeout(() => {
      router.push(route);
      setTimeout(() => {
        setNavigationState(prev => ({ ...prev, [route]: false }));
      }, 1000);
    }, 100);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const menuItems = [
    {
      icon: <CalendarDays size={24} color={Colors.primary} />,
      title: 'All Bookings',
      subtitle: 'Search and control every appointment',
      route: '/admin/dashboard/bookings',
    },
    {
      icon: <User size={24} color={Colors.primary} />,
      title: 'Manage Owners',
      subtitle: 'View and manage owners',
      route: '/admin/dashboard/owners',
    },
    {
      icon: <Store size={24} color={Colors.primary} />,
      title: 'Manage Shops',
      subtitle: 'View and manage shops',
      route: '/admin/dashboard/shops',
    },
    {
      icon: <Scissors size={24} color={Colors.primary} />,
      title: 'Services',
      subtitle: 'Review and approve services submitted by owners',
      route: '/admin/dashboard/services',
    },
    {
      icon: <Box size={24} color={Colors.primary} />,
      title: 'Packages',
      subtitle: 'Approve or reject packages created by owners',
      route: '/admin/dashboard/packages',
    },
    {
      icon: <Star size={24} color={Colors.primary} />,
      title: 'Reviews',
      subtitle: 'Approve or reject reviews created by customers',
      route: '/admin/dashboard/reviews',
    },
    {
      icon: <Tag size={24} color={Colors.primary} />,
      title: 'Manage Offers',
      subtitle: 'View and manage offers',
      route: '/admin/dashboard/offers',
    },
    {
      icon: <ContactRound size={24} color={Colors.primary} />,
      title: 'Customer CRM',
      subtitle: 'Search customers, value and retention',
      route: '/admin/dashboard/customers'
    },
    {
      icon: <BookOpenCheck size={24} color={Colors.primary} />,
      title: 'Content Approvals',
      subtitle: 'Review pending salon submissions',
      route: '/admin/dashboard/approvals',
    },
    {
      icon: <ShieldCheck size={24} color={Colors.primary} />,
      title: 'Staff Directory',
      subtitle: 'Platform-wide salon staff management',
      route: '/admin/dashboard/staff',
    },
    {
      icon: <Bell size={24} color={Colors.primary} />,
      title: 'Admin Notifications',
      subtitle: 'Operational alerts and messages',
      route: '/admin/dashboard/notifications',
    },
    {
      icon: <Settings size={24} color={Colors.primary} />,
      title: 'Platform Settings',
      subtitle: 'Business rules and configuration',
      route: '/admin/dashboard/platform-settings',
    },
    {
      icon: <Headphones size={24} color={Colors.primary} />,
      title: 'Support Tickets',
      subtitle: 'Customer and owner issue resolution',
      route: '/admin/dashboard/support',
    },
    {
      icon: <CreditCard size={24} color={Colors.primary} />,
      title: 'Refund Requests',
      subtitle: 'Review and track refund cases',
      route: '/admin/dashboard/refunds',
    },
    {
      icon: <Percent size={24} color={Colors.primary} />,
      title: 'Commission Rules',
      subtitle: 'Salon and platform commission setup',
      route: '/admin/dashboard/commissions',
    },
    {
      icon: <Landmark size={24} color={Colors.primary} />,
      title: 'Settlements',
      subtitle: 'Payout tracking and settlement holds',
      route: '/admin/dashboard/settlements',
    },
    {
      icon: <FileClock size={24} color={Colors.primary} />,
      title: 'Audit Logs',
      subtitle: 'Trace sensitive admin actions',
      route: '/admin/dashboard/audit-logs',
    },
    {
      icon: <FileDown size={24} color={Colors.primary} />,
      title: 'Reports & Exports',
      subtitle: 'Download operational CSV reports',
      route: '/admin/dashboard/reports',
    },
    {
      icon: <PieChart size={24} color={Colors.primary} />,
      title: 'Statistics',
      subtitle: 'All Appointments Graph',
      route: '/admin/dashboard/statistics'
    },
    {
      icon: <Megaphone size={24} color={Colors.primary} />,
      title: 'Announcement Banners',
      subtitle: 'Platform-wide banners for customers',
      route: '/admin/dashboard/announcements',
    },
  ];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading Admin Dashboard...</Text>
      </View>
    );
  }

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
          />
        }
      >
        {/* Top Right Profile Icon */}
        <SafeView style={styles.iconRow}>
          <TouchableOpacity 
            onPress={() => handleNavigation('/admin/profile')}
            disabled={navigationState['/admin/profile']}
            style={navigationState['/admin/profile'] ? styles.disabledButton : null}
          >
            <Ionicons name="person-circle-outline" size={32} color={Colors.primary} />
          </TouchableOpacity>
        </SafeView>

        <SafeView style={styles.header}>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={styles.headerSubtitle}>Manage the platform</Text>
          {user?.name && (
            <Text style={styles.welcomeText}>Welcome, {user.name}</Text>
          )}
        </SafeView>

        <SafeView style={styles.content}>
          {menuItems.map((item, index) => {
            const isNavigating = navigationState[item.route];
            return (
              <SafeView key={item.route}>
                <TouchableOpacity
                  style={[
                    styles.menuItem,
                    isNavigating && styles.disabledItem
                  ]}
                  onPress={() => handleNavigation(item.route)}
                  activeOpacity={0.7}
                  disabled={isNavigating}
                >
                  <View style={styles.menuIcon}>{item.icon}</View>
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
              </SafeView>
            );
          })}

          <SafeView>
            <TouchableOpacity
              style={[
                styles.signOutButton,
                Object.values(navigationState).some(Boolean) && styles.disabledItem
              ]}
              onPress={handleSignOut}
              activeOpacity={0.7}
              disabled={Object.values(navigationState).some(Boolean)}
            >
              <LogOut size={20} color={Colors.error} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </SafeView>
        </SafeView>
      </ScrollView>
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
    marginTop: 12,
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  welcomeText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
    marginTop: 8,
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
  disabledButton: {
    opacity: 0.5,
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
  signOutText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.error,
    marginLeft: 8,
  },
});