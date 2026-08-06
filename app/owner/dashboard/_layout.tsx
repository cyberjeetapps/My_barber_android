import { Stack } from 'expo-router';
import { useAuth } from '@/context/auth';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ActivityIndicator, View } from 'react-native';
import Colors from '@/constants/Colors';

export default function DashboardLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  useEffect(() => {
    const checkOwnerAccess = async () => {
      setIsCheckingAccess(true);

      if (!user && !isLoading) {
        router.replace('/owner/login');
        return;
      }

      if (user) {
        try {
          // Check in barberowner collection instead of users
          const ownerDoc = await getDoc(doc(db, 'barberowner', user.uid));

          if (!ownerDoc.exists() || ownerDoc.data()?.role !== 'owner') {
            router.replace('/owner/login');
            return;
          }
        } catch (error) {
          console.error('Error checking owner access:', error);
          router.replace('/owner/login');
          return;
        }
      }

      setIsCheckingAccess(false);
    };

    checkOwnerAccess();
  }, [user, isLoading]);

  // Show loading indicator while checking auth state or owner access
  if (isLoading || isCheckingAccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Dashboard',
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="services"
        options={{
          title: 'Services',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen name="today-board" options={{ title: "Today’s Board", animation: "slide_from_right" }} />
      <Stack.Screen name="operations" options={{ title: "Operations Centre", animation: "slide_from_right" }} />
      <Stack.Screen name="shop-seating" options={{ title: "Shop Seating", animation: "slide_from_right" }} />
      <Stack.Screen name="staff-attendance" options={{ title: "Staff Shifts & Attendance", animation: "slide_from_right" }} />
      <Stack.Screen name="blocked-slots" options={{ title: "Blocked Time", animation: "slide_from_right" }} />
      <Stack.Screen name="no-shows" options={{ title: "No-show History", animation: "slide_from_right" }} />
      <Stack.Screen name="daily-closing" options={{ title: "Daily Closing", animation: "slide_from_right" }} />
      <Stack.Screen name="staff-performance" options={{ title: "Chair Performance", animation: "slide_from_right" }} />
      <Stack.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen name="packages" options={{ title: 'Packages', animation: 'slide_from_right' }} />
      <Stack.Screen name="customers" options={{ title: 'Customer CRM', animation: 'slide_from_right' }} />
      <Stack.Screen name="staff" options={{ title: 'Staff & Chairs', animation: 'slide_from_right' }} />
      <Stack.Screen name="analytics" options={{ title: 'Business Analytics', animation: 'slide_from_right' }} />
      <Stack.Screen name="offers" options={{ title: 'Offers', animation: 'slide_from_right' }} />
      <Stack.Screen name="offlinepayments" options={{ title: 'Offline Payments', animation: 'slide_from_right' }} />
      <Stack.Screen name="hairstyle-catalog" options={{ title: 'AI Try-On Gallery', animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings', animation: 'slide_from_right' }} />
      <Stack.Screen name="shop-settting" options={{ title: 'Shop Settings', animation: 'slide_from_right' }} />
    </Stack>
  );
}
