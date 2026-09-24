import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image as RNImage,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
// expo-image gives real disk+memory caching, so shop/service photos don't
// re-download every time this screen re-mounts or the user scrolls back to it.
import { Image } from 'expo-image';
import { useAuth } from '@/context/auth';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import Colors from '@/constants/Colors';
import { Scissors, Clock, Star, MapPin, Calendar, ChevronRight, X, CreditCard, Sparkles, Globe, Heart } from 'lucide-react-native';
import { toggleFavorite, listFavorites } from '@/utils/favorites';
import { useGender } from '@/context/GenderContext';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Linking } from 'react-native';
import { useLanguage } from '@/context/LanguageContext';
import LanguagePicker from '@/components/LanguagePicker';
import Toast from 'react-native-toast-message';
const placeholderImage = require('@/assets/images/favicon.png');
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { syncAppointmentReminders } from '@/utils/appointmentReminders';
import { isShopOpenNow, openShopDirections } from '@/utils/simpleCustomerFeatures';

export default function HomeScreen() {
  const { user } = useAuth();
  const [favoriteShopIds, setFavoriteShopIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.uid) return;
    listFavorites(user.uid, 'shop')
      .then((favs) => setFavoriteShopIds(new Set(favs.map((f) => f.targetId))))
      .catch((err) => console.warn('Failed to load favorites:', err));
  }, [user?.uid]);

  const handleToggleFavoriteShop = async (shop: any) => {
    if (!user?.uid) return;
    const wasFavorited = favoriteShopIds.has(shop.id);
    // Optimistic update — the toggle should feel instant, not wait on a round trip.
    setFavoriteShopIds((prev) => {
      const next = new Set(prev);
      wasFavorited ? next.delete(shop.id) : next.add(shop.id);
      return next;
    });
    try {
      await toggleFavorite({
        userId: user.uid,
        type: 'shop',
        targetId: shop.id,
        label: shop.shopName || 'Salon',
        subLabel: shop.addressLine1 || '',
        currentlyFavorited: wasFavorited,
      });
    } catch (err) {
      console.warn('Failed to toggle favorite:', err);
      // Roll back on failure
      setFavoriteShopIds((prev) => {
        const next = new Set(prev);
        wasFavorited ? next.add(shop.id) : next.delete(shop.id);
        return next;
      });
    }
  };

  const { setGender } = useGender();
  const router = useRouter();
  const { language, translate } = useLanguage();
  const { showGender, gender } = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDisabled, setCategoryDisabled] = useState(false);
  const [resettingCategory, setResettingCategory] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  const [individualAppointments, setIndividualAppointments] = useState<any[]>([]);
  const [familyBookings, setFamilyBookings] = useState<any[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loadingShop, setLoadingShop] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Translated UI texts
  const [uiTexts, setUiTexts] = useState({
    chooseCategory: 'Choose a Service Category',
    men: 'Men',
    women: 'Women',
    greeting: 'Hello',
    subtitle: 'Looking sharp today?',
    topShops: 'Our Top Barber Shops',
    topBarbers: 'Our Top Barbers',
    reviews: 'Our Barber Shops Reviews',
    noReviews: "You haven't left any reviews yet",
    appointments: 'Your Appointments',
    familyBookings: 'Family Bookings',
    noFamilyBookings: 'No family bookings',
    noAppointments: 'No upcoming appointments',
    popularServices: 'Popular Services',
    makeVisit: 'Make a Visit',
    menDescription: 'Classic trims, modern fades, and beard grooming for a sharp, confident style.',
    womenDescription: 'From stylish cuts to luxurious treatments — crafted for every woman\'s unique look.',
    unisexDescription: 'Quality services for everyone, regardless of gender - inclusive styling for all.',
    noResults: 'No results available for',
    unisex: 'Unisex',
    hours: 'Hours:',
  });

  // Initialize selected category based on URL params
  useEffect(() => {
    if (showGender === 'true') {
      setSelectedCategory(gender === 'woman' ? 'woman' : gender === 'unisex' ? 'unisex' : 'man');
    }
  }, [showGender, gender]);

  // Translate UI when language changes
  useEffect(() => {
    const translateUI = async () => {
      if (language === 'en') {
        setUiTexts({
          chooseCategory: 'Choose a Service Category',
          men: 'Men',
          women: 'Women',
          greeting: 'Hello',
          subtitle: 'Looking sharp today?',
          topShops: 'Our Top Barber Shops',
          topBarbers: 'Our Top Barbers',
          reviews: 'Our Barber Shops Reviews',
          noReviews: "You haven't left any reviews yet",
          appointments: 'Your Appointments',
          familyBookings: 'Family Bookings',
          noFamilyBookings: 'No family bookings',
          noAppointments: 'No upcoming appointments',
          popularServices: 'Popular Services',
          makeVisit: 'Make a Visit',
          menDescription: 'Classic trims, modern fades, and beard grooming for a sharp, confident style.',
          womenDescription: 'From stylish cuts to luxurious treatments — crafted for every woman\'s unique look.',
          unisexDescription: 'Quality services for everyone, regardless of gender - inclusive styling for all.',
          noResults: 'No results available for',
          unisex: 'Unisex',
          hours: 'Hours:',
        });
      } else {
        const translated = await Promise.all([
          translate('Choose a Service Category'),
          translate('Men'),
          translate('Women'),
          translate('Hello'),
          translate('Looking sharp today?'),
          translate('Our Top Barber Shops'),
          translate('Our Top Barbers'),
          translate('Our Barber Shops Reviews'),
          translate("You haven't left any reviews yet"),
          translate('Your Appointments'),
          translate('Family Bookings'),
          translate('No family bookings'),
          translate('No upcoming appointments'),
          translate('Popular Services'),
          translate('Make a Visit'),
          translate('Classic trims, modern fades, and beard grooming for a sharp, confident style.'),
          translate('From stylish cuts to luxurious treatments — crafted for every woman\'s unique look.'),
          translate('Quality services for everyone, regardless of gender - inclusive styling for all.'),
          translate('No results available for'),
          translate('Unisex'),
          translate('Hours:'),
        ]);
        
        setUiTexts({
          chooseCategory: translated[0],
          men: translated[1],
          women: translated[2],
          greeting: translated[3],
          subtitle: translated[4],
          topShops: translated[5],
          topBarbers: translated[6],
          reviews: translated[7],
          noReviews: translated[8],
          appointments: translated[9],
          familyBookings: translated[10],
          noFamilyBookings: translated[11],
          noAppointments: translated[12],
          popularServices: translated[13],
          makeVisit: translated[14],
          menDescription: translated[15],
          womenDescription: translated[16],
          unisexDescription: translated[17],
          noResults: translated[18],
          unisex: translated[19],
          hours: translated[20],
        });
      }
    };

    translateUI();
  }, [language]);

  // Gender selection handler
  const handleGenderSelection = useCallback((gender: 'man' | 'woman' | 'unisex') => {
    if (categoryDisabled) return;
    setSelectedCategory(gender);
    setGender(gender);
  }, [categoryDisabled, setGender]);

  // Reset category selection
  const handleResetCategory = useCallback(() => {
    if (resettingCategory) return;
    
    setResettingCategory(true);
    setCategoryDisabled(true);
    
    Toast.show({
      type: 'info',
      text1: 'Resetting selection',
      text2: 'Please wait 5 seconds...',
      visibilityTime: 2000,
    });

    setTimeout(() => {
      setSelectedCategory(null);
      setGender(null);
      setResettingCategory(false);
      setCategoryDisabled(false);
      
      Toast.show({
        type: 'success',
        text1: 'Ready to select again',
        visibilityTime: 2000,
      });
    }, 3000);
  }, [resettingCategory, setGender]);

  const handleVisit = useCallback(() => {
    router.push('/services');
  }, [router]);

  // Fetch user info
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserName(data.name || '');
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Fetch all appointments (both individual and family)
  const fetchAppointments = useCallback(async () => {
    if (!user?.uid) {
      setIndividualAppointments([]);
      setFamilyBookings([]);
      setLoadingAppointments(false);
      return;
    }

    setLoadingAppointments(true);
    try {
      const now = new Date();
      
      // Fetch individual appointments
      const appointmentsRef = collection(db, 'appointments');
      const q = query(appointmentsRef, where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      
      const individual = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...(doc.data() as any),
          dateTime: new Date(doc.data().dateTime),
          isFamilyBooking: false
        }))
        .filter(app => app.dateTime >= now && app.status !== 'cancelled');

      // Fetch family bookings
      const familyBookingsRef = collection(db, 'familybookings');
      const familyQuery = query(familyBookingsRef, where('userId', '==', user.uid));
      const familySnapshot = await getDocs(familyQuery);
      
      const family = familySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...(doc.data() as any),
          dateTime: new Date(doc.data().dateTime),
          isFamilyBooking: true
        }))
        .filter(booking => booking.dateTime >= now && booking.status !== 'cancelled');

      // Translate if needed
      if (language !== 'en') {
        const translateAppointments = async (apps: any[]) => {
          return await Promise.all(
            apps.map(async (app) => {
              const translatedServiceName = app.serviceName 
                ? await translate(app.serviceName) 
                : app.serviceName;
              
              const translatedShopName = app.shopName 
                ? await translate(app.shopName) 
                : app.shopName;

              const translatedBarberName = app.barberName 
                ? await translate(app.barberName) 
                : app.barberName;

              return {
                ...app,
                serviceName: translatedServiceName,
                shopName: translatedShopName,
                barberName: translatedBarberName
              };
            })
          );
        };

        setIndividualAppointments(await translateAppointments(individual.sort((a, b) => a.dateTime - b.dateTime)));
        setFamilyBookings(await translateAppointments(family.sort((a, b) => a.dateTime - b.dateTime)));
      } else {
        setIndividualAppointments(individual.sort((a, b) => a.dateTime - b.dateTime));
        setFamilyBookings(family.sort((a, b) => a.dateTime - b.dateTime));
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoadingAppointments(false);
    }
  }, [user?.uid, language, translate]);

  // Notification for upcoming appointments — schedules real future-dated
  // reminders (24h and 1h before) for every upcoming appointment, so it
  // works even if the customer never opens the app before then.
  useEffect(() => {
    if (individualAppointments.length === 0 && familyBookings.length === 0) return;
    syncAppointmentReminders([...individualAppointments, ...familyBookings]);
  }, [individualAppointments, familyBookings]);

  // Fetch staff members
  const fetchStaff = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'staff'));
      const staffData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
        serviceGender: doc.data().serviceGender || 'unisex',
        ranking: parseFloat(doc.data().ranking) || 0,
      }));

      // Translate staff names and specialties if not in English
      if (language !== 'en') {
        const translatedStaff = await Promise.all(
          staffData.map(async (member) => {
            const translatedName = member.name 
              ? await translate(member.name) 
              : member.name;
            
            const translatedSpecialty = member.specialization 
              ? await translate(member.specialization) 
              : member.specialization;

            return {
              ...member,
              name: translatedName,
              specialization: translatedSpecialty
            };
          })
        );
        setStaffMembers(translatedStaff);
      } else {
        setStaffMembers(staffData);
      }
    } catch (error) {
      console.error('Error fetching staff:', error);
    } finally {
      setLoadingStaff(false);
    }
  }, [language, translate]);

  // Fetch shops with better error handling and data validation
  const fetchShops = useCallback(async () => {
    setLoadingShop(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'shops'));
      const shopData = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          shopName: data.shopName || 'Unnamed Shop',
          businessType: data.businessType || 'Barber Shop',
          addressLine1: data.addressLine1 || '',
          city: data.city || '',
          stateRegion: data.stateRegion || '',
          country: data.country || '',
          postalCode: data.postalCode || '',
          phoneNumber: data.phoneNumber || '',
          openingHours: data.openingHours || '9:00 AM - 6:00 PM',
          imageUrl: data.shopImageUrl || RNImage.resolveAssetSource(placeholderImage).uri,
          serviceGender: data.gender || 'unisex',
          googleMapLink: data.googleMapLink || '',
          latitude: data.latitude || '',
          longitude: data.longitude || '',
          ranking: parseFloat(data.ranking) || 10,
        };
      });
      
      if (language !== 'en') {
        const translatedShops = await Promise.all(
          shopData.map(async (shop) => {
            const translatedShopName = shop.shopName 
              ? await translate(shop.shopName) 
              : shop.shopName;
            
            const translatedBusinessType = shop.businessType 
              ? await translate(shop.businessType) 
              : shop.businessType;

            return {
              ...shop,
              shopName: translatedShopName,
              businessType: translatedBusinessType
            };
          })
        );
        setShops(translatedShops);
      } else {
        setShops(shopData);
      }
    } catch (error) {
      console.error('Error fetching shops:', error);
    } finally {
      setLoadingShop(false);
    }
  }, [language, translate]);

  // Fetch active announcement banners (platform-wide and per-shop)
  const fetchBanners = useCallback(async () => {
    try {
      const snapshot = await getDocs(
        query(collection(db, 'announcementBanners'), where('status', '==', 'active'))
      );
      setBanners(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })));
    } catch (error) {
      console.error('Error fetching announcement banners:', error);
    }
  }, []);

  // Fetch reviews
  const fetchReviews = useCallback(async () => {
    if (!user) return;
    setLoadingReviews(true);
    try {
      const reviewsSnapshot = await getDocs(collection(db, 'reviews'));
      const userReviews = reviewsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));

      // Translate reviews if not in English
      if (language !== 'en') {
        const translatedReviews = await Promise.all(
          userReviews.map(async (review) => {
            const translatedShopName = review.shopName 
              ? await translate(review.shopName) 
              : review.shopName;
            
            const translatedServiceName = review.serviceName 
              ? await translate(review.serviceName) 
              : review.serviceName;
            
            const translatedReviewText = review.review 
              ? await translate(review.review) 
              : review.review;

            return {
              ...review,
              shopName: translatedShopName,
              serviceName: translatedServiceName,
              review: translatedReviewText
            };
          })
        );
        setReviews(translatedReviews);
      } else {
        setReviews(userReviews);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoadingReviews(false);
    }
  }, [user, language, translate]);

  useFocusEffect(
    useCallback(() => {
      fetchAppointments();
      fetchReviews();
      fetchShops();
      fetchStaff();
      fetchBanners();
    }, [fetchAppointments, fetchReviews, fetchShops, fetchStaff, fetchBanners])
  );

  // Announcement banners with no shopId are platform-wide; the rest are
  // shop-specific and rendered on that shop's own card instead.
  const platformBanners = useMemo(() => banners.filter((b) => !b.shopId), [banners]);

  // Filter featured barbers
  const featuredBarbers = staffMembers
    .filter((member) => {
      if (!selectedCategory) return true;
      const genderMap = { man: 'men', woman: 'women', unisex: 'unisex' };
      const targetGender =
        genderMap[selectedCategory as keyof typeof genderMap];
      return (
        member.serviceGender === targetGender ||
        (selectedCategory === 'unisex' && member.serviceGender === 'unisex')
      );
    })
    .map((member) => ({
      id: member.id,
      name: member.name,
      specialty: member.specialization,
      rating: member.ranking,
      image: member.imageUrl,
      serviceGender: member.serviceGender,
    }));

  // Filter featured shops based on gender
  const featuredBarbershop = shops
    .filter((shop) => {
      if (!selectedCategory) return true;
      const genderMap = { man: 'Men', woman: 'Women', unisex: 'Unisex' };
      const targetGender = genderMap[selectedCategory as keyof typeof genderMap];
      return (
        shop.serviceGender === targetGender || 
        (selectedCategory === 'man' && shop.serviceGender === 'Men') ||
        (selectedCategory === 'woman' && shop.serviceGender === 'Women') ||
        (selectedCategory === 'unisex' && shop.serviceGender === 'Unisex')
      );
    })
    .map((shop) => ({
      id: shop.id,
      shopName: shop.shopName,
      businessType: shop.businessType,
      addressLine1: shop.addressLine1,
      city: shop.city,
      stateRegion: shop.stateRegion,
      country: shop.country,
      postalCode: shop.postalCode,
      phoneNumber: shop.phoneNumber,
      openingHours: shop.openingHours,
      image: shop.imageUrl,
      serviceGender: shop.serviceGender,
      googleMapLink: shop.googleMapLink,
      latitude: shop.latitude,
      longitude: shop.longitude,
    }));

  // Helper function to get status color
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

  // Render individual appointment card
  const renderIndividualAppointment = (appointment: any, index: number) => {
    const borderColor = appointment.serviceGender?.toLowerCase() === 'women' ? Colors.pink : 
                     appointment.serviceGender?.toLowerCase() === 'unisex' ? Colors.purple : 
                     Colors.primary;
    return (
       <Animated.View 
        key={appointment.id}
        entering={FadeInUp.delay(300 + index * 100).duration(500)}
        style={[styles.appointmentCard, { borderLeftWidth: 4, borderLeftColor: borderColor }]}
      >
        <Image 
          source={{ uri: appointment.serviceImageUrl || 'https://thesociety.co.in/frontend-assets/images/AboutUsBanner.jpg' }} 
          style={styles.barberImage} 
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
        
        <View style={styles.appointmentContent}>
          <View style={styles.appointmentHeader}>
            <Text style={styles.serviceName}>{appointment.serviceName}</Text>
            <View style={styles.statusContainer}>
              {appointment.paymentStatus === 'paid' && (
                <View style={[styles.statusBadge, { backgroundColor: `${Colors.success}20` }]}>
                  <Text style={[styles.statusText, { color: Colors.success }]}>
                    PAID
                  </Text>
                </View>
              )}
              <View style={[
                styles.statusBadge,
                { backgroundColor: `${getStatusColor(appointment.status)}20` }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: getStatusColor(appointment.status) }
                ]}>
                  {appointment.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
                
          <View style={styles.appointmentDetails}>
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Calendar size={14} color={Colors.primary} />
                <Text style={styles.detailText}>
                  {appointment.dateTime.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </Text>
              </View>
              
              <View style={styles.detailItem}>
                <Clock size={14} color={Colors.primary} />
                <Text style={styles.detailText}>
                  {appointment.dateTime.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                  })}
                </Text>
              </View>
            </View>
            
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <MapPin size={14} color={Colors.primary} />
                <Text style={styles.detailText}>
                  {appointment.shopName}
                </Text>
              </View>
              
              
            </View>
            <View style={styles.detailItem}>
                <Text style={[styles.priceText, {
                  color: appointment.serviceGender === 'women' ? Colors.pink : 
                        appointment.serviceGender === 'unisex' ? Colors.purple : 
                        Colors.primary 
                }]}>
                  ₹{appointment.servicePrice}
                </Text>
              </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  // Render family booking card
  const renderFamilyBooking = (booking: any, index: number) => {
    const borderColor = booking.serviceGender === 'women' ? Colors.pink : 
                     booking.serviceGender === 'unisex' ? Colors.purple : 
                     Colors.primary;
    return (
      <Animated.View 
        key={booking.id}
        entering={FadeInUp.delay(300 + index * 100).duration(500)}
        style={[styles.appointmentCard, { borderLeftWidth: 4, borderLeftColor: borderColor }]}
      >
        <Image 
          source={{ uri: booking.serviceImageUrl || 'https://thesociety.co.in/frontend-assets/images/AboutUsBanner.jpg' }} 
          style={styles.barberImage} 
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
        
        <View style={styles.appointmentContent}>
          <View style={styles.appointmentHeader}>
            <Text style={styles.serviceName}>{booking.serviceName}</Text>
            <View style={styles.statusContainer}>
              {booking.paymentStatus === 'paid' && (
                <View style={[styles.statusBadge, { backgroundColor: `${Colors.success}20` }]}>
                  <Text style={[styles.statusText, { color: Colors.success }]}>
                    PAID
                  </Text>
                </View>
              )}
              <View style={[
                styles.statusBadge,
                { backgroundColor: `${getStatusColor(booking.status)}20` }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: getStatusColor(booking.status) }
                ]}>
                  {booking.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
                
          <View style={styles.appointmentDetails}>
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Calendar size={14} color={Colors.primary} />
                <Text style={styles.detailText}>
                  {booking.dateTime.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </Text>
              </View>
              
              <View style={styles.detailItem}>
                <Clock size={14} color={Colors.primary} />
                <Text style={styles.detailText}>
                  {booking.dateTime.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                  })}
                </Text>
              </View>
            </View>
            
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <MapPin size={14} color={Colors.primary} />
                <Text style={styles.detailText}>
                  {booking.shopName}
                </Text>
              </View>
              
              <View style={styles.detailItem}>
                <Text style={styles.priceText}>
                  ₹{booking.totalPrice}
                </Text>
              </View>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailText}>Family Size: {booking.familySize}</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12 }}
      >
        <TouchableOpacity
          style={styles.languageBar}
          onPress={() => setShowLanguagePicker(true)}
          accessibilityRole="button"
          accessibilityLabel="Change language"
        >
          <Globe size={16} color={Colors.primary} />
          <Text style={styles.languageBarText}>{language.toUpperCase()}</Text>
        </TouchableOpacity>

        {platformBanners.map((banner) => (
          <View key={banner.id} style={styles.platformBanner}>
            <Text style={styles.platformBannerTitle}>{banner.title}</Text>
            {!!banner.message && (
              <Text style={styles.platformBannerMessage}>{banner.message}</Text>
            )}
          </View>
        ))}

        <TouchableOpacity
          style={styles.aiHairstyleBanner}
          onPress={() => router.push('/hairstyle-ai')}
          activeOpacity={0.85}
        >
          <View style={styles.aiHairstyleBannerIcon}>
            <Sparkles size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiHairstyleBannerTitle}>Try a Hairstyle with AI</Text>
            <Text style={styles.aiHairstyleBannerSubtitle}>
              Preview a new look on your own photo before you book
            </Text>
          </View>
          <ChevronRight size={20} color="#fff" />
        </TouchableOpacity>

        {selectedCategory === null && (
         <View style={styles.selectionContainer}>
  <Text style={styles.selectionTitle}>{uiTexts.chooseCategory}</Text>
  
  <View style={styles.selectionButtonsSingleRow}>
    {/* Men Button — hidden for accounts registered as female */}
    {user?.gender?.toLowerCase() !== 'woman' && (
    <View style={styles.categoryButtonContainer}>
      <TouchableOpacity
        style={[
          styles.categoryButton, 
          styles.categoryButtonMen,
          categoryDisabled && styles.disabledButton
        ]}
        onPress={() => handleGenderSelection('man')}
        disabled={categoryDisabled}
      >
        <Image
          source={require('@/assets/images/man.png')}
          style={[
            styles.categoryImage,
            categoryDisabled && { opacity: 0.6 }
          ]}
        />
        {categoryDisabled && (
          <ActivityIndicator 
            size="small" 
            color={Colors.primary} 
            style={styles.buttonLoader}
          />
        )}
      </TouchableOpacity>
      <Text style={styles.categoryLabel}>{uiTexts.men}</Text>
    </View>
    )}
    
    {/* Women Button — hidden for accounts registered as male */}
    {user?.gender?.toLowerCase() !== 'man' && (
    <View style={styles.categoryButtonContainer}>
      <TouchableOpacity
        style={[
          styles.categoryButton, 
          styles.categoryButtonWomen,
          categoryDisabled && styles.disabledButton
        ]}
        onPress={() => handleGenderSelection('woman')}
        disabled={categoryDisabled}
      >
        <Image
          source={require('@/assets/images/woman.png')}
          style={[
            styles.categoryImage,
            categoryDisabled && { opacity: 0.6 }
          ]}
        />
        {categoryDisabled && (
          <ActivityIndicator 
            size="small" 
            color={Colors.primary} 
            style={styles.buttonLoader}
          />
        )}
      </TouchableOpacity>
      <Text style={styles.categoryLabel}>{uiTexts.women}</Text>
    </View>
    )}

    {/* Unisex Button — always shown, common to every account */}
    <View style={styles.categoryButtonContainer}>
      <TouchableOpacity
        style={[
          styles.categoryButton, 
          styles.categoryButtonUnisex,
          categoryDisabled && styles.disabledButton
        ]}
        onPress={() => handleGenderSelection('unisex')}
        disabled={categoryDisabled}
      >
        <Image
          source={require('@/assets/images/unisex.png')}
          style={[
            styles.categoryImage,
            categoryDisabled && { opacity: 0.6 }
          ]}
        />
        {categoryDisabled && (
          <ActivityIndicator 
            size="small" 
            color={Colors.primary} 
            style={styles.buttonLoader}
          />
        )}
      </TouchableOpacity>
      <Text style={styles.categoryLabel}>{uiTexts.unisex}</Text>
    </View>
  </View>
</View>
        )}

        {selectedCategory && (
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.greeting}>
                  {uiTexts.greeting}{userName ? `, ${userName.split(' ')[0]}` : ''}!
                </Text>
                <Text style={styles.subtitle}>{uiTexts.subtitle}</Text>
              </View>
              <TouchableOpacity onPress={handleResetCategory}>
                <View style={styles.logoWrapper}>
                  <Image
                    source={require('@/assets/images/homelogo.png')}
                    style={[
                      styles.logoImage,
                      resettingCategory && { opacity: 0.7 }
                    ]}
                    contentFit="cover"
                  />
                  {resettingCategory && (
                    <ActivityIndicator 
                      size="small" 
                      color={Colors.primary} 
                      style={styles.logoLoader}
                    />
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Banner */}
            {selectedCategory === 'man' && (
              <Animated.View
                entering={FadeInUp.delay(200).duration(500)}
                style={styles.bannerContainer}
              >
                <Image
                  source={{
                    uri: 'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
                  }}
                  style={styles.bannerImage}
                  contentFit="cover"
                  transition={300}
                  cachePolicy="memory-disk"
                />
                <View style={styles.bannerContent}>
                  <Text style={styles.bannerTitle}>{uiTexts.men}</Text>
                  <Text style={styles.bannerText}>
                    {uiTexts.menDescription}
                  </Text>
                  <TouchableOpacity
                    style={styles.bannerButton}
                    onPress={handleVisit}
                  >
                    <Text style={styles.bannerButtonText}>{uiTexts.makeVisit}</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {selectedCategory === 'woman' && (
              <Animated.View
                entering={FadeInUp.delay(200).duration(500)}
                style={styles.bannerContainer}
              >
                <Image
                  source={{
                    uri: 'https://img.freepik.com/free-photo/hairdressing-equipment-with-copy-space_23-2148352849.jpg',
                  }}
                  style={styles.bannerImage}
                  contentFit="cover"
                  transition={300}
                  cachePolicy="memory-disk"
                />
                <View style={styles.bannerContent}>
                  <Text style={styles.bannerTitle}>{uiTexts.women}</Text>
                  <Text style={styles.bannerText}>
                    {uiTexts.womenDescription}
                  </Text>
                  <TouchableOpacity
                    style={styles.bannerButtonwomen}
                    onPress={handleVisit}
                  >
                    <Text style={styles.bannerButtonwomenText}>
                      {uiTexts.makeVisit}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {selectedCategory === 'unisex' && (
              <Animated.View
                entering={FadeInUp.delay(200).duration(500)}
                style={styles.bannerContainer}
              >
                <Image
                  source={{
                    uri: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80',
                  }}
                  style={styles.bannerImage}
                  contentFit="cover"
                  transition={300}
                  cachePolicy="memory-disk"
                />
                <View style={styles.bannerContent}>
                  <Text style={styles.bannerTitle}>{uiTexts.unisex}</Text>
                  <Text style={styles.bannerText}>
                    {uiTexts.unisexDescription}
                  </Text>
                  <TouchableOpacity
                    style={styles.bannerButtonUnisex}
                    onPress={handleVisit}
                  >
                    <Text style={styles.bannerButtonText}>
                      {uiTexts.makeVisit}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* Top Barber Shops Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{uiTexts.topShops}</Text>
              {loadingShop ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : featuredBarbershop.length === 0 ? (
                <Text style={styles.noResultsText}>
                  {uiTexts.noResults} {selectedCategory === 'man' ? uiTexts.men.toLowerCase() : 
                  selectedCategory === 'woman' ? uiTexts.women.toLowerCase() : 
                  uiTexts.unisex.toLowerCase()}
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.barbersList}
                >
                  {featuredBarbershop.map((shop, index) => (
                    <Animated.View
                      key={`${shop.id}-${index}`}
                      entering={FadeInUp.delay(300 + index * 100).duration(500)}
                      style={styles.shopCard}
                    >
                     <Image
  source={
    shop.image
      ? { uri: shop.image }
      : placeholderImage
  }
  style={styles.shopImage}
  contentFit="cover"
  transition={250}
  cachePolicy="memory-disk"
  placeholder={placeholderImage}   // shown instantly while the real photo loads/caches
  onError={() => console.log("Image failed to load, showing placeholder")}
/>
<TouchableOpacity
  style={styles.favoriteButton}
  onPress={() => handleToggleFavoriteShop(shop)}
  accessibilityLabel={favoriteShopIds.has(shop.id) ? 'Remove from favorites' : 'Add to favorites'}
  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
>
  <Heart
    size={18}
    color={favoriteShopIds.has(shop.id) ? '#e0245e' : '#fff'}
    fill={favoriteShopIds.has(shop.id) ? '#e0245e' : 'transparent'}
  />
</TouchableOpacity>

                      <View>
                        <View style={styles.shopInfo}>
                          <View>
                            <Text style={styles.barberName}>
                              {shop.shopName}
                            </Text>
                          </View>
                          <Text style={styles.shopType}>
                            {shop.businessType}
                          </Text>

                          {shop.addressLine1 && (
                            <Text style={styles.barberSpecialty}>
                              {shop.addressLine1}
                            </Text>
                          )}
                          <View style={styles.genderBadge}>
                            <Text style={styles.genderText}>
                              {shop.serviceGender === 'Men'
                                ? `♂ ${uiTexts.men}'s`
                                 : shop.serviceGender === 'Women'
                                 ? `♀ ${uiTexts.women}'s`
                                 : shop.serviceGender === 'Unisex'
                                 ? `⚥ ${uiTexts.unisex}`
                                 : ''}
                            </Text>
                          </View>
                          <View style={styles.genderBadge}>
                            <Text style={styles.genderText}>
                              {uiTexts.hours} {shop.openingHours}
                            </Text>
                          </View>
                          {isShopOpenNow(shop.openingHours) && (
                            <View style={styles.openNowBadge}>
                              <Text style={styles.openNowText}>Open now</Text>
                            </View>
                          )}
                          {banners
                            .filter((b) => b.shopId === shop.id)
                            .map((b) => (
                              <View key={b.id} style={styles.shopBannerBadge}>
                                <Text style={styles.shopBannerText}>{b.title}</Text>
                              </View>
                            ))}
                          <TouchableOpacity
                            style={styles.directionsButton}
                            onPress={() => openShopDirections({
                              shopName: shop.shopName,
                              shopLocation: [shop.addressLine1, shop.city].filter(Boolean).join(', '),
                              googleMapLink: shop.googleMapLink,
                              latitude: shop.latitude,
                              longitude: shop.longitude,
                            })}
                          >
                            <MapPin size={14} color={Colors.primary} />
                            <Text style={styles.directionsText}>Directions</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Animated.View>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Reviews Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{uiTexts.reviews}</Text>
              {loadingReviews ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : reviews.length === 0 ? (
                <Text style={styles.noResultsText}>
                  {uiTexts.noReviews}
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalReviewsContainer}
                >
                  {reviews.map((review, index) => (
                    <Animated.View
                      key={`${review.id}-${index}`}
                      entering={FadeInUp.delay(600 + index * 100).duration(500)}
                      style={styles.horizontalReviewCard}
                    >
                      <View style={styles.reviewContent}>
                        <View style={styles.reviewHeader}>
                          <View>
                            <Text style={styles.reviewService}>
                              {review.shopName}
                            </Text>
                            <Text style={styles.reviewService}>
                              {review.serviceName}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.reviewRating}>
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={16}
                              color={
                                i < review.rating
                                  ? Colors.primary
                                  : Colors.textLight
                              }
                              fill={
                                i < review.rating
                                  ? Colors.primary
                                  : 'transparent'
                              }
                            />
                          ))}
                        </View>
                        <Text style={styles.reviewText}>{review.review}</Text>
                        <Text style={styles.reviewDate}>
                          {new Date(review.createdAt).toLocaleDateString(
                            'en-US',
                            {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            }
                          )}
                        </Text>
                      </View>
                    </Animated.View>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Individual Appointments Section - Shows all individual appointments */}
            {individualAppointments.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{uiTexts.appointments}</Text>
                  {individualAppointments.map((appointment, index) =>
                    renderIndividualAppointment(appointment, index)
                  )}
                </View>
              )}

            {/* Family Bookings Section - Shows all family bookings */}
              {familyBookings.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{uiTexts.familyBookings}</Text>
                  {familyBookings.map((booking, index) =>
                    renderFamilyBooking(booking, index)
                  )}
                </View>
              )}

            {/* Show empty state messages when no appointments */}
           {individualAppointments.length === 0 && familyBookings.length === 0 && (
            <View style={styles.section}>
            </View>
          )}

          <View style={styles.bottomPadding} />
        </>
      )}
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
  languageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 5,
    marginHorizontal: 20,
    marginBottom: 8,
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
  platformBanner: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
  },
  platformBannerTitle: {
    color: Colors.primary,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
  },
  platformBannerMessage: {
    color: Colors.text,
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    marginTop: 2,
  },
  aiHairstyleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.purple,
  },
  aiHairstyleBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiHairstyleBannerTitle: {
    color: '#fff',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
  },
  aiHairstyleBannerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    marginTop: 2,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 4,
  },
 selectionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100%',
    paddingHorizontal: 20,
   paddingVertical: 150,
  },
  selectionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 60, // Increased margin to give more space
    color: '#333',
    textAlign: 'center',
  },
 selectionButtons: {
  flexDirection: 'row',
  justifyContent: 'space-around', // This will space them evenly
  alignItems: 'center',
  width: '100%',
  paddingHorizontal: 10,
 gap: 60,
},
categoryButtonContainer: {
  alignItems: 'center',
  flex: 1, // This makes each container take equal space
  maxWidth: 140, // Optional: limit the maximum width
},
  unisexButtonContainer: {
    alignItems: 'center',
    width: '100%',
  },
  categoryButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 100,
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
    gap: 40,
  },
  categoryButtonMen: {
    width: 140,
    height: 140,
    backgroundColor: 'transparent',
  },
  categoryButtonWomen: {
    width: 140,
    height: 140,
    backgroundColor: 'transparent',
  },
  categoryButtonUnisex: {
    width: 140,
    height: 140,
    backgroundColor: 'transparent',
  },
  categoryImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#ccc',
  },
  categoryLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
  },

  bannerContainer: {
    marginHorizontal: 24,
    borderRadius: 16,
    overflow: 'hidden',
    height: 200,
    marginBottom: 24,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  bannerContent: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 10,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 28,
    fontFamily: 'Poppins-Bold',
    color: 'white',
    marginBottom: 8,
  },
  bannerText: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: 'white',
    marginBottom: 16,
  },
  bannerButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  bannerButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },
  bannerButtonwomen: {
    backgroundColor: Colors.pink,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  bannerButtonwomenText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },
  bannerButtonUnisex: {
    backgroundColor: Colors.purple,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  section: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: Colors.text,
  },
  barbersList: {
    paddingRight: 24,
  },
  barberImage: {
    width: 80,
    height: "100%",
    borderRadius: 10,
  },
  barberInfo: {
    padding: 12,
  },
  barberName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  barberSpecialty: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  ratingText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginLeft: 4,
  },
  servicesList: {
    gap: 12,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    elevation: 3,
  },
  serviceIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  servicePrice: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
    marginTop: 2,
  },
  serviceTime: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  serviceTimeText: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginLeft: 4,
  },
  locationCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    elevation: 3,
  },
  locationContent: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  locationIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  locationInfo: {
    flex: 1,
  },
  locationTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  locationAddress: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 2,
  },
  locationHours: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 2,
  },
  openNowBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: `${Colors.success}18`,
  },
  openNowText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  shopBannerBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: `${Colors.primary}18`,
  },
  shopBannerText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  directionsButton: {
    backgroundColor: Colors.backgroundLight,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  directionsText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
  },
  bottomPadding: {
    height: 80,
  },
  noResultsText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
    marginVertical: 16,
  },
  genderBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: Colors.backgroundLight,
    alignSelf: 'flex-start',
  },
  genderText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  appointmentCard: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  upcomingCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  familyCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.secondary,
  },
  appointmentContent: {
    flex: 1,
    padding: 16,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appointmentDetails: {
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginLeft: 8,
  },
  priceText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
    marginLeft: 22,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
  },
  shopCard: {
    width: 280,
    borderRadius: 12,
    backgroundColor: Colors.background,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  shopImage: {
    width: '100%',
    height: 150,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  favoriteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopInfo: {
    padding: 16,
  },
  shopName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  shopType: {
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 8,
  },
  shopAddress: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 2,
  },
  shopLocation: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 4,
  },
  shopPostalCode: {
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 4,
  },
  shopPhone: {
    fontSize: 14,
    color: Colors.primary,
    marginBottom: 8,
  },
  shopHours: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 8,
  },
  mapButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  mapButtonText: {
    color: 'white',
    fontWeight: '500',
  },
  barberAddress: {
    fontSize: 13,
    color: '#666',
  },
  barberPhone: {
    fontSize: 13,
    color: Colors.primary,
    marginTop: 4,
  },
  barberHours: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  reviewsList: {
    gap: 12,
  },
  reviewCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    elevation: 3,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewService: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  reviewRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 37,
  },
  reviewText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginBottom: 8,
    lineHeight: 20,
  },
  reviewDate: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  horizontalReviewsContainer: {
    paddingRight: 24,
  },
  horizontalReviewCard: {
    width: 300,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  reviewContent: {
    flex: 1,
  },
  logoWrapper: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonLoader: {
    position: 'absolute',
    alignSelf: 'center',
  },
  logoLoader: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
  },
  categoryButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  selectionButtonsSingleRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  width: '100%',
  maxWidth: 500, // Optional: set a max width for larger screens
  paddingHorizontal: 20,
},
});