import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, Dimensions, FlatList, Animated as RNAnimated, Platform, Alert, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { 
  ArrowLeft, Heart, Share, Star, MapPin, 
  Clock, DoorOpen, Phone, Navigation, 
  ChevronRight, CheckCircle, Wifi, Car, CreditCard, Scissors, User,
  Thermometer, Home, Armchair, X, ExternalLink
} from 'lucide-react-native';
import Animated, { 
  FadeIn, 
  FadeInDown,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/config/firebase';

const { width } = Dimensions.get('window');

const formatTime12 = (timeString: string) => {
  if (!timeString || timeString === '-' || timeString === 'No slots' || timeString === 'Closed') return timeString;
  const [hour, min] = timeString.split(':');
  const h = parseInt(hour, 10);
  if (isNaN(h)) return timeString;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${min} ${ampm}`;
};

// Dummy data for placeholders
const DUMMY_REVIEWS = [
  { id: '1', name: 'Rahul Sharma', avatar: 'https://i.pravatar.cc/150?u=rahul', rating: 5, date: '2 days ago', text: 'Best haircut I have had in years. The attention to detail is amazing.', tags: ['Verified Visit', 'Haircut', 'Recommended'] },
  { id: '2', name: 'Vikram Singh', avatar: 'https://i.pravatar.cc/150?u=vikram', rating: 4, date: '1 week ago', text: 'Great ambiance and skilled barbers. A bit pricey but worth it.', tags: ['Beard', 'Verified Visit'] },
  { id: '3', name: 'Amit Kumar', avatar: 'https://i.pravatar.cc/150?u=amit', rating: 5, date: '2 weeks ago', text: 'Very professional. The premium service is definitely recommended.', tags: ['Hair + Beard', 'Recommended'] },
];

const DUMMY_STAFF = [
  { id: '1', name: 'Ravi Kumar', spec: 'Haircut & Beard', rating: 4.8, image: 'https://i.pravatar.cc/150?u=ravi' },
  { id: '2', name: 'Arjun Sharma', spec: 'Hair Color & Style', rating: 4.6, image: 'https://i.pravatar.cc/150?u=arjun' },
  { id: '3', name: 'Deepak Verma', spec: 'Classic Cuts', rating: 4.9, image: 'https://i.pravatar.cc/150?u=deepak' },
];

const DUMMY_GALLERY = [
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=500&q=80',
  'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500&q=80',
  'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=500&q=80',
  'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=500&q=80',
  'https://images.unsplash.com/photo-1620331311520-246422fd82f9?w=500&q=80'
];

interface ShopDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  shop: any; // shop data
  services: any[]; // services for this shop
  selectedService?: any;
  onBook: (service?: any, staff?: any[]) => void; // Trigger booking flow with staff
  accentColor?: string;
}

export default function ShopDetailsModal({ visible, onClose, shop, services, selectedService, onBook, accentColor = '#D4AF37' }: ShopDetailsModalProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('Service');
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [shopStaff, setShopStaff] = useState<any[]>([]);
  const [todayBookings, setTodayBookings] = useState<any[]>([]);

  // Tab indicator animation
  const tabPosition = useSharedValue(0);

  useEffect(() => {
    if (visible && shop?.id) {
      const fetchStaff = async () => {
        try {
          const q = query(collection(db, 'staff'), where('shopId', '==', shop.id), limit(50));
          const snap = await getDocs(q);
          const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setShopStaff(data);
        } catch (err) {
          console.error('Error fetching staff for shop', err);
        }
      };

      const fetchBookings = async () => {
        try {
          const bQuery = query(
            collection(db, 'appointments'),
            where('shopId', '==', shop.id)
          );
          const bSnap = await getDocs(bQuery);
          const data = bSnap.docs.map(doc => doc.data());
          
          const now = new Date();
          const todayIsoStr = now.toISOString().split('T')[0];
          const localTodayStr = now.toDateString();

          const todayData = data.filter(b => {
            if (b.status === 'cancelled' || b.status === 'declined') return false;
            
            if (b.dateTime) {
              return new Date(b.dateTime).toDateString() === localTodayStr;
            } else if (b.appointmentDate) {
              return b.appointmentDate === todayIsoStr;
            }
            return false;
          });
          
          setTodayBookings(todayData);
        } catch (err) {
          console.error('Error fetching bookings', err);
        }
      };

      fetchStaff();
      fetchBookings();
    }
  }, [visible, shop?.id]);

  useEffect(() => {
    if (activeTab === 'Service') tabPosition.value = withSpring(0);
    else if (activeTab === 'Reviews') tabPosition.value = withSpring(1);
    else if (activeTab === 'Info') tabPosition.value = withSpring(2);
  }, [activeTab]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabPosition.value * ((width - 40) / 3) }]
  }));

  if (!visible || !shop) return null;

  const shopName = shop.shopName || shop.name || 'Premium Barber';
  const shopLocation = shop.shopLocation || shop.addressLine1 || '123 Premium Street, City';
  const serviceImage = selectedService?.imageUrl;
  const shopImage = serviceImage || shop.imageUrl || DUMMY_GALLERY[0];
  const images = [shopImage, ...DUMMY_GALLERY.slice(1, 3)];

  const renderServiceTab = () => {
    const item = selectedService || services[0];
    if (!item) return null;

    return (
      <View style={styles.tabContent}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={styles.serviceDetailCard}>
            <View style={[styles.serviceIconContainer, { backgroundColor: 'rgba(212, 175, 55, 0.1)' }]}>
              <Scissors size={24} color={accentColor} />
            </View>
            <View style={styles.serviceDetailInfo}>
              <Text style={styles.serviceDetailName}>{item.name}</Text>
              <Text style={styles.serviceDetailSubtitle} numberOfLines={1}>
                {item.duration} min {item.description ? `• ${item.description}` : ''}
              </Text>
              <View style={styles.serviceDetailBottomRow}>
                <Star size={14} color={accentColor} fill={accentColor} />
                <Text style={styles.serviceDetailRating}>4.8</Text>
                
                {item.discountedPrice && item.discountedPrice !== item.price ? (
                  <>
                    <View style={styles.dotSeparator} />
                    <Text style={styles.serviceDetailOriginalPrice}>₹{item.price}</Text>
                  </>
                ) : null}
                
                <View style={styles.dotSeparator} />
                <Text style={styles.serviceDetailPrice}>
                  ₹{item.discountedPrice || item.price}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    );
  };

  const renderReviewsTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.reviewSummaryCard}>
        <View style={styles.reviewSummaryLeft}>
          <Text style={[styles.reviewRatingBig, { color: accentColor }]}>4.8</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} size={14} color={accentColor} fill={star <= 4 ? accentColor : 'transparent'} />
            ))}
          </View>
          <Text style={styles.reviewCountText}>142 reviews</Text>
        </View>
        <View style={styles.reviewSummaryRight}>
          {[5, 4, 3, 2, 1].map((rating, idx) => (
            <View key={rating} style={styles.progressRow}>
              <Text style={styles.progressText}>{rating}</Text>
              <Star size={10} color={accentColor} fill={accentColor} />
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: idx === 0 ? '80%' : idx === 1 ? '15%' : '0%', backgroundColor: accentColor }]} />
              </View>
              <Text style={styles.progressCount}>{idx === 0 ? 114 : idx === 1 ? 28 : 0}</Text>
            </View>
          ))}
        </View>
      </View>

      {DUMMY_REVIEWS.map((review, index) => (
        <Animated.View key={review.id} entering={FadeInDown.delay(index * 100).duration(400)} style={styles.reviewCard}>
          <View style={styles.reviewHeader}>
            <Image source={{ uri: review.avatar }} style={styles.reviewerAvatar} />
            <View style={styles.reviewerInfo}>
              <Text style={styles.reviewerName}>{review.name}</Text>
              <View style={styles.reviewStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} size={12} color={accentColor} fill={star <= review.rating ? accentColor : 'transparent'} />
                ))}
                <Text style={styles.reviewDate}>{review.date}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.reviewText}>{review.text}</Text>
          <View style={styles.reviewTagsRow}>
            {review.tags.map(tag => (
              <View key={tag} style={styles.reviewTag}>
                <Text style={styles.reviewTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ))}
    </View>
  );

  // Calculate next available slot
  const totalChairsForBooking = Number(shop?.capacity) || 10;
  let nextAvailableSlot = '';
  let occupiedChairs = 0;

  const now = new Date();
  let currentHour = now.getHours();
  let currentMin = now.getMinutes();
  
  if (currentMin > 30) {
    currentHour += 1;
    currentMin = 0;
  } else {
    currentMin = 30;
  }

  while (currentHour < 24) {
    const slotString = `${currentHour.toString().padStart(2, '0')}:${currentMin === 0 ? '00' : '30'}`;
    const bookingsInSlot = todayBookings.filter(b => {
      if (b.dateTime) {
        const d = new Date(b.dateTime);
        const h = d.getHours().toString().padStart(2, '0');
        const m = d.getMinutes() < 30 ? '00' : '30';
        return `${h}:${m}` === slotString;
      } else if (b.appointmentTime) {
        return b.appointmentTime === slotString;
      }
      return false;
    });
    
    if (bookingsInSlot.length < totalChairsForBooking) {
      nextAvailableSlot = slotString;
      occupiedChairs = bookingsInSlot.length;
      break;
    }
    
    currentMin += 30;
    if (currentMin >= 60) {
      currentHour += 1;
      currentMin = 0;
    }
  }

  if (!nextAvailableSlot) {
    nextAvailableSlot = 'No slots';
    occupiedChairs = totalChairsForBooking;
  }

  const renderInfoTab = () => {
    return (
      <View style={styles.tabContent}>
      {/* Working Hours */}
      <View style={styles.infoSection}>
        <View style={styles.infoHeaderRow}>
          <Clock size={16} color={accentColor} />
          <Text style={styles.infoSectionTitle}>Working Hours</Text>
        </View>
        {shop.timings ? (
          ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
            const timing = shop.timings[day];
            if (!timing) return null;
            const isClosed = timing.isClosed || (shop.holidays && shop.holidays.includes(day));
            return (
              <View key={day} style={styles.hoursRow}>
                <Text style={styles.hoursDay}>{day}</Text>
                <Text style={[styles.hoursTime, isClosed && { color: Colors.error }]}>
                  {isClosed ? 'Closed' : `${formatTime12(timing.open)} - ${formatTime12(timing.close)}`}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={{ color: Colors.textLight, marginTop: 10 }}>Timings not available</Text>
        )}
        {shop.holidays && shop.holidays.length > 0 && (
          <View style={{ marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2A2A2A', flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: Colors.textLight, fontSize: 14 }}>Weekly Off: </Text>
            <Text style={{ color: Colors.error, fontSize: 14 }}>{shop.holidays.join(', ')}</Text>
          </View>
        )}
      </View>

      {/* Staff */}
      <View style={styles.infoSection}>
        <View style={styles.infoHeaderRow}>
          <DoorOpen size={16} color={accentColor} />
          <Text style={styles.infoSectionTitle}>Our Staff</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.staffScroll}>
          {shopStaff.length > 0 ? (
            shopStaff.map(staff => (
              <View key={staff.id} style={styles.staffCard}>
                <View style={[styles.staffIconContainer, { backgroundColor: 'rgba(212, 175, 55, 0.1)' }]}>
                  <User size={24} color={accentColor} />
                </View>
                <View style={styles.staffInfo}>
                  <Text style={styles.staffName}>{staff.name}</Text>
                  <Text style={styles.staffSpec}>{staff.specialization || 'Staff'}</Text>
                  <View style={styles.staffRatingRow}>
                    <Star size={12} color={accentColor} fill={accentColor} />
                    <Text style={styles.staffRatingText}>{staff.ranking || 4.5}</Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <Text style={{ color: Colors.textLight, marginTop: 10, paddingLeft: 4 }}>No staff information available.</Text>
          )}
        </ScrollView>
      </View>

      {/* Chair Status */}
      <View style={styles.infoSection}>
        <View style={styles.infoHeaderRow}>
          <Armchair size={16} color={accentColor} />
          <Text style={styles.infoSectionTitle}>
            Available Chairs {nextAvailableSlot && nextAvailableSlot !== 'No slots' ? `at ${formatTime12(nextAvailableSlot)}` : ''}
          </Text>
        </View>
        <View style={styles.chairGridRow}>
          {Array.from({ length: totalChairsForBooking }).map((_, idx) => {
            const isOccupied = idx < occupiedChairs;
            return (
              <View key={idx} style={{ alignItems: 'center', justifyContent: 'center' }}>
                <Armchair size={36} color={isOccupied ? Colors.error : Colors.success} />
              </View>
            );
          })}
        </View>
      </View>

      {/* Gallery */}
      <View style={styles.infoSection}>
        <View style={styles.infoHeaderRow}>
          <Star size={16} color={accentColor} />
          <Text style={styles.infoSectionTitle}>Gallery</Text>
        </View>
        <View style={styles.galleryGrid}>
          {(shop.galleryImages?.length > 0 ? shop.galleryImages : [shop.imageUrl || DUMMY_GALLERY[0], ...DUMMY_GALLERY.slice(1, 3)]).map((img: string, idx: number) => (
            <Image key={idx} source={{ uri: img }} style={styles.galleryImage} />
          ))}
        </View>
      </View>
    </View>
  );
};

  // Dynamic calculations for Stats Cards
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayIndex = new Date().getDay();
  const todayName = dayNames[todayIndex];

  let todayOpen = '09:00';
  let todayClose = '21:00';
  let isOpenToday = true;

  if (shop?.timings && shop.timings[todayName]) {
    todayOpen = shop.timings[todayName].open;
    todayClose = shop.timings[todayName].close;
    isOpenToday = !shop.timings[todayName].isClosed;
  }
  
  if (shop?.holidays && shop.holidays.includes(todayName)) {
    isOpenToday = false;
  }
  
  const totalChairs = totalChairsForBooking;
  const availableChairs = Math.max(0, totalChairs - occupiedChairs);
  
  const hasHomeService = !!shop?.amenities?.homeService;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
          {/* Header Image Carousel */}
          <View style={styles.headerCarouselContainer}>
            <ScrollView 
              horizontal 
              pagingEnabled 
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                setActiveImageIndex(Math.round(e.nativeEvent.contentOffset.x / width));
              }}
            >
              {images.map((img, idx) => (
                <Image key={idx} source={{ uri: img }} style={styles.carouselImage} contentFit="cover" />
              ))}
            </ScrollView>
            
            <View style={[styles.headerActions, { top: insets.top + 10 }]}>
              <TouchableOpacity style={styles.iconButton} onPress={onClose}>
                <ArrowLeft size={20} color="#fff" />
              </TouchableOpacity>
              <View style={styles.headerActionsRight}>
                <TouchableOpacity style={styles.iconButton}>
                  <Heart size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.iconButton, { marginLeft: 10 }]}>
                  <Share size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.imageOverlayGradient} />
            
            <View style={styles.thumbnailContainer}>
              {images.map((img, idx) => (
                <View key={idx} style={[styles.thumbnailWrapper, activeImageIndex === idx && styles.thumbnailActive]}>
                  <Image source={{ uri: img }} style={styles.thumbnailImage} />
                </View>
              ))}
            </View>
          </View>

          {/* Shop Details */}
          <View style={styles.detailsContainer}>
            <View style={styles.badgeRow}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>Men</Text>
              </View>
              <CheckCircle size={16} color={accentColor} style={{ marginLeft: 8 }} />
              <View style={{ flex: 1 }} />
              <Star size={18} color={accentColor} fill={accentColor} />
              <Text style={styles.ratingText}> 4.8</Text>
            </View>
            
            <View style={styles.titleRow}>
              <Text style={styles.shopTitle}>{shopName}</Text>
              <Text style={styles.reviewCountLabel}>142 reviews</Text>
            </View>
            
            <View style={styles.addressRow}>
              <MapPin size={14} color={Colors.textLight} />
              <Text style={styles.addressText}>{shopLocation}</Text>
            </View>

            {/* Stats Cards */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{availableChairs}/{totalChairs}</Text>
                <Text style={styles.statLabel}>available</Text>
                <Text style={styles.statSubLabel}>CHAIRS</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{isOpenToday ? formatTime12(todayOpen) : '-'}</Text>
                <Text style={styles.statLabel}>{isOpenToday ? `- ${formatTime12(todayClose)}` : 'Closed'}</Text>
                <Text style={styles.statSubLabel}>HOURS</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: isOpenToday ? '#00C851' : Colors.error }]}>
                  {isOpenToday ? 'Open' : 'Closed'}
                </Text>
                <Text style={styles.statLabel}>today</Text>
                <Text style={styles.statSubLabel}>STATUS</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{hasHomeService ? 'Yes' : 'No'}</Text>
                <Text style={styles.statLabel}>service</Text>
                <Text style={styles.statSubLabel}>HOME</Text>
              </View>
            </View>

            {/* Amenities */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.amenitiesScroll}>
              {shop.amenities?.ac && (
                <View style={styles.amenityChip}>
                  <Thermometer size={14} color={Colors.textLight} />
                  <Text style={styles.amenityText}>AC</Text>
                </View>
              )}
              {shop.amenities?.parking && (
                <View style={styles.amenityChip}>
                  <Car size={14} color={Colors.textLight} />
                  <Text style={styles.amenityText}>Parking</Text>
                </View>
              )}
              {shop.amenities?.homeService && (
                <View style={styles.amenityChip}>
                  <Home size={14} color={Colors.textLight} />
                  <Text style={styles.amenityText}>Home Service</Text>
                </View>
              )}
              {!shop.amenities?.ac && !shop.amenities?.parking && !shop.amenities?.homeService && (
                <Text style={{ color: Colors.textLight, fontStyle: 'italic', marginLeft: 4 }}>No amenities listed</Text>
              )}
            </ScrollView>

            <Text style={styles.descriptionText}>
              {shop.about || "Premium salon and service"}
            </Text>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => {
                  const phoneNum =  shop.phone || shop.phoneNumber;
                  if (phoneNum) Linking.openURL(`tel:${phoneNum}`);
                }}
              >
                <Phone size={16} color={Colors.text} />
                <Text style={styles.actionButtonText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => {
                  if (shop.googleMapLink) {
                    Linking.openURL(shop.googleMapLink);
                  } else {
                    const query = encodeURIComponent(shop.addressLine1 || shop.shopName || '');
                    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
                  }
                }}
              >
                <Navigation size={16} color={Colors.text} />
                <Text style={styles.actionButtonText}>Directions</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabsContainer}>
            <View style={styles.tabsHeader}>
              {['Service', 'Reviews', 'Info'].map((tab, idx) => (
                <TouchableOpacity key={tab} style={styles.tabButton} onPress={() => setActiveTab(tab)}>
                  <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>{tab}</Text>
                </TouchableOpacity>
              ))}
              <Animated.View style={[styles.tabIndicator, indicatorStyle, { backgroundColor: accentColor }]} />
            </View>

            {activeTab === 'Service' && renderServiceTab()}
            {activeTab === 'Reviews' && renderReviewsTab()}
            {activeTab === 'Info' && renderInfoTab()}
          </View>

     
        </ScrollView>

        {/* Sticky Bottom Bar */}
        <View style={[styles.bottomBookingBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.bottomBarLeft}>
            <Text style={[styles.availableChairsText, { color: availableChairs > 0 ? '#00C851' : Colors.error }]}>
              {availableChairs} chair{availableChairs !== 1 ? 's' : ''} available
            </Text>
            <Text style={styles.startingPriceText}>
              {selectedService ? selectedService.name : 'Service'} from ₹{selectedService ? (selectedService.discountedPrice || selectedService.price) : 150}
            </Text>
          </View>
          <TouchableOpacity 
            style={[styles.bookNowButton, { backgroundColor: accentColor }]} 
            onPress={() => {
              onBook(selectedService, shopStaff);
            }}
          >
            <Text style={styles.bookNowButtonText}>Book Now</Text>
            <ChevronRight size={16} color="#000" />
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  headerCarouselContainer: {
    height: 300,
    width: '100%',
    position: 'relative',
  },
  carouselImage: {
    width,
    height: 300,
  },
  headerActions: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  headerActionsRight: {
    flexDirection: 'row',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageOverlayGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'rgba(0,0,0,0.4)', // Using simple overlay since expo-linear-gradient isn't imported here
  },
  thumbnailContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
  },
  thumbnailWrapper: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  thumbnailActive: {
    borderColor: '#fff',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  detailsContainer: {
    padding: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: 'rgba(65, 105, 225, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: {
    color: '#4169e1',
    fontSize: 12,
    fontWeight: 'bold',
  },
  ratingText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  shopTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'serif',
  },
  reviewCountLabel: {
    color: Colors.textLight,
    fontSize: 12,
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  addressText: {
    color: Colors.textLight,
    fontSize: 14,
    marginLeft: 6,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    width: (width - 40 - 24) / 4,
  },
  statValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  statLabel: {
    color: Colors.textLight,
    fontSize: 10,
  },
  statSubLabel: {
    color: Colors.textLight,
    fontSize: 9,
    opacity: 0.6,
  },
  amenitiesScroll: {
    marginBottom: 16,
  },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  amenityText: {
    color: Colors.textLight,
    fontSize: 12,
    marginLeft: 6,
  },
  descriptionText: {
    color: Colors.textLight,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.borderLight,
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  actionButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  tabsContainer: {
    paddingHorizontal: 20,
  },
  tabsHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.borderLight,
    borderRadius: 12,
    position: 'relative',
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    zIndex: 2,
  },
  tabButtonText: {
    color: Colors.textLight,
    fontSize: 14,
    fontWeight: '500',
  },
  tabButtonTextActive: {
    color: Colors.text,
    fontWeight: 'bold',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: '100%',
    width: '33.33%',
    borderRadius: 12,
    opacity: 0.2,
    zIndex: 1,
  },
  tabContent: {
    paddingBottom: 100,
  },
  serviceDetailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 16,
  },
  serviceIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  serviceDetailInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  serviceDetailName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  serviceDetailSubtitle: {
    color: Colors.textLight,
    fontSize: 14,
    marginBottom: 6,
  },
  serviceDetailBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceDetailRating: {
    color: Colors.text,
    fontSize: 14,
    marginLeft: 4,
    fontWeight: '600',
  },
  dotSeparator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.background,
    marginHorizontal: 8,
  },
  serviceDetailOriginalPrice: {
    color: Colors.textLight,
    fontSize: 14,
    textDecorationLine: 'line-through',
  },
  serviceDetailPrice: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Reviews
  reviewSummaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  reviewSummaryLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: '#2A2A2A',
  },
  reviewRatingBig: {
    fontSize: 48,
    fontWeight: 'bold',
    lineHeight: 52,
  },
  starsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  reviewCountText: {
    color: Colors.textLight,
    fontSize: 12,
  },
  reviewSummaryRight: {
    flex: 1,
    paddingLeft: 16,
    justifyContent: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressText: {
    color: Colors.textLight,
    fontSize: 10,
    width: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    marginHorizontal: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressCount: {
    color: Colors.textLight,
    fontSize: 10,
    width: 20,
    textAlign: 'right',
  },
  reviewCard: {
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  reviewerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  reviewerInfo: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  reviewerName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  reviewStars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewDate: {
    color: Colors.textLight,
    fontSize: 10,
    marginLeft: 8,
  },
  reviewText: {
    color: Colors.textLight,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  reviewTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  reviewTag: {
    backgroundColor: Colors.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  reviewTagText: {
    color: Colors.textLight,
    fontSize: 10,
  },
  
  // Info
  infoSection: {
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoSectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  hoursDay: {
    color: Colors.textLight,
    fontSize: 14,
  },
  hoursTime: {
    color: Colors.text,
    fontSize: 14,
  },
  staffScroll: {
    marginHorizontal: -4,
  },
  staffCard: {
    width: 100,
    marginHorizontal: 4,
    backgroundColor: Colors.borderLight,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  staffIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffInfo: {
    alignItems: 'center',
  },
  staffName: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  staffSpec: {
    color: Colors.textLight,
    fontSize: 10,
    marginBottom: 4,
    textAlign: 'center',
  },
  staffRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  staffRatingText: {
    color: Colors.text,
    fontSize: 10,
    marginLeft: 4,
  },
  chairGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chairStatusBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  chairOccupied: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },
  chairFree: {
    backgroundColor: 'rgba(0, 200, 81, 0.1)',
    borderColor: 'rgba(0, 200, 81, 0.3)',
  },
  chairStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  galleryImage: {
    width: '48%',
    height: 100,
    borderRadius: 8,
    marginBottom: 12,
  },
  policyText: {
    color: Colors.textLight,
    fontSize: 14,
    marginBottom: 8,
  },
  
  // Bottom Bar
  bottomBookingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  bottomBarLeft: {
    flex: 1,
  },
  availableChairsText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  startingPriceText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  bookNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  bookNowButtonText: {
    color: Colors.cardBackground,
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 4,
  },
});
