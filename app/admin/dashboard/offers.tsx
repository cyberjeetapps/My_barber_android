import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Check,
  X,
  Tag,
  Calendar,
  Store,
  Scissors,
} from 'lucide-react-native';
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  query,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import Colors from '@/constants/Colors';

interface Offer {
  id: string;
  title: string;
  description: string;
  discount: number;
  validUntil: string;
  imageUrl: string;
  shopId: string;
  serviceId: string;
}

interface Shop {
  id: string;
  shopName: string;
}

interface Service {
  id: string;
  name: string;
}

export default function AdminOffers() {
  const [pendingOffers, setPendingOffers] = useState<Offer[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      const shopsSnapshot = await getDocs(query(collection(db, 'shops')));
      const shopData = shopsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any),
      })) as Shop[];
      setShops(shopData);

      const servicesSnapshot = await getDocs(query(collection(db, 'services')));
      const serviceData = servicesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any),
      })) as Service[];
      setServices(serviceData);

      const offersSnapshot = await getDocs(collection(db, 'pending_offers'));
      const offers = offersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any),
      })) as Offer[];

      setPendingOffers(offers);
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'Failed to load pending offers');
    } finally {
      setLoading(false);
    }
  };

  const getShopName = (shopId: string) => {
    return shops.find(shop => shop.id === shopId)?.shopName || 'Unknown Shop';
  };

  const getServiceName = (serviceId: string) => {
    return services.find(service => service.id === serviceId)?.name || 'Unknown Service';
  };

  const handleApprove = async (offer: Offer) => {
    try {
      setLoading(true);

      const { id, ...offerData } = offer;
      const approvedOffer = {
        ...offerData,
        shopName: getShopName(offer.shopId),
        serviceName: getServiceName(offer.serviceId),
        status: 'approved',
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'offers', id), approvedOffer);
      await deleteDoc(doc(db, 'pending_offers', id));

      Alert.alert('Success', 'Offer approved successfully');
      fetchAllData();
    } catch (error) {
      console.error('Error approving offer:', error);
      Alert.alert('Error', 'Failed to approve offer');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async (id: string) => {
    Alert.alert(
      'Decline Offer',
      'Are you sure you want to decline this offer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteDoc(doc(db, 'pending_offers', id));
              Alert.alert('Declined', 'Offer has been declined');
              fetchAllData();
            } catch (error) {
              console.error('Error declining offer:', error);
              Alert.alert('Error', 'Failed to decline offer');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}

      {/* Removed Animated.View and replaced with regular View */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Pending Offers</Text>
          <Text style={styles.headerSubtitle}>Review and approve offers</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {pendingOffers.length === 0 && !loading ? (
          <Text style={styles.emptyText}>No pending offers</Text>
        ) : (
          pendingOffers.map((offer) => (
            // Removed Animated.View and replaced with regular View
            <View
              key={offer.id}
              style={styles.offerCard}
            >
              <Text style={styles.offerTitle}>{offer.title}</Text>
              <Text style={styles.offerDescription}>{offer.description}</Text>

              <View style={styles.offerDetails}>
                <View style={styles.detailItem}>
                  <Store size={18} color={Colors.primary} />
                  <Text style={styles.detailText}>{getShopName(offer.shopId)}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Scissors size={18} color={Colors.primary} />
                  <Text style={styles.detailText}>{getServiceName(offer.serviceId)}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Tag size={18} color={Colors.primary} />
                  <Text style={styles.detailText}>{offer.discount}% OFF</Text>
                </View>

                <View style={styles.detailItem}>
                  <Calendar size={18} color={Colors.primary} />
                  <Text style={styles.detailText}>Valid until: {offer.validUntil}</Text>
                </View>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.approveButton]}
                  onPress={() => handleApprove(offer)}
                >
                  <Check size={18} color="#fff" />
                  <Text style={styles.buttonText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.declineButton]}
                  onPress={() => handleDecline(offer.id)}
                >
                  <X size={18} color="#fff" />
                  <Text style={styles.buttonText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: Colors.background,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  offerCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  offerTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 6,
  },
  offerDescription: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginBottom: 12,
    lineHeight: 20,
  },
  offerDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 6,
  },
  detailText: {
    marginLeft: 6,
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  approveButton: {
    backgroundColor: Colors.success,
  },
  declineButton: {
    backgroundColor: Colors.error,
  },
  buttonText: {
    color: 'white',
    fontFamily: 'Poppins-SemiBold',
    marginLeft: 6,
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 40,
  },
});