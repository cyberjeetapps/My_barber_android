import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import ErrorBoundary from '@/components/ErrorBoundary';
import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { LanguageProvider } from '@/context/LanguageContext';

import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/context/auth';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import ResponsiveScreen from '@/components/ResponsiveScreen';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Add this configuration
Notifications.setNotificationChannelAsync('default', {
  name: 'default',
  importance: Notifications.AndroidImportance.MAX,
  vibrationPattern: [0, 250, 250, 250],
  lightColor: '#FF231F7C',
  sound: 'default',
});

export default function RootLayout() {
  useFrameworkReady();
  const router = useRouter();

  const [fontsLoaded, fontError] = useFonts({
    'Poppins-Regular': Poppins_400Regular,
    'Poppins-Medium': Poppins_500Medium,
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-Bold': Poppins_700Bold,
  });

  // Set up deep link handling
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      console.log('🔗 Deep link received:', url);
      if (!url) return;

      let cleanPath = '';
      let searchParams: URLSearchParams | null = null;

      try {
        if (url.startsWith('mybarberapp://')) {
          const raw = url.replace('mybarberapp://', '');
          const [pathPart, queryPart] = raw.split('?');
          cleanPath = pathPart.replace(/^\/+/, '');
          if (queryPart) searchParams = new URLSearchParams(queryPart);
        } else if (url.includes('/--/')) {
          // Expo Go development URL
          const raw = url.split('/--/')[1] || '';
          const [pathPart, queryPart] = raw.split('?');
          cleanPath = pathPart.replace(/^\/+/, '');
          if (queryPart) searchParams = new URLSearchParams(queryPart);
        } else if (url.includes('mybarber.co.in')) {
          const urlObj = new URL(url);
          cleanPath = urlObj.pathname.replace(/^\/+/, '');
          searchParams = urlObj.searchParams;
        }
      } catch (err) {
        console.warn('Error parsing deep link URL:', err);
      }

      console.log('Normalized deep link path:', cleanPath);

      if (!cleanPath) return;

      if (cleanPath.startsWith('admin/login')) {
        router.push('/admin/login');
      } else if (cleanPath === 'admin' || cleanPath === 'admin/dashboard' || cleanPath.startsWith('admin/dashboard')) {
        if (cleanPath === 'admin' || cleanPath === 'admin/dashboard') {
          router.push('/admin/dashboard');
        } else {
          router.push(`/${cleanPath}` as any);
        }
      } else if (cleanPath.startsWith('admin/')) {
        router.push(`/${cleanPath}` as any);
      } else if (cleanPath.startsWith('owner/login')) {
        router.push('/owner/login');
      } else if (cleanPath === 'owner' || cleanPath.startsWith('owner/')) {
        router.push('/owner/login');
      } else if (cleanPath.startsWith('payment') || cleanPath.startsWith('return')) {
        console.log('Payment return received:', cleanPath);
        const orderId = searchParams?.get('order_id') || '';
        if (orderId) {
          router.push({ pathname: '/return', params: { order_id: orderId } } as any);
        } else {
          router.replace('/(tabs)/appointments');
        }
      }
    };

    // Handle initial URL
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('Initial URL:', url);
        handleDeepLink(url);
      }
    });

    // Listen for incoming deep links
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('Incoming URL:', url);
      handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  // Set up notification listener
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('🔔 Notification received in foreground:', notification);

        Alert.alert(
          notification.request.content.title || 'New Notification',
          notification.request.content.body || 'You have a new update.'
        );
      }
    );

    return () => subscription.remove();
  }, []);

  // Every push this app sends already carries a `deepLink` in its data
  // payload (new appointment, booking confirmed/cancelled, offers, etc.)
  // but nothing was ever reading it — tapping a notification just opened
  // the app to whatever screen it was last on. This makes that data do
  // what it was always meant to: land the tap on the exact booking/screen.
  useEffect(() => {
    const handleTap = (response: Notifications.NotificationResponse) => {
      const deepLink = response.notification.request.content.data?.deepLink as string | undefined;
      if (deepLink && typeof deepLink === 'string') {
        router.push(deepLink as any);
      }
    };

    // Cold start: app was fully closed and opened via a notification tap.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleTap(response);
    });

    // Warm/background: app was running and the notification was tapped.
    const subscription = Notifications.addNotificationResponseReceivedListener(handleTap);
    return () => subscription.remove();
  }, [router]);

  // Hide splash screen once fonts are loaded
  useEffect(() => {
    SplashScreen.preventAutoHideAsync();
    setTimeout(() => {
      SplashScreen.hideAsync();
    }, 2000);
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <LanguageProvider>
            <ResponsiveScreen>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="signup" />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="owner" />
                <Stack.Screen name="admin" />
                <Stack.Screen name="+not-found" />
              </Stack>
            </ResponsiveScreen>
            <StatusBar style="dark" backgroundColor="#ffffff" translucent={true} />
          </LanguageProvider>
        </AuthProvider>
        <Toast />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}