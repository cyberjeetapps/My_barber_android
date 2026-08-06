import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Tag,
  Calendar,
  Bell,
  CheckCircle,
  Clock,
  Store,
  Scissors,
} from 'lucide-react-native';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth'; // Import auth context
import * as Notifications from 'expo-notifications';
import { Picker } from '@react-native-picker/picker';

// Configure notifications to appear outside the app
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface Offer {
  id: string;
  title: string;
  description: string;
  discount: number;
  validUntil: string;
  status: string;
  imageUrl: string;
  originalId?: string;
  shopId: string;
  serviceId: string;
}

interface Shop {
  id: string;
  shopName: string;
  ownerId: string;
}

interface Service {
  id: string;
  name: string;
}

export default function OffersManagement() {
  const router = useRouter();
  const { user } = useAuth(); // Get current user
  const [showAddForm, setShowAddForm] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOfferId, setEditOfferId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [newOffer, setNewOffer] = useState({
    title: '',
    description: '',
    discount: '',
    validUntil: '',
    imageUrl: '',
    shopId: '',
    serviceId: '',
  });

  useEffect(() => {
    const requestPermissions = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Warning', 'Push notifications permission not granted!');
      }
    };
    requestPermissions();

    if (user?.uid) {
      fetchShops();
    }
  }, [user]);

  useEffect(() => {
    if (shops.length > 0) {
      fetchServices();
      fetchOffers();
    }
  }, [shops]);

  const fetchShops = async () => {
    try {
      // Only fetch shops owned by the current user
      const q = query(collection(db, 'shops'), where('ownerId', '==', user?.uid));
      const shopsSnapshot = await getDocs(q);
      const shopsData = shopsSnapshot.docs.map((doc) => ({
        id: doc.id,
        shopName: doc.data().shopName,
        ownerId: doc.data().ownerId,
      })) as Shop[];
      setShops(shopsData);
    } catch (error) {
      console.error('Error fetching shops:', error);
      Alert.alert('Error', 'Failed to load shops');
    }
  };

  const fetchServices = async () => {
    try {
      const servicesQuery = query(collection(db, 'services'));
      const servicesSnapshot = await getDocs(servicesQuery);
      const servicesData = servicesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      })) as Service[];
      setServices(servicesData);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchOffers = async () => {
    setPageLoading(true);
    try {
      const shopIds = shops.map(shop => shop.id);
      
      if (shopIds.length === 0) {
        setOffers([]);
        return;
      }

      // Fetch approved offers for owner's shops
      const approvedQuery = query(
        collection(db, 'offers'),
        where('shopId', 'in', shopIds)
      );
      const approvedSnapshot = await getDocs(approvedQuery);
      const approvedOffers = approvedSnapshot.docs.map((doc) => ({
        id: doc.id,
        status: 'approved',
        ...(doc.data() as any),
      })) as Offer[];

      // Fetch pending offers for owner's shops
      const pendingQuery = query(
        collection(db, 'pending_offers'),
        where('shopId', 'in', shopIds)
      );
      const pendingSnapshot = await getDocs(pendingQuery);
      const pendingOffers = pendingSnapshot.docs.map((doc) => ({
        id: 'pending_' + doc.id,
        status: 'pending',
        ...(doc.data() as any),
      })) as Offer[];

      // Combine and filter out any pending offers that have been approved
      const allOffers = [...approvedOffers, ...pendingOffers];

      // Remove duplicates where a pending offer has been approved
      const uniqueOffers = allOffers.filter((offer, index, self) => {
        if (offer.status === 'approved') return true;
        // For pending offers, check if there's no approved version
        const isApproved = approvedOffers.some(
          (approved) => approved.originalId === offer.id.replace('pending_', '')
        );
        return !isApproved;
      });

      setOffers(uniqueOffers);
    } catch (error) {
      console.error('Error fetching offers:', error);
      Alert.alert('Error', 'Failed to load offers');
    } finally {
      setPageLoading(false);
    }
  };

  const sendAdminPushNotification = async (
    title: string,
    discount: string,
    isUpdate: boolean = false
  ) => {
    try {
      const adminDevicesQuery = query(collection(db, 'adminDevices'));
      const adminDevicesSnapshot = await getDocs(adminDevicesQuery);

      if (adminDevicesSnapshot.empty) {
        return;
      }

      const validTokens = adminDevicesSnapshot.docs
        .map((doc) => doc.data().expoPushToken)
        .filter((token) => token && token !== 'NOT_AVAILABLE');

      if (validTokens.length === 0) {
        return;
      }

      const notifications = validTokens.map((token) => ({
        to: token,
        sound: 'default',
        title: isUpdate
          ? 'Offer Update Pending Review'
          : 'New Offer Pending Review',
        body: `${title} - ${discount}% discount`,
        data: {
          type: 'offer_submission',
          action: 'review_offer',
          offerTitle: title,
        },
      }));

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notifications),
      });
    } catch (error) {
      console.error('Full error sending notification:', error);
    }
  };

  const handleAddOffer = async () => {
    if (
      !newOffer.title ||
      !newOffer.description ||
      !newOffer.discount ||
      !newOffer.validUntil ||
      !newOffer.shopId ||
      !newOffer.serviceId
    ) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const offerData = {
        title: newOffer.title,
        description: newOffer.description,
        discount: parseFloat(newOffer.discount),
        validUntil: newOffer.validUntil,
        imageUrl: newOffer.imageUrl,
        shopId: newOffer.shopId,
        serviceId: newOffer.serviceId,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };

      if (editOfferId) {
        if (editOfferId.startsWith('pending_')) {
          await updateDoc(
            doc(db, 'pending_offers', editOfferId.replace('pending_', '')),
            offerData
          );
        } else {
          // When editing an approved offer, create a pending update
          await addDoc(collection(db, 'pending_offers'), {
            originalId: editOfferId,
            ...offerData,
          });
        }
        Alert.alert('Success', 'Offer update submitted for approval');
        await sendAdminPushNotification(
          newOffer.title,
          newOffer.discount,
          true
        );
      } else {
        await addDoc(collection(db, 'pending_offers'), offerData);
        Alert.alert('Success', 'Offer added and submitted for approval');
        await sendAdminPushNotification(newOffer.title, newOffer.discount);
      }

      setNewOffer({
        title: '',
        description: '',
        discount: '',
        validUntil: '',
        imageUrl: '',
        shopId: '',
        serviceId: '',
      });
      setEditOfferId(null);
      setShowAddForm(false);
      fetchOffers();
    } catch (error) {
      console.error('Error adding offer:', error);
      Alert.alert('Error', 'Failed to add offer');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOffer = async (offerId: string, offerTitle: string) => {
    Alert.alert(
      'Delete Offer',
      `Are you sure you want to delete "${offerTitle}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              setLoading(true);
              let collectionName = 'offers';
              let actualId = offerId;

              if (offerId.startsWith('pending_')) {
                collectionName = 'pending_offers';
                actualId = offerId.replace('pending_', '');
              }

              await deleteDoc(doc(db, collectionName, actualId));
              await fetchOffers();
              Alert.alert('Success', 'Offer deleted successfully');
            } catch (error) {
              console.error('Error deleting offer:', error);
              Alert.alert('Error', 'Failed to delete offer');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleEditOffer = (offer: Offer) => {
    setEditOfferId(offer.id);
    setNewOffer({
      title: offer.title,
      description: offer.description,
      discount: offer.discount.toString(),
      validUntil: offer.validUntil,
      imageUrl: offer.imageUrl || '',
      shopId: offer.shopId,
      serviceId: offer.serviceId,
    });
    setShowAddForm(true);
  };

  const getShopName = (shopId: string) => {
    const shop = shops.find((s) => s.id === shopId);
    return shop ? shop.shopName : 'Unknown Shop';
  };

  const getServiceName = (serviceId: string) => {
    const service = services.find((s) => s.id === serviceId);
    return service ? service.name : 'Unknown Service';
  };

  // Show message if no shops are assigned to the owner
  if (shops.length === 0 && !pageLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Offers</Text>
          <TouchableOpacity
            onPress={() => setShowAddForm(true)}
            style={styles.addButton}
            disabled={true}
          >
            <Plus size={24} color={Colors.textLight} />
          </TouchableOpacity>
        </View>

        <View style={styles.noShopsContainer}>
          <Store size={64} color={Colors.textLight} />
          <Text style={styles.noShopsTitle}>No Shops Assigned</Text>
          <Text style={styles.noShopsMessage}>
            You need to have at least one shop assigned to manage offers.
          </Text>
          <Text style={styles.noShopsMessage}>
            Please contact admin to assign shops to your account.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {pageLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Offers</Text>
          <Text style={styles.headerSubtitle}>Manage special offers</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(true)}
        >
          <Plus size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {showAddForm && (
          <View style={styles.addForm}>
            <Text style={styles.formTitle}>
              {editOfferId ? 'Edit Offer' : 'Create New Offer'}
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Offer Title*</Text>
              <TextInput
                style={styles.input}
                value={newOffer.title}
                onChangeText={(text) =>
                  setNewOffer({ ...newOffer, title: text })
                }
                placeholder="Summer Special"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Description*</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={newOffer.description}
                onChangeText={(text) =>
                  setNewOffer({ ...newOffer, description: text })
                }
                placeholder="Describe your offer details"
                placeholderTextColor={Colors.textLight}
                multiline
              />
            </View>

            <View style={styles.row}>
              <View
                style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}
              >
                <Text style={styles.inputLabel}>Discount (%)*</Text>
                <TextInput
                  style={styles.input}
                  value={newOffer.discount}
                  onChangeText={(text) =>
                    setNewOffer({ ...newOffer, discount: text })
                  }
                  placeholder="20"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Valid Until*</Text>
                <TextInput
                  style={styles.input}
                  value={newOffer.validUntil}
                  onChangeText={(text) =>
                    setNewOffer({ ...newOffer, validUntil: text })
                  }
                  placeholder="2023-12-31"
                  placeholderTextColor={Colors.textLight}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Shop*</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={newOffer.shopId}
                  onValueChange={(itemValue) =>
                    setNewOffer({ ...newOffer, shopId: itemValue })
                  }
                  style={styles.picker}
                >
                  <Picker.Item label="Select a shop" value="" />
                  {shops.map((shop) => (
                    <Picker.Item
                      key={shop.id}
                      label={shop.shopName}
                      value={shop.id}
                    />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Service*</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={newOffer.serviceId}
                  onValueChange={(itemValue) =>
                    setNewOffer({ ...newOffer, serviceId: itemValue })
                  }
                  style={styles.picker}
                >
                  <Picker.Item label="Select a service" value="" />
                  {services.map((service) => (
                    <Picker.Item
                      key={service.id}
                      label={service.name}
                      value={service.id}
                    />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Image URL</Text>
              <TextInput
                style={styles.input}
                value={newOffer.imageUrl}
                onChangeText={(text) =>
                  setNewOffer({ ...newOffer, imageUrl: text })
                }
                placeholder="https://example.com/image.jpg"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.notificationBadge}>
              <Bell size={16} color={Colors.primary} />
              <Text style={styles.notificationText}>
                Notification will be sent automatically
              </Text>
            </View>

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setNewOffer({
                    title: '',
                    description: '',
                    discount: '',
                    validUntil: '',
                    imageUrl: '',
                    shopId: '',
                    serviceId: '',
                  });
                  setEditOfferId(null);
                  setShowAddForm(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.submitButton,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleAddOffer}
                disabled={loading}
              >
                <Text style={styles.submitButtonText}>
                  {loading ? 'Submitting...' : 'Submit Offer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {offers.map((offer) => (
          <View
            key={offer.id}
            style={[
              styles.offerCard,
              offer.status === 'pending' && styles.pendingOffer,
              offer.status === 'approved' && styles.approvedOffer,
            ]}
          >
            <View style={styles.offerHeader}>
              <View>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <View style={styles.statusContainer}>
                  {offer.status === 'pending' ? (
                    <View style={styles.pendingBadge}>
                      <Clock size={16} color={Colors.warning} />
                      <Text style={styles.pendingBadgeText}>
                        Pending Approval
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.approvedBadge}>
                      <CheckCircle size={16} color={Colors.success} />
                      <Text style={styles.approvedBadgeText}>Approved</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => handleEditOffer(offer)}
                >
                  <Edit2 size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButton, styles.deleteButton]}
                  onPress={() => handleDeleteOffer(offer.id, offer.title)}
                >
                  <Trash2 size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.offerDescription}>{offer.description}</Text>

            <View style={styles.offerDetails}>
              <View style={styles.detailItem}>
                <Store
                  size={18}
                  color={
                    offer.status === 'approved'
                      ? Colors.success
                      : Colors.warning
                  }
                />
                <Text style={styles.detailText}>
                  {getShopName(offer.shopId)}
                </Text>
              </View>

              <View style={styles.detailItem}>
                <Scissors
                  size={18}
                  color={
                    offer.status === 'approved'
                      ? Colors.success
                      : Colors.warning
                  }
                />
                <Text style={styles.detailText}>
                  {getServiceName(offer.serviceId)}
                </Text>
              </View>

              <View style={styles.detailItem}>
                <Tag
                  size={18}
                  color={
                    offer.status === 'approved'
                      ? Colors.success
                      : Colors.warning
                  }
                />
                <Text style={styles.detailText}>{offer.discount}% OFF</Text>
              </View>

              <View style={styles.detailItem}>
                <Calendar
                  size={18}
                  color={
                    offer.status === 'approved'
                      ? Colors.success
                      : Colors.warning
                  }
                />
                <Text style={styles.detailText}>
                  Valid until: {offer.validUntil}
                </Text>
              </View>
            </View>
          </View>
        ))}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerContainer: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.backgroundLight,
  },
  picker: {
    height: 50,
    width: '100%',
    color: Colors.text,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
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
  headerContent: {
    flex: 1,
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
    marginTop: 2,
  },
  addButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  addForm: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  formTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    backgroundColor: Colors.backgroundLight,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  notificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  notificationText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
    marginLeft: 8,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.backgroundLight,
    marginRight: 8,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    marginLeft: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  cancelButtonText: {
    color: Colors.text,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
  },
  submitButtonText: {
    color: 'white',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
  },
  offerCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  pendingOffer: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  approvedOffer: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  offerTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  statusContainer: {
    marginTop: 4,
  },
  pendingBadge: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.warning,
    backgroundColor: Colors.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
  },
  pendingBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.warning,
    marginLeft: 4,
  },
  approvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  approvedBadgeText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.success,
    marginLeft: 4,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  deleteButton: {
    backgroundColor: Colors.errorLight,
  },
  offerDescription: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginBottom: 16,
    lineHeight: 20,
  },
  offerDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginLeft: 6,
  },
  bottomSpacer: {
    height: 80,
  },
  // Add styles for no shops message
  title: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    flex: 1,
    textAlign: 'center',
  },
  noShopsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  noShopsTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  noShopsMessage: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
});