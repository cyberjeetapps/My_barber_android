import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useLanguage } from '@/context/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';

interface Offer {
  id: string;
  title: string;
  description: string;
  discount: number;
  imageUrl: string;
  serviceName: string;
  shopName: string;
  validUntil: string;
  createdAt: string;
  status: string;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { language, translate, loading: langLoading } = useLanguage();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  // Translated UI texts
  const [uiTexts, setUiTexts] = useState({
    title: 'Notifications',
    noOffers: 'No current offers available',
    service: 'Service',
    at: 'At',
    validUntil: 'Valid until',
    close: 'Close',
    discount: 'Discount',
    viewAll: 'View All Offers',
    back: 'Back',
  });

  // Translate UI when language changes
  useEffect(() => {
    const translateUI = async () => {
      if (language === 'en') {
        setUiTexts({
          title: 'Notifications',
          noOffers: 'No current offers available',
          service: 'Service',
          at: 'At',
          validUntil: 'Valid until',
          close: 'Close',
          discount: 'Discount',
          viewAll: 'View All Offers',
          back: 'Back',
        });
      } else {
        const translated = await Promise.all([
          translate('Notifications'),
          translate('No current offers available'),
          translate('Service'),
          translate('At'),
          translate('Valid until'),
          translate('Close'),
          translate('Discount'),
          translate('View All Offers'),
          translate('Back'),
        ]);

        setUiTexts({
          title: translated[0],
          noOffers: translated[1],
          service: translated[2],
          at: translated[3],
          validUntil: translated[4],
          close: translated[5],
          discount: translated[6],
          viewAll: translated[7],
          back: translated[8],
        });
      }
    };

    translateUI();
  }, [language]);

  // Fetch approved offers from Firestore
  const fetchApprovedOffers = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'offers'),
        where('status', '==', 'approved')
      );

      const querySnapshot = await getDocs(q);
      const offersData: Offer[] = [];
      const now = new Date();

      for (const docSnap of querySnapshot.docs) {
        const offerData = docSnap.data();
        const validUntilDate = new Date(offerData.validUntil);

        if (validUntilDate < now) {
          // 🔥 Delete expired offer from Firestore
          await deleteDoc(doc(db, 'offers', docSnap.id));
          console.log(`Deleted expired offer: ${docSnap.id}`);
          continue;
        }

        let translatedOffer: Offer = {
          id: docSnap.id,
          title: offerData.title || '',
          description: offerData.description || '',
          discount: offerData.discount || 0,
          imageUrl: offerData.imageUrl || '',
          serviceName: offerData.serviceName || '',
          shopName: offerData.shopName || '',
          validUntil: offerData.validUntil || '',
          createdAt: offerData.createdAt || '',
          status: offerData.status || '',
        };

        if (language !== 'en') {
          translatedOffer = {
            ...translatedOffer,
            title: await translate(translatedOffer.title),
            description: await translate(translatedOffer.description),
            serviceName: await translate(translatedOffer.serviceName),
            shopName: await translate(translatedOffer.shopName),
          };
        }

        offersData.push(translatedOffer);
      }

      setOffers(offersData);
    } catch (error) {
      console.error('Error fetching or deleting offers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovedOffers();
  }, [language]);

  const handleBackPress = () => {
    router.back();
  };

  const handleViewAllOffers = () => {
    router.push('/offers');
  };

  if (loading || langLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Back button in top left */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleBackPress}
        disabled={loading || langLoading}
      >
        <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        <Text style={styles.backButtonText}>{uiTexts.back}</Text>
      </TouchableOpacity>

      <Text style={styles.header}>{uiTexts.title}</Text>

      {offers.length === 0 ? (
        <Text style={styles.noOffersText}>{uiTexts.noOffers}</Text>
      ) : (
        <>
          {offers.map((offer, index) => (
            <Animated.View
              key={offer.id}
              entering={FadeInUp.delay(200 + index * 100).duration(500)}
              style={styles.notificationCard}
            >
              <View style={styles.offerHeader}>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.discountBadge}>
                  {offer.discount}% {uiTexts.discount}
                </Text>
              </View>

              <Text style={styles.offerDescription}>{offer.description}</Text>

              <View style={styles.offerDetails}>
                <Text style={styles.detailText}>
                  {uiTexts.service}: {offer.serviceName}
                </Text>
                <Text style={styles.detailText}>
                  {uiTexts.at}: {offer.shopName}
                </Text>
                <Text style={styles.detailText}>
                  {uiTexts.validUntil}:{' '}
                  {new Date(offer.validUntil).toLocaleDateString()}
                </Text>
              </View>

              {offer.imageUrl ? (
                <Image
                  source={{ uri: offer.imageUrl }}
                  style={styles.offerImage}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={require('@/assets/images/10555.jpg')}
                  style={styles.offerImage}
                  resizeMode="cover"
                />
              )}
            </Animated.View>
          ))}

          <TouchableOpacity
            style={styles.viewAllButton}
            onPress={handleViewAllOffers}
          >
            <Text style={styles.viewAllButtonText}>{uiTexts.viewAll}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    marginBottom: 20,
    marginTop: 20,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 10,
    paddingVertical: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
    marginLeft: 8,
  },

  notificationCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: 'blue',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  offerTitle: {
    fontSize: 25,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
    flex: 1,
  },
  discountBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 25,
    fontFamily: 'Poppins-Medium',
    color: Colors.success,
  },
  offerDescription: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginBottom: 12,
    lineHeight: 20,
  },
  offerDetails: {
    marginBottom: 12,
  },
  detailText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginBottom: 4,
  },
  offerImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
  },
  noOffersText: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 40,
  },
  closeButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  closeButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: '#fff',
  },
  viewAllButton: {
    backgroundColor: Colors.primaryLight,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  viewAllButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
  },
});
