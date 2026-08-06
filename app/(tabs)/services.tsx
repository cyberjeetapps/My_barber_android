import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Platform, RefreshControl, Linking, TextInput } from 'react-native';
import { Image } from 'expo-image'; // cached image loading instead of RN's uncached Image
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { Clock, MapPin, Calendar, X, ChevronRight, ShoppingBag, ClipboardList, Users, User, CreditCard, ExternalLink, Armchair, CheckCircle2 } from 'lucide-react-native';
import Animated, { 
  FadeIn, 
  FadeOut,
  FadeInUp 
} from 'react-native-reanimated';
import { collection, getDocs, addDoc, query, where, serverTimestamp, runTransaction, writeBatch, doc, getFirestore, getDoc, DocumentReference } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useGender } from '@/context/GenderContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/auth';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import { useLanguage } from '@/context/LanguageContext';
import { toast } from '@/utils/toast';
import { sendWhatsAppNotification } from '@/config/twilio';
import ShopDetailsModal from '@/components/ShopDetailsModal';
import BookingWizardModal from '@/components/BookingWizardModal';

const BUSINESS_HOURS = {
  start: 7,
  end: 21,
  interval: 30,
};
const MAX_BARBERS = 10;
const MAX_FAMILY_SLOTS = 5; // Maximum slots a family can book at once
const MAX_DISTANCE_KM = 10;
const INITIAL_SERVICES_LIMIT = 5; // Number of services to show initially
const LOAD_MORE_THRESHOLD = 0.7; // When to load more (70% scrolled)
const MESSAGING_RATE_LIMIT_DELAY = 2000; // 2 seconds between messages

// Utility function to send bot messages with rate limiting
const sendBotMessage = async (collectionName, messageData) => {
  try {
    await new Promise(resolve => setTimeout(resolve, MESSAGING_RATE_LIMIT_DELAY));
    await addDoc(collection(db, collectionName), {
      ...messageData,
      isBot: true,
      timestamp: serverTimestamp(),
      status: 'delivered'
    });
    return true;
  } catch (error: any) {
    console.error(`Error sending bot message to ${collectionName}:`, error);
    
    // Check for Twilio rate limiting specifically
    if (error.message.includes('daily messages limit') || error.code === 63038) {
      console.error('Twilio daily message limit reached - sending fallback notification');
      await addDoc(collection(db, 'fallbackNotifications'), {
        ...messageData,
        isBot: true,
        timestamp: serverTimestamp(),
        status: 'pending',
        retryCount: 0
      });
    }
    
    return false;
  }
};

const sendWithRetry = async (collectionName, messageData, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const success = await sendBotMessage(collectionName, messageData);
      if (success) return true;
      
      // Add exponential backoff delay between retries
      const delay = Math.min(1000 * Math.pow(2, i), 8000); // Cap at 8 seconds
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      console.error(`Attempt ${i + 1} failed for ${collectionName} message:`, error);
      
      // If we hit a rate limit, stop trying
      if (isRateLimited(error)) {
        console.warn('Rate limited - stopping retries');
        throw error;
      }
      
      if (i === retries - 1) throw error;
      
      const delay = Math.min(2000 * Math.pow(2, i), 16000); // Cap at 16 seconds
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
};

// Rate limiting detection
const isRateLimited = (error) => {
  return error.code === 'resource-exhausted' || 
         error.code === 429 || 
         error.code === 63038 || // Twilio daily limit
         (error.message && error.message.includes('too many')) || 
         (error.message && error.message.includes('quota exceeded')) ||
         (error.message && error.message.includes('rate limit')) ||
         (error.message && error.message.includes('daily messages limit'));
};

// Notification queue system
const useNotificationQueue = () => {
  const [queue, setQueue] = useState<any[]>([]);
  const timerRef = useRef<any>(null);
  const isProcessing = useRef(false);

  const addToQueue = (notification) => {
    setQueue(prev => [...prev, notification]);
    
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        processQueue();
      }, MESSAGING_RATE_LIMIT_DELAY);
    }
  };

  const processQueue = async () => {
    if (isProcessing.current || queue.length === 0) return;
    
    isProcessing.current = true;
    const currentQueue = [...queue];
    setQueue([]);
    
    try {
      // Process notifications in batches of 5 to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < currentQueue.length; i += batchSize) {
        const batch = currentQueue.slice(i, i + batchSize);
        await processBatch(batch);
        
        // Wait between batches if not the last one
        if (i + batchSize < currentQueue.length) {
          await new Promise(resolve => setTimeout(resolve, MESSAGING_RATE_LIMIT_DELAY));
        }
      }
    } catch (error) {
      console.error('Failed to process notification queue:', error);
      // Re-add failed notifications to queue
      setQueue(prev => [...prev, ...currentQueue]);
    } finally {
      isProcessing.current = false;
      timerRef.current = null;
      
      // If more items were added while processing, trigger another run
      if (queue.length > 0) {
        timerRef.current = setTimeout(() => {
          processQueue();
        }, MESSAGING_RATE_LIMIT_DELAY);
      }
    }
  };

  const processBatch = async (batch) => {
    try {
      const batchWrite = writeBatch(db);
      batch.forEach(notification => {
        const docRef = doc(collection(db, 'notifications'));
        batchWrite.set(docRef, notification);
      });
      await batchWrite.commit();
    } catch (error) {
      console.error('Batch write failed:', error);
      throw error;
    }
  };

  return { addToQueue };
};

