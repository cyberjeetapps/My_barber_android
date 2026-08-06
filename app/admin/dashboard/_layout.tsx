import { Stack } from 'expo-router';
import { useAuth } from '@/context/auth';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ActivityIndicator, View } from 'react-native';
import Colors from '@/constants/Colors';


export default function AdminDashboardLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  useEffect(() => {
    const checkAdminAccess = async () => {
      setIsCheckingAccess(true);

      if (!user && !isLoading) {
        router.replace('/admin/login');
        return;
      }

      if (user) {
        try {
          const adminDoc = await getDoc(doc(db, 'admins', user.uid));

          if (!adminDoc.exists() || adminDoc.data()?.role !== 'admin') {
            router.replace('/admin/login');
            return;
          }
        } catch (error) {
          console.error('Error checking admin access:', error);
          router.replace('/admin/login');
          return;
        }
      }

      setIsCheckingAccess(false);
    };

    checkAdminAccess();
  }, [user, isLoading]);

  if (isLoading || isCheckingAccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Admin Dashboard', animation: 'fade' }} />
      <Stack.Screen name="owners" options={{ title: 'Manage Owners', animation: 'slide_from_right' }} />
      <Stack.Screen name="shops" options={{ title: 'Manage Shops', animation: 'slide_from_right' }} />
      <Stack.Screen name="services" options={{ title: 'Manage Services', animation: 'slide_from_right' }} />
      <Stack.Screen name="packages" options={{ title: 'Manage Packages', animation: 'slide_from_right' }} />
      <Stack.Screen name="offers" options={{ title: 'Manage Offers', animation: 'slide_from_right' }} />
      <Stack.Screen name="reviews" options={{ title: 'Manage Reviews', animation: 'slide_from_right' }} />
      <Stack.Screen name="customers" options={{ title: 'Customers', animation: 'slide_from_right' }} />
      <Stack.Screen name="approvals" options={{ title: 'Approvals', animation: 'slide_from_right' }} />
      <Stack.Screen name="staff" options={{ title: 'Staff', animation: 'slide_from_right' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications', animation: 'slide_from_right' }} />
      <Stack.Screen name="platform-settings" options={{ title: 'Platform Settings', animation: 'slide_from_right' }} />
      <Stack.Screen name="support" options={{ title: 'Support', animation: 'slide_from_right' }} />
      <Stack.Screen name="refunds" options={{ title: 'Refunds', animation: 'slide_from_right' }} />
      <Stack.Screen name="commissions" options={{ title: 'Commissions', animation: 'slide_from_right' }} />
      <Stack.Screen name="settlements" options={{ title: 'Settlements', animation: 'slide_from_right' }} />
      <Stack.Screen name="audit-logs" options={{ title: 'Audit Logs', animation: 'slide_from_right' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports', animation: 'slide_from_right' }} />
      <Stack.Screen name="statistics" options={{ title: 'Statistics', animation: 'slide_from_right' }} />
      <Stack.Screen name="bookings" options={{ title: 'Bookings', animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings', animation: 'slide_from_right' }} />
    </Stack>
  );
}
