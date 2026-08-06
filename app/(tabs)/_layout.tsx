import { Tabs } from 'expo-router';
import { User, Calendar, Scissors, Box, MessageCircleIcon, House, ShoppingBag, GraduationCap } from 'lucide-react-native';
import Colors from '@/constants/Colors';
import { GenderProvider, useGender } from '@/context/GenderContext';
import { useLanguage } from '@/context/LanguageContext';
import React from 'react';
import ErrorBoundary from '@/components/ErrorBoundary'; // ✅ Import added
import { toast } from '@/utils/toast';

function InnerTabs() {
  const { gender } = useGender();
  const { language, translate } = useLanguage();

  const [tabTitles, setTabTitles] = React.useState({
    home: 'Home',
    services: 'Services',
    bookings: 'Bookings',
    chatbot: 'Chatbot',
    profile: 'Profile',
    packages: 'Packages',
    shopping: 'Shopping',
    academy: 'Academy',
  });

  const activeTintColor =
    gender === 'man'
      ? '#4169e1'
      : gender === 'woman'
      ? '#FF0582'
      : gender === 'unisex'
      ? '#8a2be2'
      : '#4169e1';

  React.useEffect(() => {
    const updateTabTitles = async () => {
      try {
        if (language === 'en') {
          setTabTitles({
            home: 'Home',
            services: 'Services',
            bookings: 'Bookings',
            chatbot: 'Chatbot',
            profile: 'Profile',
            packages: 'Packages',
            shopping: 'Shopping',
            academy: 'Academy',
          });
        } else {
          const translated = await Promise.all([
            translate('Home'),
            translate('Services'),
            translate('Bookings'),
            translate('Chatbot'),
            translate('Profile'),
            translate('Packages'),
            translate('Shopping'),
            translate('Academy'),
          ]);
          setTabTitles({
            home: translated[0],
            services: translated[1],
            bookings: translated[2],
            chatbot: translated[3],
            profile: translated[4],
            packages: translated[5],
            shopping: translated[6],
            academy: translated[7],
          });
        }
      } catch (err) {
        console.warn('Tab translation failed:', err);
        toast.info('Translation unavailable', 'Showing default tab labels.');
      }
    };
    updateTabTitles();
  }, [language]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTintColor,
        tabBarInactiveTintColor: Colors.textLight,
        tabBarStyle: {
          backgroundColor: Colors.background,
          borderTopColor: Colors.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: 'Poppins-Medium',
          fontSize: 12,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{
        title: tabTitles.home,
        tabBarIcon: ({ color, size }) => <House size={size} color={color} />,
      }} />
      <Tabs.Screen name="services" options={{
        title: tabTitles.services,
        tabBarIcon: ({ color, size }) => <Scissors size={size} color={color} />,
      }} />
      <Tabs.Screen name="appointments" options={{
        title: tabTitles.bookings,
        tabBarIcon: ({ color, size }) => <Calendar size={size} color={color} />,
      }} />
      <Tabs.Screen name="chatbotscreen" options={{
        title: tabTitles.chatbot,
        tabBarIcon: ({ color, size }) => <MessageCircleIcon size={size} color={color} />,
      }} />
      <Tabs.Screen name="shopping" options={{
        title: tabTitles.shopping,
        tabBarIcon: ({ color, size }) => <ShoppingBag size={size} color={color} />,
        href: null, // reachable via Profile "Coming soon" until it has real content — see design note in QUALITY_FIXES_ROUND3.md
      }} />
      <Tabs.Screen name="academy" options={{
        title: tabTitles.academy,
        tabBarIcon: ({ color, size }) => <GraduationCap size={size} color={color} />,
        href: null,
      }} />
      <Tabs.Screen name="customer-tools" options={{ title: 'Customer Tools', href: null }} />
      <Tabs.Screen name="profile" options={{
        title: tabTitles.profile,
        tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
      }} />
      <Tabs.Screen name="packages" options={{
        title: tabTitles.packages,
        tabBarIcon: ({ color, size }) => <Box size={size} color={color} />,
      }} />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <ErrorBoundary> 
      {/* ✅ Wrap your app in ErrorBoundary */}
      <GenderProvider>
        <InnerTabs />
      </GenderProvider>
    </ErrorBoundary>
  );
}