export default function ServicesScreen() {
   const { addToQueue } = useNotificationQueue();
  const { gender } = useGender();
  const { user } = useAuth();
  const router = useRouter();
  const rebookParams = useLocalSearchParams<{ rebook?: string; serviceId?: string; shopId?: string }>();
  const rebookHandledRef = useRef(false);
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState('nearby');
  const [servicesByCategory, setServicesByCategory] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [allShops, setAllShops] = useState<any[]>([]);
  const [packageBookingLoading, setPackageBookingLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showShopDetailsModal, setShowShopDetailsModal] = useState(false);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [addOnServices, setAddOnServices] = useState<any[]>([]);
  const [shopStaff, setShopStaff] = useState<any[]>([]);
  const [selectedBarber, setSelectedBarber] = useState<any | null>(null);
  const [bookingDate, setBookingDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<any>(null);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<any[]>([]);
  const [selectedChairs, setSelectedChairs] = useState<number[]>([]);
  const [occupiedChairs, setOccupiedChairs] = useState<number[]>([]);
  const [loadingChairs, setLoadingChairs] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [bookingsPerSlot, setBookingsPerSlot] = useState<any>({});
  const [myWaitlistSlots, setMyWaitlistSlots] = useState<Set<string>>(new Set());
  const [userLocation, setUserLocation] = useState<any>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<any>(null);
  const [shopCapacities, setShopCapacities] = useState<any>({});
  const [offers, setOffers] = useState<any[]>([]);
  const { language, translate } = useLanguage();
  const [displayLimit, setDisplayLimit] = useState(INITIAL_SERVICES_LIMIT);
  const [allNearbyServices, setAllNearbyServices] = useState<any[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [familySlotsCount, setFamilySlotsCount] = useState(1); // Track how many slots are being booked
  const [showFamilySelector, setShowFamilySelector] = useState(false); // Control family selector visibility
  const [paymentMethod, setPaymentMethod] = useState<any>(null); // 'cash' or 'online'
  const [isSummaryServicesExpanded, setIsSummaryServicesExpanded] = useState(true); // Default to true as per screenshot
    const toggleFamilyBooking = () => {
    if (familySlotsCount === 1) {
      // If currently 1, show selector to choose family size
      setShowFamilySelector(true);
    } else {
      // If already in family mode, reset back to 1
      setFamilySlotsCount(1);
      setShowFamilySelector(false);
    }
  };


  

  // Hosted, legally-reviewed Terms & Conditions page — the in-app modal below
  // is a quick-reference summary; this is the source of truth customers can
  // open in their browser.


  // Translated UI texts
  const [uiTexts, setUiTexts] = useState({
    servicesTitle: 'Services',
    servicesSubtitle: 'Choose from our premium services',
    nearby: 'Nearby',
    haircuts: 'Haircuts',
    beards: 'Beard Trims',
    packages: 'Packages',
    kids: 'Kids',
    premium: 'Premium',
    hairTransplant: 'Hair Transplant',
    agreeTerms: 'I agree to the',
    termsAndConditions: 'Terms & Conditions',
    viewTerms: 'View',
    termsRequired: 'Please accept the Terms & Conditions to continue',
    confirmPurchase: 'Confirm Package Purchase',
    purchaseConfirmation: 'Are you sure you want to purchase the',
    packageFor: 'package for',
    cancel: 'Cancel',
    addPackage: 'Add Package',
    purchaseSuccess: 'Package purchased successfully!',
    selectTimeSlot: 'Please select a time slot',
    signInToBook: 'Please sign in to book an appointment',
    slotBooked: 'This time slot is now fully booked. Please choose another time.',
    bookingSuccess: 'Appointment booked successfully at',
    purchasePackage: 'Purchase Package',
    confirmBooking: 'Confirm Booking',
    availableTimeSlots: 'Available Time Slots',
    spotsLeft: 'spots left',
    includes: 'Includes:',
    kmAway: 'km away',
    book: 'Book',
    payInCash:'Pay In Cash',
    prepayOnline:'PrePay Online',
    mensServices: "Men's services",
    womensServices: "Women's services",
    unisexsServices: "Unisex's services",
    originalPrice: 'Original',
    discountPrice: 'Discount',
    youSave: 'You save',
    loadingMore: 'Loading more services...',
    familyBooking: 'Family Booking',
    familyMembers: 'Number of family members',
    selectFamilyMembers: 'Select how many family members',
    maxFamilySlots: `(Maximum ${MAX_FAMILY_SLOTS})`
  });

  // Translate UI when language changes
  useEffect(() => {
    const translateUI = async () => {
      if (language === 'en') {
        setUiTexts({
          servicesTitle: 'Services',
          servicesSubtitle: 'Choose from our premium services',
          nearby: 'Nearby',
          haircuts: 'Haircuts',
          beards: 'Beard Trims',
          packages: 'Packages',
          kids: 'Kids',
          confirmPurchase: 'Confirm Package Purchase',
          purchaseConfirmation: 'Are you sure you want to purchase the',
          packageFor: 'package for',
          cancel: 'Cancel',
          addPackage: 'Add Package',
          purchaseSuccess: 'Package purchased successfully!',
          selectTimeSlot: 'Please select a time slot',
          signInToBook: 'Please sign in to book an appointment',
          slotBooked: 'This time slot is now fully booked. Please choose another time.',
          bookingSuccess: 'Appointment booked successfully at',
          purchasePackage: 'Purchase Package',
          confirmBooking: 'Confirm Booking',
          availableTimeSlots: 'Available Time Slots',
          spotsLeft: 'spots left',
          includes: 'Includes:',
          kmAway: 'km away',
          book: 'Book',
          payInCash:'Pay In Cash',
          prepayOnline:'PrePay Online',
          mensServices: "Men's services",
          womensServices: "Women's services",
          unisexsServices: "Unisex's services",
          originalPrice: 'Original',
          discountPrice: 'Discount',
          youSave: 'You save',
          loadingMore: 'Loading more services...',
          familyBooking: 'Family Booking',
          familyMembers: 'Number of family members',
          selectFamilyMembers: 'Select how many family members',
          maxFamilySlots: `(Maximum ${MAX_FAMILY_SLOTS})`,
          premium: 'Premium',
          hairTransplant: 'Hair Transplant',
          agreeTerms: 'I agree to the',
          termsAndConditions: 'Terms & Conditions',
          viewTerms: 'View',
          termsRequired: 'Please accept the Terms & Conditions to continue'
        });
      } else {
        const translated = await Promise.all([
          translate('Services'),
          translate('Choose from our premium services'),
          translate('Nearby'),
          translate('Haircuts'),
          translate('Beard Trims'),
          translate('Packages'),
          translate('Kids'),
          translate('Confirm Package Purchase'),
          translate('Are you sure you want to purchase the'),
          translate('package for'),
          translate('Cancel'),
          translate('Add Package'),
          translate('Package purchased successfully!'),
          translate('Please select a time slot'),
          translate('Please sign in to book an appointment'),
          translate('This time slot is now fully booked. Please choose another time.'),
          translate('Appointment booked successfully at'),
          translate('Purchase Package'),
          translate('Confirm Booking'),
          translate('Available Time Slots'),
          translate('spots left'),
          translate('Includes:'),
          translate('km away'),
          translate('Book'),
          translate('Pay In Cash'),
          translate('PrePay Online'),
          translate("Men's services"),
          translate("Women's services"),
          translate("Unisex's services"),
          translate('Original'),
          translate('Discount'),
          translate('You save'),
          translate('Loading more services...'),
          translate('Family Booking'),
          translate('Number of family members'),
          translate('Select how many family members'),
          translate(`(Maximum ${MAX_FAMILY_SLOTS})`),
          translate('Premium'),
          translate('Hair Transplant'),
          translate('I agree to the'),
          translate('Terms & Conditions'),
          translate('View'),
          translate('Please accept the Terms & Conditions to continue')
        ]);
        
        setUiTexts({
          servicesTitle: translated[0],
          servicesSubtitle: translated[1],
          nearby: translated[2],
          haircuts: translated[3],
          beards: translated[4],
          packages: translated[5],
          kids: translated[6],
          confirmPurchase: translated[7],
          purchaseConfirmation: translated[8],
          packageFor: translated[9],
          cancel: translated[10],
          addPackage: translated[11],
          purchaseSuccess: translated[12],
          selectTimeSlot: translated[13],
          signInToBook: translated[14],
          slotBooked: translated[15],
          bookingSuccess: translated[16],
          purchasePackage: translated[17],
          confirmBooking: translated[18],
          availableTimeSlots: translated[19],
          spotsLeft: translated[20],
          includes: translated[21],
          kmAway: translated[22],
          book: translated[23],
          payInCash:translated[24],
          prepayOnline:translated[25],
          mensServices: translated[26],
          womensServices: translated[27],
          unisexsServices: translated[28],
          originalPrice: translated[29],
          discountPrice: translated[30],
          youSave: translated[31],
          loadingMore: translated[32],
          familyBooking: translated[33],
          familyMembers: translated[34],
          selectFamilyMembers: translated[35],
          maxFamilySlots: translated[36],
          premium: translated[37],
          hairTransplant: translated[38],
          agreeTerms: translated[39],
          termsAndConditions: translated[40],
          viewTerms: translated[41],
          termsRequired: translated[42]
        });
      }
    };

    translateUI();
  }, [language]);
  const categories = [
    { id: 'nearby', name: uiTexts.nearby },
    { id: 'haircuts', name: uiTexts.haircuts || 'Haircuts' },
    ...(gender?.toLowerCase() === 'man' || !gender
      ? [{ id: 'beards', name: uiTexts.beards || 'Beards' }]
      : []),
    { id: 'hairColor', name: 'Hair Color' },
    { id: 'facial', name: 'Facial & Skincare' },
    { id: 'massage', name: 'Massage & Spa' },
    { id: 'packages', name: uiTexts.packages || 'Packages' },
    { id: 'kids', name: uiTexts.kids || 'Kids' },
    { id: 'premium', name: uiTexts.premium || 'Premium' },
    { id: 'hairTransplant', name: uiTexts.hairTransplant || 'Hair Transplant' },
    { id: 'other', name: 'Other' }
  ];

  // Handle scroll to load more services
  const handleScroll = (event) => {
    if (selectedCategory !== 'nearby') return;
    
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const scrollPosition = (contentOffset.y + layoutMeasurement.height) / contentSize.height;
    
    if (scrollPosition > LOAD_MORE_THRESHOLD && 
        displayLimit < allNearbyServices.length && 
        !loadingMore) {
      loadMoreServices();
    }
  };

  // Load more services function
  const loadMoreServices = () => {
    setLoadingMore(true);
    // Increase display limit by 5 or whatever increment you prefer
    const newLimit = Math.min(displayLimit + 5, allNearbyServices.length);
    setDisplayLimit(newLimit);
    setLoadingMore(false);
  };

  const fetchShops = async () => {
    try {
      const shopsSnapshot = await getDocs(collection(db, 'shops'));
      let shopsData = shopsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      }));
      
      // Translate shop names if not in English
      if (language !== 'en') {
        shopsData = await Promise.all(
          shopsData.map(async shop => ({
            ...shop,
            shopName: shop.shopName ? await translate(shop.shopName) : shop.shopName
          }))
        );
      }
      
      // Initialize shop capacities
      const capacities = {};
      shopsData.forEach(shop => {
        capacities[shop.id] = shop.capacity || MAX_BARBERS;
      });
      
      setShopCapacities(capacities);
      setAllShops(shopsData);
      return shopsData;
    } catch (error: any) {
      console.error('Error fetching shops:', error);
      await sendWithRetry('adminDevices', {
        deviceId: 'xnUiOF3VQjaqfzsfPdugcLSso2V2',
        title: 'Shop Fetch Error',
        body: `Failed to fetch shops: ${error.message}`,
        data: {
          type: 'data_fetch_error',
          collection: 'shops'
        }
      });
      return [];
    }
  };

  const fetchOffers = async () => {
    try {
      const offersSnapshot = await getDocs(collection(db, 'offers'));
      const offersData = offersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      }));
      setOffers(offersData);
      return offersData;
    } catch (error) {
      console.error('Error fetching offers:', error);
      return [];
    }
  };

  useEffect(() => {
    fetchShops();
    fetchOffers();
  }, [language]);

  const getUserLocation = async () => {
    setLocationLoading(true);
    setLocationError(null);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permission to access location was denied');
        setLocationLoading(false);
        return null;
      }
      let location = await Location.getCurrentPositionAsync({});
      setUserLocation(location.coords);
      return location.coords;
    } catch (err) {
      console.error('Error getting location:', err);
      setLocationError('Failed to get your location');
      throw err;
    } finally {
      setLocationLoading(false);
    }
  };

  const determineCategory = (name = '', description = '') => {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes('kids') || text.includes('kid') || text.includes('child')) return 'kids';
  if (text.includes('beard')) return 'beards';
  if (text.includes('transplant') || text.includes('hair graft') || text.includes('fue') || text.includes('fut')) return 'hairTransplant';
  if (text.includes('premium') || text.includes('luxury') || text.includes('deluxe') || text.includes('vip')) return 'premium';
  if (text.includes('package') || text.includes('full')) return 'packages';
  if (text.includes('hair') || text.includes('cut') || text.includes('style')) return 'haircuts';
  return 'other';
};

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const deg2rad = (deg) => deg * (Math.PI/180);

  const getServiceDiscount = (serviceId, shopId) => {
    const currentDate = new Date();
    const validOffers = offers.filter(offer => 
      offer.serviceId === serviceId && 
      offer.shopId === shopId &&
      offer.status === 'approved' &&
      new Date(offer.validUntil) >= currentDate
    );
    
    if (validOffers.length > 0) {
      // Return the offer with highest discount
      return validOffers.reduce((max, offer) => offer.discount > max.discount ? offer : max);
    }
    return null;
  };

  const calculateDiscountedPrice = (price, discount) => {
    return price - (price * discount / 100);
  };

  const fetchData = async () => {
  setLoading(true);
  try {
    // First load - get shops and offers
    const [shopsData, offersData] = await Promise.all([fetchShops(), fetchOffers()]);

    if (selectedCategory === 'packages') {
      const snapshot = await getDocs(collection(db, 'packages'));
      const packages: any[] = [];
      
      snapshot.docs.forEach(doc => {
        const pkg = { id: doc.id, ...(doc.data() as any) };
        
        // Modified gender filter to support arrays and 'unisex'
        if (gender) {
          const pkgGender = pkg.gender;
          if (Array.isArray(pkgGender)) {
            const lowerGenders = pkgGender.map(g => g.toLowerCase());
            if (!lowerGenders.includes(gender.toLowerCase()) && !lowerGenders.includes('unisex')) {
              return;
            }
          } else if (pkgGender) {
            const lowerGender = pkgGender.toLowerCase();
            if (lowerGender !== gender.toLowerCase() && lowerGender !== 'unisex') {
              return;
            }
          } else {
            return;
          }
        }
        
        if (pkg.shopIds && pkg.shopIds.length > 0) {
          pkg.shopIds.forEach(shopId => {
            const shop = shopsData.find(s => s.id === shopId);
            if (shop) {
              packages.push({
                ...pkg,
                id: `${pkg.id}_${shop.id}`,
                shopId: shop.id,
                shopName: shop.shopName,
                languageShopName: shop.languageShopName || shop.shopName,
                shopLocation: shop.addressLine1,
                languageShopLocation: shop.languageAddressLine1 || shop.addressLine1,
                distance: userLocation ? calculateDistance(
                  userLocation.latitude,
                  userLocation.longitude,
                  parseFloat(shop.latitude),
                  parseFloat(shop.longitude)
                ) : null
              });
            }
          });
        } else {
          packages.push(pkg);
        }
      });

      // Preserve original data while adding translations
      let processedPackages = packages;
      if (language !== 'en') {
        processedPackages = await Promise.all(
          packages.map(async (pkg) => {
            return {
              ...pkg,
              languageName: pkg.name ? await translate(pkg.name) : pkg.name,
              languageDescription: pkg.description ? await translate(pkg.description) : pkg.description,
              languageServices: pkg.services ? await Promise.all(pkg.services.map(service => translate(service))) : pkg.services,
              // Keep original fields intact
              name: pkg.name,
              description: pkg.description,
              services: pkg.services
            };
          })
        );
      }
      
      setServicesByCategory({ packages: processedPackages });
    } else if (selectedCategory === 'nearby') {
        const coords = await getUserLocation();
        if (!coords) return;

        // First phase - just get location and basic shop data
        if (initialLoad) {
          setInitialLoad(false);
          return; // Exit early to trigger second load
        }

        // Second phase - now process with all data
        const shopsWithDistance = shopsData.map(shop => ({
          ...shop,
          distance: calculateDistance(
            coords.latitude,
            coords.longitude,
            parseFloat(shop.latitude),
            parseFloat(shop.longitude)
          ) 
        }));

        const nearbyShops = shopsWithDistance.filter(shop => shop.distance <= MAX_DISTANCE_KM);
        
        const servicesSnapshot = await getDocs(collection(db, 'services'));
        const allServices = servicesSnapshot.docs
          .map(doc => {
            const service = { 
              id: doc.id, 
              ...(doc.data() as any), 
              category: doc.data().category || determineCategory(doc.data().name, doc.data().description) 
            };
            if (service.shopIds) {
              service.shops = service.shopIds.map(shopId => 
                nearbyShops.find(shop => shop.id === shopId)
              ).filter(Boolean);
            }
            return service;
          })
          // Modified gender filter to support arrays and unisex
          .filter(service => {
            if (!gender) return true;
            const svcGender = service.gender;
            if (Array.isArray(svcGender)) {
              const lowerGenders = svcGender.map(g => g.toLowerCase());
              return lowerGenders.includes(gender.toLowerCase()) || lowerGenders.includes('unisex');
            }
            if (svcGender) {
              const lowerGender = svcGender.toLowerCase();
              return lowerGender === gender.toLowerCase() || lowerGender === 'unisex';
            }
            return false;
          });

        const nearbyServices: any[] = [];
        for (const service of allServices) {
          if (service.shops && service.shops.length > 0) {
            for (const shop of service.shops) {
              const discountOffer = getServiceDiscount(service.id, shop.id);
              const discountedPrice = discountOffer 
                ? calculateDiscountedPrice(service.price, discountOffer.discount)
                : null;

              nearbyServices.push({
                ...service,
                id: `${service.id}_${shop.id}`,
                originalServiceId: service.id,
                shopName: shop.shopName, // Already translated in fetchShops
                shopLocation: shop.addressLine1,
                distance: shop.distance,
                shopId: shop.id,
                discountOffer,
                discountedPrice,
                originalPrice: service.price // Keep original price
              });
            }
          }
        }

        // Translate nearby services if not in English
        let translatedNearbyServices = nearbyServices;
        if (language !== 'en') {
          translatedNearbyServices = await Promise.all(
            nearbyServices.map(async (service) => {
              const translatedName = service.name 
                ? await translate(service.name) 
                : service.name;
              
              const translatedDescription = service.description 
                ? await translate(service.description) 
                : service.description;

              return {
                ...service,
                name: translatedName,
                description: translatedDescription
              };
            })
          );
        }

        translatedNearbyServices.sort((a, b) => a.distance - b.distance);
        
        // Store all nearby services and set initial display limit
        setAllNearbyServices(translatedNearbyServices);
        setDisplayLimit(INITIAL_SERVICES_LIMIT);
        setServicesByCategory({ nearby: translatedNearbyServices.slice(0, INITIAL_SERVICES_LIMIT) });
      
    } else {
      const servicesSnapshot = await getDocs(collection(db, 'services'));
      const servicesData = servicesSnapshot.docs
        .map(doc => {
          const service = { 
            id: doc.id, 
            ...(doc.data() as any), 
            category: doc.data().category || determineCategory(doc.data().name, doc.data().description) 
          };
          if (service.shopIds) {
            service.shops = service.shopIds.map(shopId => 
              shopsData.find(shop => shop.id === shopId)
            ).filter(Boolean);
          }
          return service;
        })
        // Modified gender filter to support arrays and unisex
        .filter(service => {
          if (!gender) return true;
          const svcGender = service.gender;
          if (Array.isArray(svcGender)) {
            const lowerGenders = svcGender.map(g => g.toLowerCase());
            return lowerGenders.includes(gender.toLowerCase()) || lowerGenders.includes('unisex');
          }
          if (svcGender) {
            const lowerGender = svcGender.toLowerCase();
            return lowerGender === gender.toLowerCase() || lowerGender === 'unisex';
          }
          return false;
        });

      // Process services with consistent translation approach
      let processedServices = servicesData;
      if (language !== 'en') {
        processedServices = await Promise.all(
          servicesData.map(async (service) => {
            return {
              ...service,
              languageName: service.name ? await translate(service.name) : service.name,
              languageDescription: service.description ? await translate(service.description) : service.description,
              // Keep original fields
              name: service.name,
              description: service.description
            };
          })
        );
      }

      const categorized = processedServices.reduce((acc, item) => {
        const cat = item.category || 'other';
        if (!acc[cat]) acc[cat] = [];
        
        if (item.shops && item.shops.length > 0) {
          item.shops.forEach(shop => {
            const discountOffer = getServiceDiscount(item.id, shop.id);
            const discountedPrice = discountOffer 
              ? calculateDiscountedPrice(item.price, discountOffer.discount)
              : null;

            acc[cat].push({
              ...item,
              id: `${item.id}_${shop.id}`,
              shopName: shop.shopName,
              languageShopName: shop.languageShopName || shop.shopName,
              shopLocation: shop.addressLine1,
              languageShopLocation: shop.languageAddressLine1 || shop.addressLine1,
              shopId: shop.id,
              discountOffer,
              discountedPrice,
              originalPrice: item.price
            });
          });
        } else {
          acc[cat].push(item);
        }
        
        return acc;
      }, {});

      setServicesByCategory(categorized);
    }
  } catch (error) {
    console.error('Error loading data:', error);
    setError('Failed to load services. Please try again.');
  } finally {
    setLoading(false);
  }
};

  // Reset initial load when category changes
  useEffect(() => {
    setInitialLoad(true);
    setDisplayLimit(INITIAL_SERVICES_LIMIT); // Reset display limit when category changes
    fetchData();
  }, [selectedCategory, gender, language]);

  // Trigger second load when initialLoad changes
  useEffect(() => {
    if (!initialLoad && selectedCategory === 'nearby') {
      fetchData();
    }
  }, [initialLoad]);

  useEffect(() => { 
    if (showBookingModal && selectedService) generateAvailableTimeSlots(); 
  }, [bookingDate, selectedService, showBookingModal]);

  // Chair selection ("pick your chair, BookMyShow-style") only applies to a
  // single-person booking for a normal service. Hair Transplant keeps the
  // existing time-slot-only flow untouched, and family bookings keep their
  // existing auto-assigned-chair-per-member behavior — letting each family
  // member individually pick a distinct chair is a bigger, separate UI.
  // Chair selection applies to all normal services including family bookings now.
  const chairSelectionApplies = selectedCategory !== 'hairTransplant';

  useEffect(() => {
    setSelectedChairs([]);
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponError('');
    if (!selectedTimeSlot || !selectedService?.shopId) {
      setOccupiedChairs([]);
      return;
    }
    fetchOccupiedChairs();
  }, [selectedTimeSlot, selectedService]);

  useEffect(() => {
    if (selectedService?.shopId && occupiedChairs.length >= 0) {
      const totalChairs = Number(shopCapacities[selectedService.shopId]) || MAX_BARBERS;
      const maxAvailable = Math.max(0, totalChairs - occupiedChairs.length);
      if (familySlotsCount > maxAvailable && maxAvailable > 0) {
        setFamilySlotsCount(maxAvailable);
      }
    }
  }, [occupiedChairs, selectedService, shopCapacities]);

  const fetchOccupiedChairs = async () => {
    if (!selectedService?.shopId || !selectedTimeSlot) return;
    setLoadingChairs(true);
    try {
      const slotKey = selectedTimeSlot.toISOString();
      const dateKey = selectedTimeSlot.toISOString().slice(0, 10);
      const slotMinutes = selectedTimeSlot.getHours() * 60 + selectedTimeSlot.getMinutes();
      const [apptSnap, familySnap, blockedSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'appointments'),
          where('shopId', '==', selectedService.shopId),
          where('dateTime', '==', slotKey)
        )),
        getDocs(query(
          collection(db, 'familybookings'),
          where('shopId', '==', selectedService.shopId),
          where('dateTime', '==', slotKey)
        )),
        getDocs(query(
          collection(db, 'blockedSlots'),
          where('shopId', '==', selectedService.shopId),
          where('date', '==', dateKey)
        )),
      ]);

      const taken = new Set<number>();
      apptSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.status !== 'cancelled' && typeof data.barberNumber === 'number') {
          taken.add(data.barberNumber);
        }
      });
      familySnap.docs.forEach((d) => {
        const data = d.data();
        if (data.status === 'cancelled') return;
        (data.members || []).forEach((m: any) => {
          if (typeof m.barberNumber === 'number') taken.add(m.barberNumber);
        });
      });
      // Single-chair owner blocks (e.g. "Chair 2 out for repair 1–3pm")
      // remove just that chair rather than the whole time slot.
      blockedSnap.docs.forEach((d) => {
        const b = d.data();
        if (!b.barberNumber || b.barberNumber === 0) return; // whole-shop blocks are handled at the time-slot level already
        const [startH, startM] = String(b.startTime || '00:00').split(':').map(Number);
        const [endH, endM] = String(b.endTime || '00:00').split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        if (slotMinutes >= startMinutes && slotMinutes < endMinutes) {
          taken.add(b.barberNumber);
        }
      });

      setOccupiedChairs(Array.from(taken));
    } catch (err) {
      console.error('Failed to fetch chair availability:', err);
      // Fail open to "unknown" rather than blocking booking entirely —
      // the booking transaction itself is still the source of truth and
      // will reject a double-booked chair regardless of this UI hint.
      setOccupiedChairs([]);
    } finally {
      setLoadingChairs(false);
    }
  };

  // Real coupon validation against the `coupons` collection — checks
  // active/date-range/minimum-spend rules and computes the actual
  // discount, which then feeds into totalPriceCalculated at booking time
  // (not just a cosmetic "code accepted" message).
  const validateCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code || !selectedService) return;
    setValidatingCoupon(true);
    setCouponError('');
    try {
      const snap = await getDocs(
        query(collection(db, 'coupons'), where('code', '==', code))
      );
      if (snap.empty) {
        setCouponError('Invalid coupon code.');
        setAppliedCoupon(null);
        return;
      }
      const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;

      if (coupon.active === false) {
        setCouponError('This coupon is no longer active.');
        setAppliedCoupon(null);
        return;
      }
      const now = new Date();
      if (coupon.validFrom && now < new Date(coupon.validFrom)) {
        setCouponError('This coupon is not active yet.');
        setAppliedCoupon(null);
        return;
      }
      if (coupon.validTo && now > new Date(coupon.validTo)) {
        setCouponError('This coupon has expired.');
        setAppliedCoupon(null);
        return;
      }
      if (typeof coupon.usageLimit === 'number' && (coupon.usedCount || 0) >= coupon.usageLimit) {
        setCouponError('This coupon has reached its usage limit.');
        setAppliedCoupon(null);
        return;
      }

      const basePriceForCheck = (typeof selectedService.discountedPrice === 'number' && selectedService.discountedPrice > 0)
        ? selectedService.discountedPrice
        : selectedService.price;
      if (coupon.minSpend && basePriceForCheck < coupon.minSpend) {
        setCouponError(`Minimum spend of ₹${coupon.minSpend} required for this coupon.`);
        setAppliedCoupon(null);
        return;
      }

      setAppliedCoupon(coupon);
      toast.success('Coupon applied', coupon.type === 'percent' ? `${coupon.value}% off` : `₹${coupon.value} off`);
    } catch (err) {
      console.error('Coupon validation failed:', err);
      setCouponError('Could not validate coupon. Please try again.');
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const computeCouponDiscount = (amount: number) => {
    if (!appliedCoupon) return 0;
    let discount = appliedCoupon.type === 'percent'
      ? Math.round((amount * appliedCoupon.value) / 100)
      : appliedCoupon.value;
    if (appliedCoupon.maxDiscount) discount = Math.min(discount, appliedCoupon.maxDiscount);
    return Math.min(discount, amount); // never discount below zero
  };

  const parseTimeString = (timeStr: string) => {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return null;
    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const period = match[3].toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return { hour, minute };
  };

  const generateTimeSlots = () => {
    if (!selectedService || !selectedService.shopId) return [];
    
    const shop = allShops.find((s: any) => s.id === selectedService.shopId);
    if (!shop) return [];

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = days[bookingDate.getDay()];
    const dayTiming = shop.timings?.[dayName];

    if (dayTiming?.isClosed) return [];

    let startHour = BUSINESS_HOURS.start;
    let startMinute = 0;
    let endHour = BUSINESS_HOURS.end;
    let endMinute = 0;

    if (dayTiming?.open) {
      const parsedOpen = parseTimeString(dayTiming.open);
      if (parsedOpen) {
        startHour = parsedOpen.hour;
        startMinute = parsedOpen.minute;
      }
    }

    if (dayTiming?.close) {
      const parsedClose = parseTimeString(dayTiming.close);
      if (parsedClose) {
        endHour = parsedClose.hour;
        endMinute = parsedClose.minute;
      }
    }

    const slots: Date[] = [];
    
    const startTime = new Date(bookingDate);
    startTime.setHours(startHour, startMinute, 0, 0);

    const endTime = new Date(bookingDate);
    endTime.setHours(endHour, endMinute, 0, 0);

    const currentTime = new Date(startTime);
    while (currentTime < endTime) {
      if (currentTime > new Date()) {
        slots.push(new Date(currentTime));
      }
      currentTime.setMinutes(currentTime.getMinutes() + BUSINESS_HOURS.interval);
    }
    
    return slots;
  };

 const generateAvailableTimeSlots = async () => {
  if (!selectedService || !selectedService.shopId) {
    setAvailableTimeSlots([]);
    return;
  }

  try {
    const slots = generateTimeSlots();

    // Scoped to this shop and this exact day — was previously reading
    // the ENTIRE appointments and familybookings collections on every
    // single booking-screen open, then filtering client-side. At real
    // volume that's tens of thousands of document reads for a screen a
    // customer opens constantly, and the cost only grows as booking
    // history accumulates, not just as new salons join. The composite
    // index this needs (shopId + dateTime) already exists in
    // firestore.indexes.json — nothing new to deploy for this fix.
    const dayStart = new Date(bookingDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(bookingDate);
    dayEnd.setHours(23, 59, 59, 999);
    const dayStartKey = dayStart.toISOString();
    const dayEndKey = dayEnd.toISOString();

    const [appointmentsSnapshot, familyBookingsSnapshot, blockedSnapshot] = await Promise.all([
      getDocs(query(
        collection(db, 'appointments'),
        where('shopId', '==', selectedService.shopId),
        where('dateTime', '>=', dayStartKey),
        where('dateTime', '<=', dayEndKey)
      )),
      getDocs(query(
        collection(db, 'familybookings'),
        where('shopId', '==', selectedService.shopId),
        where('dateTime', '>=', dayStartKey),
        where('dateTime', '<=', dayEndKey)
      )),
      getDocs(query(collection(db, 'blockedSlots'), where('shopId', '==', selectedService.shopId)))
    ]);

    // Owner-created blocks (breaks, closures, single-chair blocks) for this
    // exact date — these actually remove slots from what the customer can
    // pick, not just display as a note somewhere the customer never sees.
    const dateKey = bookingDate.toISOString().slice(0, 10);
    const blocksToday = blockedSnapshot.docs
      .map(d => d.data())
      .filter(b => b.date === dateKey && (b.barberNumber === 0)); // whole-shop blocks hide the slot entirely;
      // single-chair blocks (barberNumber > 0) still leave the slot open if
      // other chairs are free — enforced in the chair grid, not here.

    const isBlocked = (slot: Date) => {
      const slotMinutes = slot.getHours() * 60 + slot.getMinutes();
      return blocksToday.some(b => {
        const [startH, startM] = String(b.startTime || '00:00').split(':').map(Number);
        const [endH, endM] = String(b.endTime || '00:00').split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        return slotMinutes >= startMinutes && slotMinutes < endMinutes;
      });
    };

    const bookingsCount = {};

    // Count individual appointments — the query above already scoped
    // this to the right shop and day, so this is just tallying by exact
    // slot time now, not re-filtering the whole collection.
    appointmentsSnapshot.docs.forEach(doc => {
      const appt = doc.data();
      const slotKey = appt.dateTime;
      bookingsCount[slotKey] = (bookingsCount[slotKey] || 0) + 1;
    });
    
    // Count family bookings (each member counts as 1 slot)
    familyBookingsSnapshot.docs.forEach(doc => {
      const familyBooking = doc.data();
      const bookingDate = new Date(familyBooking.dateTime);
      if (
        bookingDate.toDateString() === bookingDate.toDateString() &&
        familyBooking.shopId === selectedService.shopId
      ) {
        const slotKey = familyBooking.dateTime;
        bookingsCount[slotKey] = (bookingsCount[slotKey] || 0) + familyBooking.familySize;
      }
    });
    
    setBookingsPerSlot(bookingsCount);

    // Fully-booked slots still render (as disabled + "Join waitlist") rather
    // than disappearing — a customer can't join a waitlist for a time they
    // never see. Only owner-blocked times are actually removed from the list.
    setAvailableTimeSlots(slots.filter(slot => !isBlocked(slot)));

    // The customer's own active waitlist entries for this shop, so a slot
    // already joined shows "Waitlisted" instead of an actionable prompt again.
    if (user?.uid) {
      try {
        const waitlistSnap = await getDocs(query(
          collection(db, 'waitlist'),
          where('userId', '==', user.uid),
          where('shopId', '==', selectedService.shopId),
          where('status', '==', 'waiting')
        ));
        setMyWaitlistSlots(new Set(waitlistSnap.docs.map(d => d.data().dateTime)));
      } catch (waitlistError) {
        console.error('Error fetching waitlist entries:', waitlistError);
      }
    }
  } catch (error) {
    console.error('Error fetching available slots:', error);
    setError('Failed to load available time slots');
  }
};

  const joinWaitlist = async (slot: Date) => {
    if (!user?.uid || !selectedService) return;
    const slotKey = slot.toISOString();
    try {
      await addDoc(collection(db, 'waitlist'), {
        userId: user.uid,
        userName: user.name || 'Anonymous',
        userPhone: user.phoneNumber || '',
        shopId: selectedService.shopId,
        shopName: selectedService.shopName || '',
        serviceId: selectedService.originalServiceId || selectedService.id,
        serviceName: selectedService.name || '',
        dateTime: slotKey,
        partySize: familySlotsCount || 1,
        status: 'waiting',
        createdAt: serverTimestamp(),
      });
      setMyWaitlistSlots(prev => new Set(prev).add(slotKey));
      toast.success('Added to waitlist', "We'll notify you if this time opens up.");
    } catch (error) {
      console.error('Error joining waitlist:', error);
      toast.error('Error', 'Could not join the waitlist. Please try again.');
    }
  };

  const handleBook = (item) => {
    if (selectedCategory === 'packages') handlePackageBooking(item);
    else { setSelectedService(item); setAddOnServices([]); setSelectedTimeSlot(null); setShowShopDetailsModal(true); }
  };

  const handleOpenBookingFlow = (serviceItem?: any, staff?: any[]) => {
    if (serviceItem) {
      setSelectedService(serviceItem);
      setAddOnServices([]);
    }
    if (staff) {
      setShopStaff(staff);
    } else {
      setShopStaff([]);
    }
    setSelectedBarber(null);
    setShowShopDetailsModal(false);
    setSelectedTimeSlot(null);
    setShowBookingModal(true);
  };


  // Quick rebook reuses the normal booking flow. It never creates a booking
  // automatically and still requires date, time, payment and terms confirmation.
  useEffect(() => {
    if (rebookHandledRef.current || rebookParams.rebook !== '1') return;
    if (!rebookParams.serviceId || !rebookParams.shopId) return;

    const categoryItems = Object.values(servicesByCategory).flatMap((items: any) =>
      Array.isArray(items) ? items : []
    );
    const candidates = [...allNearbyServices, ...categoryItems];
    const match = candidates.find((item: any) =>
      String(item.shopId) === String(rebookParams.shopId) &&
      String(item.originalServiceId || item.serviceId || item.id).replace(`_${item.shopId}`, '') === String(rebookParams.serviceId)
    );

    if (match) {
      rebookHandledRef.current = true;
      setSelectedCategory('nearby');
      handleBook(match);
      toast.info('Ready to rebook', 'Please choose a new date and time.');
    }
  }, [rebookParams.rebook, rebookParams.serviceId, rebookParams.shopId, allNearbyServices, servicesByCategory]);

const handlePackageBooking = async (pkg) => {

  Alert.alert(
    uiTexts.confirmPurchase,
    `${uiTexts.purchaseConfirmation} "${pkg.name}" ${uiTexts.packageFor} ₹${pkg.price}?`,
    [
      { text: uiTexts.cancel, style: "cancel" },
      {
        text: uiTexts.addPackage,
        onPress: async () => {
          setPackageBookingLoading(true);
          setError('');
          try {
            if (!user) throw new Error(uiTexts.signInToBook);
            
            // Get the original package data in English
            let originalPackage: any = null;
            try {
              const packageId = pkg.id.split('_')[0];
              const packageSnapshot = await getDocs(query(
                collection(db, 'packages'), 
                where('__name__', '==', packageId)
              ));
              if (!packageSnapshot.empty) {
                originalPackage = {
                  id: packageSnapshot.docs[0].id,
                  ...packageSnapshot.docs[0].data()
                };
              }
            } catch (error) {
              console.error('Error fetching original package:', error);
            }

            // Get the original shop data in English if shop exists
            let originalShop: any = null;
            if (pkg.shopId) {
              try {
                const shopSnapshot = await getDocs(query(
                  collection(db, 'shops'), 
                  where('__name__', '==', pkg.shopId)
                ));
                if (!shopSnapshot.empty) {
                  originalShop = {
                    id: shopSnapshot.docs[0].id,
                    ...shopSnapshot.docs[0].data()
                  };
                }
              } catch (error) {
                console.error('Error fetching original shop:', error);
              }
            }

            // Calculate expiry date based on package duration
            const expiryDate = calculateExpiryDate(pkg.duration);

            // Create package purchase with both translated and original data
            const packageData = {
              userId: user.uid,
              userName: user.name || 'Anonymous',
              userPhone: user.phoneNumber || '',
              packageId: pkg.id.split('_')[0],
              languagepackageName: pkg.name || 'Unknown Package',
              languagepackageDescription: pkg.description || '',
              price: pkg.price || 0,
              duration: pkg.duration || 'No duration specified',
              languageservices: pkg.services || [],
              imageUrl: pkg.imageUrl || '',
              gender: pkg.gender || 'unisex',
              packageName: originalPackage?.name || pkg.name || 'Unknown Package',
              packageDescription: originalPackage?.description || pkg.description || '',
              services: originalPackage?.services || pkg.services || [],
              shopId: pkg.shopId || null,
              languageshopName: pkg.shopName || 'Unknown Shop',
              shopLocation: pkg.shopLocation || 'UnKnown Location',
              shopName: originalShop?.shopName || pkg.shopName || 'Unknown Shop',
              originalShopLocation: originalShop?.addressLine1 || pkg.shopLocation || 'Unknown Location',
              originalShopCity: originalShop?.city || '',
              originalShopCountry: originalShop?.country || '',
              purchaseDate: new Date().toISOString(),
              status: 'active',
              expiryDate: expiryDate.toISOString(), // Use calculated expiry date
              language: language,
              isTranslated: language !== 'en',
              purchaseSource: 'mobile-app',
              remainingUses: originalPackage?.maxUses || 1, // Track remaining uses if package has limits
              totalUses: originalPackage?.maxUses || 1 // Track total allowed uses
            };

            const packageRef = await addDoc(collection(db, 'package_purchases'), packageData);

            // Format package details for WhatsApp and other notifications
            const notificationMessage = `You've successfully purchased the 
          💈 Package : "${pkg.name}" 
          ⏱  Duration: ${pkg.duration}.
          📌 Address: ${pkg.shopLocation}.
          📍 Shop: ${pkg.shopName}
          💰 Price : ₹${pkg.price}.
          🗓 Expires: ${expiryDate.toLocaleDateString()}.
           Thank you!`;

            // Send WhatsApp notification if user has phone number
            if (user.phoneNumber) {
              try {
                await sendWhatsAppNotification(user.phoneNumber, notificationMessage);
              } catch (whatsappError) {
                console.error('WhatsApp notification failed:', whatsappError);
                // Don't fail the purchase if WhatsApp fails
              }
            }

            // Send regular notification
            await sendWithRetry('messages', {
              userId: user.uid,
              packageId: packageRef.id,
              content: notificationMessage,
              type: 'package_confirmation',
              metadata: {
                packageId: pkg.id.split('_')[0],
                shopId: pkg.shopId,
                expiryDate: expiryDate.toISOString()
              }
            });

            // Send owner notification if available
            if (pkg.shopId && originalShop?.ownerId) {
              await sendWithRetry('ownerDevices', {
                deviceId: originalShop.ownerId,
                title: 'New Package Purchase',
                body: `${user.name || 'A customer'} purchased ${originalPackage?.name || pkg.name} package`,
                data: {
                  packageId: packageRef.id,
                  type: 'new_package',
                  shopId: pkg.shopId,
                  expiryDate: expiryDate.toISOString()
                }
              });
            }

            setSuccessMessage(`${uiTexts.purchaseSuccess} "${pkg.name}"`);
            setShowSuccess(true);
            setTimeout(() => {
              setShowSuccess(false);
              setShowBookingModal(false);
            }, 3000);
          } catch (error: any) {
            console.error('Package purchase error:', error);
            setError(error.message);
            
            await sendWithRetry('adminDevices', {
              deviceId: 'xnUiOF3VQjaqfzsfPdugcLSso2V2',
              title: 'Package Purchase Error',
              body: `Failed to purchase package: ${error.message}`,
              data: {
                type: 'package_purchase_error',
                packageId: pkg?.id,
                userId: user?.uid
              }
            });
          } finally {
            setPackageBookingLoading(false);
          }
        }
      }
    ]
  );
};

const calculateExpiryDate = (duration: string): Date => {
  const expiryDate = new Date();
  
  if (!duration) return expiryDate; // Default to current date if no duration
  
  // Parse duration string (e.g., "30 days", "3 months", "1 year")
  const matches = duration.match(/(\d+)\s*(day|week|month|year|minute|hour|days|weeks|months|years|minutes|hours)/i);
  
  if (matches) {
    const amount = parseInt(matches[1]);
    const unit = matches[2].toLowerCase();
    
    switch (unit) {
      case 'minute':
      case 'minutes':
        expiryDate.setMinutes(expiryDate.getMinutes() + amount);
        break;
      case 'hour':
      case 'hours':
        expiryDate.setHours(expiryDate.getHours() + amount);
        break;
      case 'day':
      case 'days':
        expiryDate.setDate(expiryDate.getDate() + amount);
        break;
      case 'week':
      case 'weeks':
        expiryDate.setDate(expiryDate.getDate() + (amount * 7));
        break;
      case 'month':
      case 'months':
        expiryDate.setMonth(expiryDate.getMonth() + amount);
        break;
      case 'year':
      case 'years':
        expiryDate.setFullYear(expiryDate.getFullYear() + amount);
        break;
      default:
        // Default to 30 days if unit not recognized
        expiryDate.setDate(expiryDate.getDate() + 30);
    }
  } else {
    // Default to 30 days if duration format not recognized
    expiryDate.setDate(expiryDate.getDate() + 30);
  }
  
  return expiryDate;
};



 // ... [previous imports remain the same]
 // Twilio sandbox WhatsApp number or your own number
 // Helper function: decrement slots using Firestore transaction
const decrementSlots = async (slotKey, slotsToBook, shopCapacity) => {
  const slotRef = doc(db, "timeslots", slotKey);

  return await runTransaction(db, async (transaction) => {
    const slotDoc = await transaction.get(slotRef);

    let currentAvailableSlots = shopCapacity;
    if (slotDoc.exists()) {
      currentAvailableSlots = slotDoc.data().availableSlots;
    }

    if (slotsToBook > currentAvailableSlots) {
      throw new Error(`Only ${currentAvailableSlots} slots available. Please reduce family members or choose another slot.`);
    }

    const newAvailableSlots = currentAvailableSlots - slotsToBook;

    transaction.set(slotRef, {
      availableSlots: newAvailableSlots,
      lastUpdated: new Date().toISOString(),
    }, { merge: true });

    return newAvailableSlots;
  });
};

// Add this at the top of your component
const [notificationQueue, setNotificationQueue] = useState<any[]>([]);
const notificationTimer = useRef<any>(null);

// Then modify your notification sending logic
const queueNotification = (notification) => {
  setNotificationQueue(prev => [...prev, notification]);
  
  if (!notificationTimer.current) {
    notificationTimer.current = setTimeout(() => {
      processNotificationQueue();
      notificationTimer.current = null;
    }, 2000); // Batch every 2 seconds
  }
};

const processNotificationQueue = async () => {
  const queue = [...notificationQueue];
  setNotificationQueue([]);
  
  try {
    const batch = writeBatch(db);
    queue.forEach(notification => {
      const docRef = doc(collection(db, 'notifications'));
      batch.set(docRef, notification);
    });
    await batch.commit();
  } catch (error) {
    console.error('Failed to batch notifications:', error);
    // Optionally retry or handle error
  }
};


// ... [previous imports remain the same]

const handleSubmitBooking = async () => {
  try {
    // Validate inputs
    if (!selectedTimeSlot) {
      setError(uiTexts.selectTimeSlot);
      return;
    }

    if (chairSelectionApplies && selectedChairs.length !== (familySlotsCount || 1)) {
      toast.error('Chair Required', `Please select exactly ${familySlotsCount || 1} chair(s) to continue.`);
      return;
    }
    
    if (!paymentMethod) {
      toast.info('Please select a payment method');
      return;
    }

    setBookingLoading(true);
    setError('');

    if (!user) throw new Error(uiTexts.signInToBook);

    const slotKey = selectedTimeSlot.toISOString();
    const shopCapacity = shopCapacities[selectedService.shopId] || MAX_BARBERS;
    const slotsToBook = familySlotsCount || 1;

    // User details
    const userName = user.name || 'Anonymous';
    const userPhone = user.phoneNumber || '';

    // Add slight delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));

    const timeslotDocId = `${selectedService.shopId}_${slotKey}`;
    const timeslotRef = doc(db, 'timeslots', timeslotDocId);

    let bookingRef!: DocumentReference;
    let bookingId!: string;

    // Determine valid price to use
    const discountPrice = selectedService.discountedPrice;
    const basePrice = (typeof discountPrice === 'number' && discountPrice > 0)
      ? discountPrice
      : selectedService.price;
    
    let addOnsTotal = 0;
    const addOnData = addOnServices.map(addon => {
      const addOnDiscountPrice = addon.discountedPrice;
      const addOnBasePrice = (typeof addOnDiscountPrice === 'number' && addOnDiscountPrice > 0)
        ? addOnDiscountPrice
        : addon.price;
      addOnsTotal += addOnBasePrice;
      return {
        serviceId: addon.originalServiceId || addon.id,
        serviceName: addon.name,
        servicePrice: addOnBasePrice
      };
    });

    const totalPerPerson = basePrice + addOnsTotal;
    const subtotal = totalPerPerson * slotsToBook;
    const couponDiscount = computeCouponDiscount(subtotal);
    const totalPriceCalculated = subtotal - couponDiscount;

    await runTransaction(db, async (transaction) => {
      const timeslotDoc = await transaction.get(timeslotRef);
      const timeslotData = timeslotDoc.exists() ? timeslotDoc.data() : null;
      let availableSlots = timeslotData ? timeslotData.availableSlots : shopCapacity;
      const existingOccupiedChairs: number[] = timeslotData?.occupiedChairs || [];

      if (availableSlots < slotsToBook) {
        throw new Error(`Only ${availableSlots} slot(s) available. Please reduce family members or choose another time.`);
      }

      // Someone else may have claimed this exact chair between the customer
      // tapping it and this transaction committing — re-check atomically
      // rather than trusting the UI snapshot from a moment ago.
      if (chairSelectionApplies && selectedChairs.some(c => existingOccupiedChairs.includes(c))) {
        throw new Error('One or more selected chairs were just booked by someone else. Please choose different chairs.');
      }

      const newAvailableSlots = availableSlots - slotsToBook;

      // 4-digit check-in verification code — shown to the customer in
      // their appointment card, entered by the owner at arrival to
      // confirm this is genuinely the person who booked before marking
      // them checked in. Zero-padded so it's always exactly 4 digits
      // (Math.random() alone can produce a 3-digit number).
      const verificationCode = String(Math.floor(1000 + Math.random() * 9000));

      const bookingData = {
        userId: user.uid,
        userName: userName,
        userPhone: userPhone,
        serviceId: selectedService.originalServiceId || selectedService.id,
        serviceName: selectedService.name,
        serviceDescription: selectedService.description,
        serviceImageUrl: selectedService.imageUrl,
        servicePrice: selectedService.price,
        addOnServices: addOnData,
        barberName: selectedBarber ? selectedBarber.name : null,
        shopId: selectedService.shopId,
        shopName: selectedService.shopName,
        shopLocation: selectedService.shopLocation,
        dateTime: slotKey,
        status:'pending',
        paymentMethod: paymentMethod,
        paymentStatus: 'pending',
        couponCode: appliedCoupon?.code || null,
        couponDiscount: couponDiscount || 0,
        verificationCode,
        verified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      let newOccupiedChairs = existingOccupiedChairs;

      if (slotsToBook > 1) {
        // FAMILY BOOKING
        bookingRef = doc(collection(db, 'familybookings'));
        const barberNumbers: any[] = [];

        if (chairSelectionApplies && selectedChairs.length === slotsToBook) {
          barberNumbers.push(...selectedChairs);
          newOccupiedChairs = [...existingOccupiedChairs, ...selectedChairs];
        } else {
          for (let i = 0; i < slotsToBook; i++) {
            barberNumbers.push((shopCapacity - newAvailableSlots + i) % shopCapacity + 1);
          }
        }

        const familyMembers = barberNumbers.map((barberNum, index) => ({
          memberNumber: index + 1,
          barberNumber: barberNum,
          memberName: `${userName} ${index + 1}`,
          status: 'pending'
        }));

        transaction.set(bookingRef, {
          ...bookingData,
          familySize: slotsToBook,
          totalPrice: totalPriceCalculated,
          members: familyMembers
        });
      } else {
        // INDIVIDUAL BOOKING
        bookingRef = doc(collection(db, 'appointments'));
        const barberNumber = chairSelectionApplies && selectedChairs.length > 0
          ? selectedChairs[0]
          : (shopCapacity - newAvailableSlots) % shopCapacity + 1;

        if (chairSelectionApplies && selectedChairs.length > 0) {
          newOccupiedChairs = [...existingOccupiedChairs, ...selectedChairs];
        }

        transaction.set(bookingRef, {
          ...bookingData,
          barberNumber,
          totalPrice: totalPriceCalculated
        });
      }

      bookingId = bookingRef.id;

      // Update timeslot availability
      transaction.set(timeslotRef, {
        shopId: selectedService.shopId,
        serviceId: selectedService.originalServiceId || selectedService.id,
        totalSlots: shopCapacity,
        availableSlots: newAvailableSlots,
        occupiedChairs: newOccupiedChairs,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    });

    // Success: Send notifications
    const formattedTime = new Date(slotKey).toLocaleString();
    let notificationMessage;
    
    const addOnsText = addOnData.length > 0 ? `\n➕ Add-ons: ${addOnData.map(a => a.serviceName).join(', ')}` : '';

    if (slotsToBook > 1) {
      notificationMessage = `👨‍👩‍👧‍👦 Family Booking Confirmed (${slotsToBook} members)\n\n` +
        `📅 ${formattedTime}\n` +
        `✂️ ${selectedService.name}${addOnsText}\n` +
        `🏠 ${selectedService.shopName}\n` +
        `💰 ₹${subtotal}\n\n` +
        `Thank you for your booking!`;
    } else {
      notificationMessage = `✅ Booking Confirmed!\n\n` +
        `📅 ${formattedTime}\n` +
        `✂️ ${selectedService.name}${addOnsText}\n` +
        `🏠 ${selectedService.shopName}\n` +
        `💰 ₹${subtotal}\n\n` +
        `Thank you for your booking!`;
    }

    // Send WhatsApp notification if user has phone number
    if (user.phoneNumber) {
      try {
        await sendWhatsAppNotification(user.phoneNumber, notificationMessage);
      } catch (whatsappError) {
        console.error('WhatsApp notification failed:', whatsappError);
      }
    }

    // Add to notification queue for in-app notifications
    addToQueue({
      userId: user.uid,
      bookingId: bookingId,
      content: notificationMessage,
      type: slotsToBook > 1 ? 'family_booking_confirmation' : 'booking_confirmation',
      metadata: {
        serviceId: selectedService.originalServiceId || selectedService.id,
        shopId: selectedService.shopId,
        isFamilyBooking: slotsToBook > 1,
        familySize: slotsToBook > 1 ? slotsToBook : null,
        timestamp: new Date().toISOString()
      }
    });

    // Send owner notification if shop has owner
    const shop = allShops.find(s => s.id === selectedService.shopId);
    if (shop?.ownerId) {
      const ownerNotification = slotsToBook > 1
        ? `New family booking (${slotsToBook}) for ${selectedService.name}`
        : `New booking for ${selectedService.name}`;

      await sendWithRetry('ownerDevices', {
        deviceId: shop.ownerId,
        title: 'New Booking',
        body: ownerNotification,
        data: {
          bookingId,
          type: 'new_booking',
          shopId: selectedService.shopId,
          isFamilyBooking: slotsToBook > 1
        }
      });
    }

    // UI updates
    setShowBookingModal(false);
    setFamilySlotsCount(1);
    setShowFamilySelector(false);
    setSuccessMessage(
      slotsToBook > 1
        ? `Booked for ${slotsToBook} family members!`
        : 'Booking confirmed!'
    );
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);

    // If online payment, redirect to payment gateway
    if (paymentMethod === 'online') {
      // Implement your payment gateway integration here
      // For example:
      // initiatePaymentGateway(bookingId, totalPriceCalculated);
    }

    await generateAvailableTimeSlots();

  } catch (error: any) {
    console.error('Booking error:', error);

    if (isRateLimited(error)) {
      setError('Too many requests. Please wait a moment and try again.');
      toast.error('Booking error', 'Too many requests. Please wait and try again.');
      return;
    }

    setError(error.message);
    toast.error('Booking error', error.message);
  } finally {
    setBookingLoading(false);
  }
};

const handlePayment = (method) => {
  setPaymentMethod(method);
  
  // Optional: Visual feedback for selected payment method
  if (method === 'cash') {
    toast.info(
      'Pay at salon',
      'You have chosen to pay in cash at the salon. Please bring exact change if possible.'
    );
  } else {
    toast.info(
      'Online payment',
      'You will be redirected to our secure payment gateway to complete your booking.'
    );
    // In a real app, you would integrate with a payment gateway here
  }
};


  



  // const getButtonColor = () => gender?.toLowerCase() === 'man' ? 'royalblue' : '#FF007F';
  // const servicepriceColor = () => gender?.toLowerCase() === 'man' ? 'royalblue' : '#FF007F';


  const getButtonColor = () => {
  switch(gender?.toLowerCase()) {
    case 'man': return '#4169e1'; // Royal Blue
    case 'woman': return '#FF0582'; // Pink
    case 'unisex': return '#8a2be2'; // Purple (Blue Violet)
    default: return '#4169e1'; // Default to blue
  }
};

const servicepriceColor = () => {
  switch(gender?.toLowerCase()) {
    case 'man': return '#4169e1'; // Royal Blue
    case 'woman': return '#FF0582'; // Pink
    case 'unisex': return '#8a2be2'; // Purple (Blue Violet)
    default: return '#4169e1'; // Default to blue
  }
};

 const getDiscountedPrice = (service, offer) => {
  if (!offer || !offer.discount) return service.price;
  const discount = offer.discount;
  return Math.round(service.price - (service.price * discount / 100));
};

  const rawDisplayedServices = selectedCategory === 'kids'
    ? [
        ...(servicesByCategory['kids'] || []),
        ...(servicesByCategory['haircuts'] || []).filter(service => 
          service.description?.toLowerCase().includes('child') || 
          service.name?.toLowerCase().includes('child')
        )
      ]
    : selectedCategory === 'nearby'
      ? allNearbyServices.slice(0, displayLimit) // Only show limited number of nearby services
      : servicesByCategory[selectedCategory] || [];

  const displayedServices = rawDisplayedServices.filter((v: any, i: number, a: any[]) => a.findIndex(t => t.id === v.id) === i);

return (
  <View style={styles.container}>
  <Animated.View entering={FadeIn.duration(500)} style={[styles.header, { paddingTop: insets.top + 16 }]}>
    <Text style={styles.headerTitle}>{uiTexts.servicesTitle}</Text>
    <Text style={styles.headerSubtitle}>
      {gender ? 
        (gender.toLowerCase() === 'man' ? uiTexts.mensServices : 
         gender.toLowerCase() === 'woman' ? uiTexts.womensServices : 
         uiTexts.unisexsServices) 
        : uiTexts.servicesSubtitle
      }
    </Text>
  </Animated.View>

    <Animated.View entering={FadeIn.delay(200).duration(500)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
        {categories.map(category => (
          <TouchableOpacity
            key={category.id}
            style={[styles.categoryButton, selectedCategory === category.id && { backgroundColor: servicepriceColor() }]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Text style={[styles.categoryText, selectedCategory === category.id && styles.categoryTextActive]}>
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>

    {locationError && selectedCategory === 'nearby' && (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{locationError}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    )}

    <ScrollView 
      showsVerticalScrollIndicator={false} 
      style={styles.serviceList}
      onScroll={handleScroll}
      scrollEventThrottle={400}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
    >
      {loading && selectedCategory !== 'nearby' ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <>
          {displayedServices.map((item, index) => (
            <View key={`${selectedCategory}_${item.id}_${index}`}>
              <TouchableOpacity style={styles.serviceCard}>
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.serviceImage}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="memory-disk"
                />
                <View style={styles.serviceContent}>
                  <View style={styles.serviceHeader}>
                    <Text style={styles.serviceName}>
                      {language === 'en' ? item.name : item.languageName || item.name}
                    </Text>

                    <View style={styles.servicePrice}>
                      {item.discountOffer ? (
                        <>
                          <Text style={[styles.originalPrice, { textDecorationLine: 'line-through', marginRight: 5 }]}>
                            ₹{item.price}
                          </Text>
                          <Text style={[styles.discountedPrice, { color: 'green' }]}>
                            ₹{item.discountedPrice}
                          </Text>
                          {item.discountOffer.discount > 0 && (
                            <Text style={styles.discountBadge}>
                              {item.discountOffer.discount}% OFF
                            </Text>
                          )}
                        </>
                      ) : (
                        <Text style={[styles.servicePriceText, { color: servicepriceColor() }]}>
                          ₹{item.price}
                        </Text>
                      )}
                    </View>
                  </View>
                  
                  {item.shopName && (
                    <View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'center' }}>
                      <ShoppingBag size={14} color={Colors.textLight} style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 12, color: Colors.textLight }}>{item.shopName}</Text>
                    </View>
                  )}

                  {item.shopLocation && (
                    <View style={{ flexDirection: 'row', marginTop: 4, alignItems: 'center' }}>
                      <MapPin size={14} color={Colors.textLight} style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 12, color: Colors.textLight }}>{item.shopLocation}</Text>
                    </View>
                  )}

                  {selectedCategory === 'nearby' && item.distance && (
                    <Text style={{ fontSize: 12, color: Colors.textLight, marginLeft: 20 }}>
                      {item.distance.toFixed(1)} {uiTexts.kmAway}
                    </Text>
                  )}

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    <ClipboardList size={14} color={Colors.textLight} style={{ marginRight: 6, top: 1 }} />
                    <Text style={[styles.serviceDescription, { includeFontPadding: false }]}>
                      {language === 'en' ? item.description : item.languageDescription || item.description}
                    </Text>
                  </View>

                  {Array.isArray(item.services) && (
                    <View style={styles.packageServices}>
                      {item.services.map((service, idx) => (
                        <Text key={idx} style={styles.packageServiceItem}>• {service}</Text>
                      ))}
                    </View>
                  )}

                  <View style={styles.serviceFooter}>
                    <View style={styles.footerLeft}>
                      <View style={styles.serviceTime}>
                        <Clock size={14} color={Colors.textLight} />
                        <Text style={styles.serviceTimeText}>
                          {selectedCategory === 'packages' ? item.duration : `${item.duration} min`}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                      style={[styles.bookButton, { backgroundColor: getButtonColor() }]}
                      onPress={() => handleBook(item)}
                    >
                      <Text style={styles.bookButtonText}>{uiTexts.book}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          ))}
          
          {/* Show loading indicator when loading more */}
          {loadingMore && (
            <View style={styles.loadingMoreContainer}>
              <ActivityIndicator size="small" color={servicepriceColor()} />
              <Text style={styles.loadingMoreText}>{uiTexts.loadingMore}</Text>
            </View>
          )}
          
          {/* Show message when all services are loaded */}
          {selectedCategory === 'nearby' && displayLimit >= allNearbyServices.length && allNearbyServices.length > 0 && (
            <Text style={styles.allServicesLoadedText}>All services loaded</Text>
          )}
        </>
      )}
      <View style={styles.bottomPadding} />
    </ScrollView>

    {showBookingModal && selectedService && (
      <BookingWizardModal
        visible={showBookingModal}
        onClose={() => {
          setShowBookingModal(false);
          setShowFamilySelector(false);
          setFamilySlotsCount(1);
        }}
        shopName={selectedService.shopName}
        accentColor={servicepriceColor()}
        uiTexts={uiTexts}
        shopStaff={shopStaff}
        selectedBarber={selectedBarber}
        setSelectedBarber={setSelectedBarber}
        isPackage={selectedCategory === 'packages'}
        hasSelectedDateTime={selectedCategory === 'packages' ? true : (!!selectedTimeSlot && (!chairSelectionApplies || selectedChairs.length === (familySlotsCount || 1)))}
        onConfirm={() => selectedCategory === 'packages' ? handlePackageBooking(selectedService) : handleSubmitBooking()}
        isConfirmDisabled={bookingLoading || packageBookingLoading || (selectedCategory !== 'packages' && !selectedTimeSlot) || (chairSelectionApplies && !!selectedTimeSlot && selectedChairs.length !== (familySlotsCount || 1)) || !paymentMethod}
        confirmLoading={bookingLoading || packageBookingLoading}
        totalAmount={(() => {
          if (!selectedService) return 0;
          const discountPrice = selectedService.discountedPrice;
          const basePrice = (typeof discountPrice === 'number' && discountPrice > 0) ? discountPrice : selectedService.price;
          let addOnsTotal = 0;
          addOnServices.forEach(addon => {
            const addOnDiscountPrice = addon.discountedPrice;
            addOnsTotal += (typeof addOnDiscountPrice === 'number' && addOnDiscountPrice > 0) ? addOnDiscountPrice : addon.price;
          });
          return (basePrice + addOnsTotal) * (familySlotsCount || 1);
        })()}
        summaryFooterInfo={{
          method: paymentMethod === 'online' ? uiTexts.prepayOnline : paymentMethod === 'cash' ? uiTexts.payInCash : '',
          servicesText: `${1 + addOnServices.length} service${(1 + addOnServices.length) > 1 ? 's' : ''} · ${(() => {
            let totalMins = parseInt(selectedService?.duration || '0');
            addOnServices.forEach(a => totalMins += parseInt(a.duration || '0'));
            return totalMins + ' min';
          })()}`
        }}
        renderDateAndTime={() => {
          const next14Days = Array.from({ length: 14 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() + i);
            return d;
          });

          return (
            <>
              {selectedCategory !== 'packages' && (
                <View style={styles.dateTimeWrapper}>
                  {/* Date Selector */}
                  <View style={styles.dateSection}>
                    <View style={styles.dateSectionHeader}>
                      <Calendar size={18} color={servicepriceColor()} />
                      <Text style={styles.dateSectionTitle}>Select Date</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
                      {next14Days.map((date, idx) => {
                        const isSelected = bookingDate.toDateString() === date.toDateString();
                        const dayName = idx === 0 ? 'TODAY' : date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
                        const dayNumber = date.getDate();
                        const monthName = date.toLocaleDateString('en-US', { month: 'short' });
                        
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[
                              styles.dateCard,
                              isSelected && { borderColor: servicepriceColor(), backgroundColor: 'rgba(212, 175, 55, 0.05)' }
                            ]}
                            onPress={() => {
                              setBookingDate(date);
                              setSelectedTimeSlot(null);
                              if (chairSelectionApplies) setSelectedChairs([]);
                            }}
                          >
                            <Text style={[styles.dateCardDayName, isSelected && { color: servicepriceColor() }]}>{dayName}</Text>
                            <Text style={[styles.dateCardNumber, isSelected && { color: servicepriceColor() }]}>{dayNumber}</Text>
                            <Text style={[styles.dateCardMonth, isSelected && { color: servicepriceColor() }]}>{monthName}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* Time Selector */}
                  <View style={styles.timeSection}>
                    <View style={styles.dateSectionHeader}>
                      <Clock size={18} color={servicepriceColor()} />
                      <Text style={styles.dateSectionTitle}>Select Time</Text>
                    </View>
                    
                    {availableTimeSlots.length === 0 ? (
                      <Text style={styles.noSlotsText}>No time slots available for this date.</Text>
                    ) : (
                      <View style={styles.timeGrid}>
                        {availableTimeSlots.map((slot, idx) => {
                          const slotDate = new Date(slot);
                          const slotTimeStr = slotDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                          const isSelected = selectedTimeSlot?.getTime() === slotDate.getTime();
                          
                          return (
                            <TouchableOpacity
                              key={idx}
                              style={[
                                styles.timeSlotPill,
                                isSelected && { borderColor: servicepriceColor(), backgroundColor: 'rgba(212, 175, 55, 0.05)' }
                              ]}
                              onPress={() => {
                                setSelectedTimeSlot(slotDate);
                                if (chairSelectionApplies) setSelectedChairs([]);
                              }}
                            >
                              <Text style={[
                                styles.timeSlotText,
                                isSelected && { color: servicepriceColor() }
                              ]}>
                                {slotTimeStr}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    
                    {/* Legend */}
                    {availableTimeSlots.length > 0 && (
                      <View style={styles.legendRow}>
                        <View style={styles.legendItem}>
                          <View style={[styles.legendDot, { backgroundColor: servicepriceColor() }]} />
                          <Text style={styles.legendText}>Selected</Text>
                        </View>
                        <View style={styles.legendItem}>
                          <View style={[styles.legendDot, { backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: Colors.border }]} />
                          <Text style={styles.legendText}>Booked</Text>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Selected Slot Footer */}
                  {selectedTimeSlot && (
                    <View style={styles.selectedSlotFooter}>
                      <CheckCircle2 size={24} color={servicepriceColor()} style={{ marginRight: 16 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.selectedSlotFooterText, { color: servicepriceColor() }]}>
                          {selectedTimeSlot.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at {selectedTimeSlot.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </Text>
                        <Text style={styles.selectedSlotFooterSubtext}>Slot selected — confirm once booked</Text>
                      </View>
                    </View>
                  )}

                  {/* Family Booking Section (repositioned) */}
                  {selectedTimeSlot && selectedCategory !== 'hairTransplant' && occupiedChairs.length >= 0 && (() => {
                    const totalChairs = Number(shopCapacities[selectedService.shopId]) || MAX_BARBERS;
                    const maxAvailable = Math.max(0, totalChairs - occupiedChairs.length);
                    const actualMax = Math.min(MAX_FAMILY_SLOTS, maxAvailable);

                    if (maxAvailable <= 0) {
                       return (
                         <View style={{ marginTop: 24, marginHorizontal: 20 }}>
                           <Text style={{ color: Colors.error, fontFamily: 'Poppins-Medium' }}>
                             No chairs left for this slot. Please pick another time.
                           </Text>
                         </View>
                       );
                    }

                    return (
                      <View style={{ marginTop: 24, marginHorizontal: 20 }}>
                        <Text style={[styles.timeSlotsTitle, { color: servicepriceColor(), marginBottom: 8 }]}>
                          {uiTexts.familyBooking}
                        </Text>
                        <Text style={{ color: Colors.textLight, fontSize: 12, marginBottom: 12, fontFamily: 'Poppins-Regular' }}>
                          Select number of people (max {actualMax} for this time)
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
                          <TouchableOpacity
                            style={[
                              styles.familySelectorButton,
                              { borderColor: servicepriceColor(), width: 48, height: 48, marginBottom: 0, justifyContent: 'center', alignItems: 'center' },
                              familySlotsCount <= 1 && { opacity: 0.5 }
                            ]}
                            disabled={familySlotsCount <= 1}
                            onPress={() => setFamilySlotsCount(prev => Math.max(1, prev - 1))}
                          >
                            <Text style={{ color: servicepriceColor(), fontSize: 28, fontWeight: 'bold', lineHeight: 32 }}>-</Text>
                          </TouchableOpacity>
                          
                          <Text style={{ fontSize: 22, fontFamily: 'Poppins-SemiBold', color: Colors.text }}>
                            {familySlotsCount}
                          </Text>

                          <TouchableOpacity
                            style={[
                              styles.familySelectorButton,
                              { borderColor: servicepriceColor(), width: 48, height: 48, marginBottom: 0, justifyContent: 'center', alignItems: 'center' },
                              familySlotsCount >= actualMax && { opacity: 0.5 }
                            ]}
                            disabled={familySlotsCount >= actualMax}
                            onPress={() => setFamilySlotsCount(prev => Math.min(actualMax, prev + 1))}
                          >
                            <Text style={{ color: servicepriceColor(), fontSize: 24, fontWeight: 'bold', lineHeight: 28 }}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })()}

                  {chairSelectionApplies && selectedTimeSlot && (
                    <View style={[styles.chairSection, { marginTop: 24, marginHorizontal: 0 }]}>
                      <Text style={[styles.timeSlotsTitle, { color: servicepriceColor() }]}>
                        Choose your chair
                      </Text>
                      {loadingChairs ? (
                        <ActivityIndicator color={servicepriceColor()} style={{ marginVertical: 12 }} />
                      ) : (
                        <View style={styles.chairGrid}>
                          {Array.from(
                            { length: Number(shopCapacities[selectedService.shopId]) || MAX_BARBERS },
                            (_, i) => i + 1
                          ).map((chairNumber) => {
                            const isTaken = occupiedChairs.includes(chairNumber);
                            const isSelected = selectedChairs.includes(chairNumber);
                            return (
                              <TouchableOpacity
                                key={chairNumber}
                                style={[
                                  styles.familySelectorButton,
                                  { borderColor: servicepriceColor(), width: 56, height: 56, marginBottom: 0, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
                                  isSelected && { backgroundColor: servicepriceColor(), borderColor: servicepriceColor() },
                                  isTaken && styles.chairButtonTaken,
                                ]}
                                onPress={() => {
                                  if (isTaken) {
                                    toast.error('Chair unavailable', `Chair ${chairNumber} is already booked for this time. Please pick another.`);
                                    return;
                                  }
                                  if (selectedChairs.includes(chairNumber)) {
                                    setSelectedChairs(prev => prev.filter(c => c !== chairNumber));
                                  } else {
                                    if (selectedChairs.length < (familySlotsCount || 1)) {
                                      setSelectedChairs(prev => [...prev, chairNumber]);
                                    } else {
                                      toast.info('Limit Reached', `You can only select up to ${familySlotsCount || 1} chair(s).`);
                                    }
                                  }
                                }}
                                disabled={isTaken}
                                accessibilityLabel={isTaken ? `Chair ${chairNumber}, unavailable` : `Chair ${chairNumber}, available`}
                              >
                                <Armchair size={18} color={isTaken ? Colors.textLight : isSelected ? '#fff' : servicepriceColor()} />
                                <Text style={[
                                  styles.chairButtonText,
                                  isSelected && { color: '#fff' },
                                  isTaken && { color: Colors.textLight },
                                ]}>
                                  {chairNumber}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                      <Text style={styles.chairHint}>
                        {occupiedChairs.length > 0
                          ? 'Greyed-out chairs are already booked for this time slot.'
                          : 'All chairs are free at this time — pick any one.'}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </>
          );
        }}
        renderServices={() => {
          const shopAddOnServices = (() => {
            if (!selectedService || !selectedService.shopId) return [];
            let all = [];
            if (selectedCategory === 'nearby') {
              all = allNearbyServices;
            } else {
              Object.values(servicesByCategory).forEach((catServices: any) => {
                if (Array.isArray(catServices)) all.push(...catServices);
              });
            }
            const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values());
            return unique.filter((s: any) => s.shopId === selectedService.shopId && s.id !== selectedService.id);
          })();

          return (
          <>
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <View style={styles.serviceInfo}>
              <Text style={{color: Colors.textLight, fontSize: 12, marginBottom: 8, fontWeight: 'bold'}}>Main Service</Text>
              <Text style={styles.serviceInfoName}>{selectedService.name}</Text>
              
              {selectedService.shopName && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <ShoppingBag size={16} color={Colors.textLight} style={{ marginRight: 8 }} />
                  <Text style={styles.serviceInfoShop}>{selectedService.shopName}</Text>
                </View>
              )}
              
              {selectedService.shopLocation && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <MapPin size={16} color={Colors.textLight} style={{ marginRight: 8 }} />
                  <Text style={styles.serviceInfoLocation}>{selectedService.shopLocation}</Text>
                </View>
              )}
              
              <Text style={[styles.serviceInfoPrice, {color: servicepriceColor()}]}>
                {selectedService.discountOffer ? (
                  <>
                    <Text style={{textDecorationLine: 'line-through', color: Colors.textLight}}>
                      ₹{selectedService.price}
                    </Text>
                    <Text> ₹{selectedService.discountedPrice}</Text>
                  </>
                ) : (
                  <>₹{selectedService.price}</>
                )}
              </Text>
              
              <Text style={styles.serviceInfoTime}>
                {selectedService.duration} min
              </Text>
              
              {selectedService.description && (
                <Text style={styles.serviceInfoDescription}>
                  {selectedService.description}
                </Text>
              )}
              
              {selectedService.services && selectedService.services.length > 0 && (
                <View style={styles.packageServicesModal}>
                  <Text style={styles.packageServicesTitle}>{uiTexts.includes}</Text>
                  {selectedService.services.map((service, index) => (
                    <Text key={index} style={styles.packageServiceItemModal}>
                      • {service}
                    </Text>
                  ))}
                </View>
              )}
            </View>

            {shopAddOnServices.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text style={{ color: Colors.text, fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>Add-on Services</Text>
                <Text style={{ color: Colors.textLight, fontSize: 14, marginBottom: 16 }}>Select additional services you'd like to add to your booking.</Text>
                
                {shopAddOnServices.map((addon: any) => {
                  const isSelected = addOnServices.some(s => s.id === addon.id);
                  return (
                    <TouchableOpacity
                      key={addon.id}
                      style={[
                        styles.barberCard,
                        { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: Colors.cardBackground, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: isSelected ? servicepriceColor() : 'transparent' }
                      ]}
                      onPress={() => {
                        if (isSelected) {
                          setAddOnServices(prev => prev.filter(s => s.id !== addon.id));
                        } else {
                          setAddOnServices(prev => [...prev, addon]);
                        }
                      }}
                    >
                      <View style={{ marginRight: 16 }}>
                        {isSelected ? (
                          <CheckCircle2 size={24} color={servicepriceColor()} />
                        ) : (
                          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.textLight }} />
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.barberName, { marginBottom: 4, color: Colors.text, fontSize: 16, fontWeight: 'bold' }]}>{addon.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Clock size={14} color={Colors.textLight} style={{ marginRight: 4 }} />
                          <Text style={[styles.barberSpec, { color: Colors.textLight, fontSize: 14 }]}>{addon.duration} min</Text>
                        </View>
                      </View>
                      
                      <View>
                        <Text style={[{color: Colors.text, fontSize: 18, fontWeight: 'bold'}]}>
                          {addon.discountOffer ? (
                            <>
                              <Text style={{textDecorationLine: 'line-through', color: Colors.textLight, fontSize: 14, marginRight: 4}}>
                                ₹{addon.price}
                              </Text>
                              <Text> ₹{addon.discountedPrice}</Text>
                            </>
                          ) : (
                            <>₹{addon.price}</>
                          )}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
          );
        }}
        renderSummary={() => {
          const discountPrice = selectedService.discountedPrice;
          const basePrice = (typeof discountPrice === 'number' && discountPrice > 0)
            ? discountPrice
            : selectedService.price;
          
          let addOnsTotal = 0;
          addOnServices.forEach(addon => {
            const addOnDiscountPrice = addon.discountedPrice;
            const addOnBasePrice = (typeof addOnDiscountPrice === 'number' && addOnDiscountPrice > 0)
              ? addOnDiscountPrice
              : addon.price;
            addOnsTotal += addOnBasePrice;
          });

          const totalPerPerson = basePrice + addOnsTotal;
          const grandTotal = totalPerPerson * (familySlotsCount || 1);
          
          const shop = allShops.find(s => s.id === selectedService?.shopId);
          const formattedDate = bookingDate ? bookingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
          const formattedTime = selectedTimeSlot ? (() => {
            const h = selectedTimeSlot.getHours();
            const m = selectedTimeSlot.getMinutes().toString().padStart(2, '0');
            return `${(h % 12) || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
          })() : '';

          return (
          <>
            {/* Shop Info Card */}
            <View style={{ backgroundColor: Colors.cardBackground, borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
              {(shop?.image || shop?.coverImage || selectedService?.imageUrl) && (
                <Image 
                  source={{ uri: shop?.image || shop?.coverImage || selectedService?.imageUrl }} 
                  style={{ width: 60, height: 60, borderRadius: 12, marginRight: 16, backgroundColor: Colors.borderLight }} 
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text, fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>{shop?.shopName || 'Shop'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MapPin size={14} color={Colors.textLight} />
                  <Text style={{ color: Colors.textLight, fontSize: 14, marginLeft: 4 }}>{shop?.addressLine1 || shop?.shopLocation || 'Location'}</Text>
                </View>
              </View>
            </View>

            {/* Appointment Details Card */}
            <View style={{ backgroundColor: Colors.cardBackground, borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
              <View style={{ flexDirection: 'row', marginBottom: 16, alignItems: 'center' }}>
                <Calendar size={20} color={servicepriceColor()} style={{ marginRight: 12 }} />
                <Text style={{ color: Colors.textLight, fontSize: 16, width: 80 }}>Date</Text>
                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '500', flex: 1 }}>{formattedDate}</Text>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 16, alignItems: 'center' }}>
                <Clock size={20} color={servicepriceColor()} style={{ marginRight: 12 }} />
                <Text style={{ color: Colors.textLight, fontSize: 16, width: 80 }}>Time</Text>
                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '500', flex: 1 }}>{formattedTime} (~{selectedService.duration} min)</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <User size={20} color={servicepriceColor()} style={{ marginRight: 12 }} />
                <Text style={{ color: Colors.textLight, fontSize: 16, width: 80 }}>Barber</Text>
                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '500', flex: 1 }}>{selectedBarber ? selectedBarber.name : 'Any Available'}</Text>
              </View>
            </View>

            {/* Service Details Card */}
            <View style={{ backgroundColor: Colors.cardBackground, borderRadius: 16, marginBottom: 24, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
              <TouchableOpacity 
                style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                onPress={() => setIsSummaryServicesExpanded(!isSummaryServicesExpanded)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Armchair size={20} color={servicepriceColor()} style={{ marginRight: 12 }} />
                  <Text style={{ color: Colors.text, fontSize: 16, fontWeight: 'bold' }}>{1 + addOnServices.length} Service{(1 + addOnServices.length) > 1 ? 's' : ''}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: servicepriceColor(), fontSize: 18, fontWeight: 'bold', marginRight: 8 }}>₹{grandTotal}</Text>
                  <ChevronRight size={20} color={Colors.textLight} style={{ transform: [{ rotate: isSummaryServicesExpanded ? '-90deg' : '90deg' }] }} />
                </View>
              </TouchableOpacity>
              
              {isSummaryServicesExpanded && (
                <>
                  <View style={{ height: 1, backgroundColor: Colors.border }} />
                  
                  <View style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: Colors.text, fontSize: 16 }}>{selectedService.name}</Text>
                      <Text style={{ color: Colors.text, fontSize: 16 }}>₹{basePrice}</Text>
                    </View>
                    <Text style={{ color: Colors.textLight, fontSize: 14 }}>{selectedService.duration} min</Text>
                    
                    {addOnServices.map(addon => {
                      const addOnPrice = (typeof addon.discountedPrice === 'number' && addon.discountedPrice > 0) ? addon.discountedPrice : addon.price;
                      return (
                        <View key={addon.id} style={{ marginTop: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ color: Colors.text, fontSize: 16 }}>{addon.name}</Text>
                            <Text style={{ color: Colors.text, fontSize: 16 }}>₹{addOnPrice}</Text>
                          </View>
                          <Text style={{ color: Colors.textLight, fontSize: 14 }}>{addon.duration || 0} min</Text>
                        </View>
                      );
                    })}
                  </View>
                  
                  <View style={{ height: 1, backgroundColor: Colors.border }} />
                  
                  <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: Colors.text, fontSize: 18, fontWeight: 'bold' }}>Total</Text>
                    <Text style={{ color: servicepriceColor(), fontSize: 18, fontWeight: 'bold' }}>₹{totalPerPerson}</Text>
                  </View>

                  {familySlotsCount > 1 && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: Colors.textLight, fontSize: 14 }}>x {familySlotsCount} people</Text>
                      <Text style={{ color: servicepriceColor(), fontSize: 18, fontWeight: 'bold' }}>₹{grandTotal}</Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {selectedCategory !== 'packages' && (
              <>
                <Text style={{ color: Colors.text, fontSize: 18, fontWeight: 'bold', marginBottom: 16, fontFamily: 'serif' }}>Payment Method</Text>
                
                <View style={{ marginBottom: 16 }}>
                  {/* Online Payment */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: Colors.cardBackground, 
                      borderRadius: 16, marginBottom: 12, borderWidth: 1, 
                      borderColor: paymentMethod === 'online' ? servicepriceColor() : Colors.border,
                      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
                    }}
                    onPress={() => setPaymentMethod('online')}
                  >
                    <View style={{ width: 24, height: 24, marginRight: 12, justifyContent: 'center', alignItems: 'center' }}>
                      <CreditCard size={20} color={paymentMethod === 'online' ? servicepriceColor() : Colors.textLight} />
                    </View>
                    <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '500', flex: 1 }}>{uiTexts.prepayOnline}</Text>
                    <View style={{ 
                      width: 24, height: 24, borderRadius: 12, borderWidth: 2, 
                      borderColor: paymentMethod === 'online' ? servicepriceColor() : Colors.border,
                      justifyContent: 'center', alignItems: 'center'
                    }}>
                      {paymentMethod === 'online' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: servicepriceColor() }} />}
                    </View>
                  </TouchableOpacity>

                  {/* Cash Payment */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: Colors.cardBackground, 
                      borderRadius: 16, marginBottom: 16, borderWidth: 1, 
                      borderColor: paymentMethod === 'cash' ? servicepriceColor() : Colors.border,
                      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
                    }}
                    onPress={() => setPaymentMethod('cash')}
                  >
                    <View style={{ width: 24, height: 24, marginRight: 12, justifyContent: 'center', alignItems: 'center' }}>
                      <CreditCard size={20} color={paymentMethod === 'cash' ? servicepriceColor() : Colors.textLight} />
                    </View>
                    <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '500', flex: 1 }}>{uiTexts.payInCash}</Text>
                    <View style={{ 
                      width: 24, height: 24, borderRadius: 12, borderWidth: 2, 
                      borderColor: paymentMethod === 'cash' ? servicepriceColor() : Colors.border,
                      justifyContent: 'center', alignItems: 'center'
                    }}>
                      {paymentMethod === 'cash' && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: servicepriceColor() }} />}
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Optional Coupon Section below */}
                {selectedCategory !== 'packages' && (
                  <View style={styles.couponSection}>
                    <Text style={[styles.timeSlotsTitle, { color: servicepriceColor() }]}>
                      Have a coupon?
                    </Text>
                    <View style={styles.couponRow}>
                      <TextInput
                        style={styles.couponInput}
                        placeholder="Enter coupon code"
                        placeholderTextColor={Colors.textLight}
                        value={couponCode}
                        onChangeText={(t) => { setCouponCode(t); setCouponError(''); }}
                        autoCapitalize="characters"
                        editable={!appliedCoupon}
                      />
                      {appliedCoupon ? (
                        <TouchableOpacity
                          style={[styles.couponButton, { backgroundColor: Colors.error }]}
                          onPress={() => { setAppliedCoupon(null); setCouponCode(''); setCouponError(''); }}
                        >
                          <Text style={styles.couponButtonText}>Remove</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.couponButton, { backgroundColor: servicepriceColor() }]}
                          onPress={validateCoupon}
                          disabled={validatingCoupon || !couponCode.trim()}
                        >
                          {validatingCoupon ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.couponButtonText}>Apply</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                    {!!couponError && <Text style={styles.couponError}>{couponError}</Text>}
                    {!!appliedCoupon && (
                      <Text style={styles.couponSuccess}>
                        "{appliedCoupon.code}" applied — {appliedCoupon.type === 'percent' ? `${appliedCoupon.value}% off` : `₹${appliedCoupon.value} off`}
                      </Text>
                    )}
                  </View>
                )}
              </>
            )}
          </>
          );
        }}
      />
    )}


    {showSuccess && (
      <Modal
        transparent={true}
        visible={showSuccess}
        onRequestClose={() => setShowSuccess(false)}
        animationType="fade"
      >
        <View style={styles.successOverlay}>
          <Animated.View 
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(300)}
            style={styles.successContainer}
          >
            <Text style={styles.successText}>{successMessage}</Text>
          </Animated.View>
        </View>
      </Modal>
    )}
    
    <ShopDetailsModal
      visible={showShopDetailsModal}
      onClose={() => setShowShopDetailsModal(false)}
      shop={allShops.find(s => s.id === selectedService?.shopId)}
      services={[...allNearbyServices, ...Object.values(servicesByCategory).flat()].filter((s: any) => s && s.shopId === selectedService?.shopId).filter((v: any, i: number, a: any[]) => a.findIndex(t => t.id === v.id) === i)}
      selectedService={selectedService}
      onBook={handleOpenBookingFlow}
      accentColor={servicepriceColor()}
    />
  </View>
);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
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
  categoryList: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  categoryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: Colors.backgroundLight,
  },
  categoryText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  categoryTextActive: {
    color: 'white',
  },
  serviceList: {
    flex: 1,
    paddingHorizontal: 24,
  },
  serviceCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  discountBadge: {
    backgroundColor: '#4CAF50',
    color: 'white',
    fontSize: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 5,
    overflow: 'hidden',
    fontFamily: 'Poppins-SemiBold',
  },
  serviceImage: {
    width: '100%',
    height: 180,
  },
  serviceContent: { 
    padding: 12 
  },
  serviceHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',    
    marginBottom: 8, 
  },
  serviceName: { 
    fontSize: 16, 
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text, 
  },
  servicePrice: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  servicePriceText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
    marginLeft: 2,
  },
  serviceDescription: { 
    fontSize: 13, 
    color: Colors.textLight, 
    marginTop: 6 
  },
  serviceFooter: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginTop: 10 
  },
  footerLeft: {},
  serviceTime: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  serviceTimeText: { 
    fontSize: 12, 
    marginLeft: 4, 
    color: Colors.textLight 
  },
  bookButton: {
    backgroundColor: Colors.primary, 
    paddingHorizontal: 14, 
    paddingVertical: 6, 
    borderRadius: 6, 
    flexDirection: 'row', 
    alignItems: 'center',
  },
  bookButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: 'white',
    marginRight: 4,
  },
  packageServices: { 
    marginTop: 10 
  },
  packageServiceItem: { 
    fontSize: 13, 
    color: Colors.textLight, 
    marginVertical: 2 
  },
  bottomPadding: {
    height: 80,
  },
  // Full screen modal styles
  fullScreenModalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fullScreenModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  fullScreenCloseButton: {
    marginRight: 15,
  },
  fullScreenModalTitle: {
   fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
  },
  fullScreenModalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  fullScreenModalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  serviceInfo: {
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    marginTop: 10,
  },
  serviceInfoName: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 8,
  },
  serviceInfoShop: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  serviceInfoLocation: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  serviceInfoPrice: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
    marginBottom: 4,
    marginTop: 8,
  },
  serviceInfoTime: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  datePickerButtonText: {
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  confirmButton: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  waitlistIconContainer: {
    padding: 8,
    borderRadius: 12,
  },
  
  /* NEW DATE & TIME UI STYLES */
  dateTimeWrapper: {
    paddingHorizontal: 0,
    marginTop: 10,
  },
  dateSection: {
    marginBottom: 24,
  },
  dateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
    gap: 8,
  },
  dateSectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFF',
  },
  dateScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  dateCard: {
    width: 64,
    height: 84,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  dateCardDayName: {
    fontSize: 10,
    fontFamily: 'Poppins-Medium',
    color: Colors.textLight,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  dateCardNumber: {
    fontSize: 22,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    lineHeight: 26,
  },
  dateCardMonth: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  timeSection: {
    marginBottom: 24,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
  },
  timeSlotPill: {
    width: '22%',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noSlotsText: {
    color: Colors.textLight,
    fontFamily: 'Poppins-Regular',
    textAlign: 'center',
    paddingVertical: 20,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  selectedSlotFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
  },
  selectedSlotFooterText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 2,
  },
  selectedSlotFooterSubtext: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  termsCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  termsCheckmark: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },
  termsRowText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
  },
  termsLink: {
    fontFamily: 'Poppins-SemiBold',
    textDecorationLine: 'underline',
  },
  termsRequiredText: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.error,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  termsBodyText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    lineHeight: 22,
    padding: 4,
  },
  termsSoftLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 32,
    marginBottom: 8,
    marginTop: -4,
  },
  termsSoftLinkText: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textDecorationLine: 'underline',
  },
  termsExternalLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryLight,
    padding: 12,
    borderRadius: 10,
    marginHorizontal: 4,
    marginBottom: 16,
  },
  termsExternalLinkText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
  },
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
  },
  errorContainer: {
    backgroundColor: Colors.errorLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
  },
  retryButton: {
    marginTop: 8,
    padding: 8,
    backgroundColor: Colors.primary,
    borderRadius: 4,
    alignSelf: 'center',
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
  },
  timeSlotsContainer: {
    maxHeight: 200,
    marginVertical: 16,
  },
  chairSection: {
    marginTop: 20,
  },
  chairGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chairButton: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chairButtonTaken: {
    backgroundColor: Colors.backgroundLight,
    borderColor: Colors.border,
    opacity: 0.5,
  },
  chairButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  chairHint: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 10,
  },
  couponSection: {
    marginTop: 20,
  },
  couponRow: {
    flexDirection: 'row',
    gap: 10,
  },
  couponInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
  },
  couponButton: {
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponButtonText: {
    color: '#fff',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
  },
  couponError: {
    color: Colors.error,
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    marginTop: 8,
  },
  couponSuccess: {
    color: '#0a8f3c',
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    marginTop: 8,
  },
  timeSlotsTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 12,
  },
  timeSlotsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeSlot: {
    backgroundColor: Colors.backgroundLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  timeSlotText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  timeSlotTextSelected: {
    color: 'white',
  },
  timeSlotAvailability: {
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 2,
  },
  timeSlotAvailabilitySelected: {
    color: 'white',
  },
  successOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  successContainer: {
    backgroundColor: Colors.success,
    padding: 20,
    borderRadius: 10,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  successText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    textAlign: 'center',
  },
  packageServicesModal: {
    marginTop: 12,
  },
  packageServicesTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 4,
  },
  packageServiceItemModal: {
    fontSize: 13,
    color: Colors.textLight,
    marginLeft: 8,
    marginVertical: 2,
  },
  serviceInfoDescription: {
    fontSize: 14,
    color: Colors.textLight,
    marginTop: 8,
    fontFamily: 'Poppins-Regular',
  },
  originalPrice: {
    fontSize: 14,
    color: 'gray',
  },
  discountedPrice: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15
  },
  loadingMoreText: {
    marginLeft: 10,
    color: Colors.textLight
  },
  allServicesLoadedText: {
    textAlign: 'center',
    paddingVertical: 15,
    color: Colors.textLight,
    fontStyle: 'italic'
  },
  familyBookingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
  },
  familyBookingButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
  },
  familySelectorContainer: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.backgroundLight
  },
  familySelectorTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    color: Colors.text
  },
  familySelectorSubtitle: {
    fontSize: 12,
    color: Colors.textLight,
    marginBottom: 8
  },
  familySelectorButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  familySelectorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  familySelectorButtonText: {
    fontSize: 16,
    color: Colors.primary
  },
  familySelectorButtonTextSelected: {
    color: 'white'
  },
  paymentOptionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 15,
    paddingHorizontal: 10,
  },
  paymentOptionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 10,
  },
  paymentOptionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft:10,
  },
    datePickerContainer: {
    marginBottom: 16,
  },
  webDateInput: {
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.cardBackground,
    fontSize: 16,
    color: Colors.text,
  },


});

