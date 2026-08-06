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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Clock,
  MapPin,
  Store,
  ChevronDown,
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
import { useRef } from 'react';
import { useAuth } from '@/context/auth';

const CustomDropdown = ({ label, value, options, onSelect }: any) => {
  const [modalVisible, setModalVisible] = useState(false);
  const selectedOption = options.find((opt: any) => opt.value === value);

  return (
    <>
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={() => setModalVisible(true)}
      >
        <Text style={selectedOption ? styles.dropdownButtonText : styles.dropdownButtonPlaceholder}>
          {selectedOption ? selectedOption.label : label}
        </Text>
        <ChevronDown size={20} color={Colors.textLight} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.dropdownModalContent}>
            {options.map((option: any) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.dropdownOption,
                  value === option.value && styles.dropdownOptionSelected,
                ]}
                onPress={() => {
                  onSelect(option.value);
                  setModalVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    value === option.value && styles.dropdownOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

interface Shop {
  id: string;
  shopName: string;
  ownerId: string;
}

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  shopIds?: string[];
  shopNames?: string[];
  ownerIds?: string[];
  gender: string | string[];
  category?: string;
  imageUrl: string;
  status: string;
  location?: string;
}

export default function ServicesManagement() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [editServiceId, setEditServiceId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [addFormY, setAddFormY] = useState(0);

  const [newService, setNewService] = useState({
    name: '',
    description: '',
    price: '',
    duration: '',
    gender: [] as string[],
    category: '',
    imageUrl: '',
  });

  useEffect(() => {
    if (user?.uid) {
      fetchShops();
    }
  }, [user]);

  useEffect(() => {
    if (shops.length > 0) {
      fetchServices();
    }
  }, [shops]);

  const fetchShops = async () => {
    setPageLoading(true);
    try {
      // Only fetch shops owned by the current user
      const q = query(collection(db, 'shops'), where('ownerId', '==', user?.uid));
      const querySnapshot = await getDocs(q);
      const shopsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        shopName: doc.data().shopName,
        ownerId: doc.data().ownerId,
      }));
      setShops(shopsData);
    } catch (error) {
      console.error('Error fetching shops:', error);
      Alert.alert('Error', 'Failed to load shops');
    } finally {
      setPageLoading(false);
    }
  };

  const toggleShopSelection = (shopId: string) => {
    setSelectedShopIds((prevIds) => {
      if (prevIds.includes(shopId)) {
        return prevIds.filter((id) => id !== shopId);
      } else {
        return [...prevIds, shopId];
      }
    });
  };

  const fetchServices = async () => {
    setPageLoading(true);
    try {
      const shopIds = shops.map(shop => shop.id);
      
      if (shopIds.length === 0) {
        setServices([]);
        return;
      }

      // Get approved services for owner's shops
      const approvedQuery = query(
        collection(db, 'services'),
        where('shopIds', 'array-contains-any', shopIds)
      );
      const approvedSnapshot = await getDocs(approvedQuery);
      const approvedServices = approvedSnapshot.docs.map((doc) => ({
        id: doc.id,
        status: 'approved',
        ...(doc.data() as any),
      }));

      // Get pending services for owner's shops
      const pendingQuery = query(
        collection(db, 'pending_services'),
        where('shopIds', 'array-contains-any', shopIds)
      );
      const pendingSnapshot = await getDocs(pendingQuery);
      const pendingServices = pendingSnapshot.docs.map((doc) => ({
        id: 'pending_' + doc.id,
        status: 'pending',
        ...(doc.data() as any),
      }));

      // Combine and process services
      const combinedServices = [...approvedServices, ...pendingServices].map(
        (service) => {
          const shopNames = service.shopIds
            ? service.shopIds.map(
                (id) =>
                  shops.find((shop) => shop.id === id)?.shopName || 'Unknown'
              )
            : [];
          return {
            ...service,
            shopNames,
          };
        }
      );

      setServices(combinedServices);
    } catch (error) {
      console.error('Error fetching services:', error);
      Alert.alert('Error', 'Failed to load services');
    } finally {
      setPageLoading(false);
    }
  };

  const handleAddService = async () => {
    if (
      !newService.name ||
      !newService.description ||
      !newService.price ||
      !newService.duration ||
      !newService.gender ||
      newService.gender.length === 0 ||
      selectedShopIds.length === 0
    ) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);

      const serviceData = {
        name: newService.name,
        description: newService.description,
        price: parseFloat(newService.price),
        duration: parseInt(newService.duration),
        shopIds: selectedShopIds,
        shopNames: selectedShopIds.map(
          (id) => shops.find((shop) => shop.id === id)?.shopName || 'Unknown'
        ),
        ownerIds: [user?.uid], // Set the current owner's ID
        gender: newService.gender,
        category: newService.category || '',
        imageUrl: newService.imageUrl,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };

      if (editServiceId) {
        if (editServiceId.startsWith('pending_')) {
          await updateDoc(
            doc(db, 'pending_services', editServiceId.replace('pending_', '')),
            {
              ...serviceData,
              updatedAt: new Date().toISOString(),
            }
          );
        } else {
          await addDoc(collection(db, 'pending_services'), {
            originalId: editServiceId,
            ...serviceData,
          });
        }
        Alert.alert('Success', 'Service update submitted for approval');
      } else {
        await addDoc(collection(db, 'pending_services'), serviceData);
        Alert.alert('Success', 'Service added and submitted for approval');
      }

      setNewService({
        name: '',
        description: '',
        price: '',
        duration: '',
        gender: '',
        category: '',
        imageUrl: '',
      });
      setSelectedShopIds([]);
      setEditServiceId(null);
      setShowAddForm(false);
      fetchServices();
    } catch (error) {
      console.error('Error adding service:', error);
      Alert.alert('Error', 'Failed to add service');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteService = async (serviceId: string, serviceName: string) => {
    Alert.alert(
      'Delete Service',
      `Are you sure you want to delete "${serviceName}"? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteDoc(doc(db, 'services', serviceId));
              await fetchServices();
              Alert.alert('Success', 'Service deleted successfully');
            } catch (error) {
              console.error('Error deleting service:', error);
              Alert.alert('Error', 'Failed to delete service. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleEditService = (service: Service) => {
    setEditServiceId(service.id);
    setNewService({
      name: service.name || '',
      description: service.description || '',
      price: service.price ? service.price.toString() : '',
      duration: service.duration ? service.duration.toString() : '',
      gender: Array.isArray(service.gender) ? service.gender : (service.gender ? [service.gender] : []),
      category: service.category || '',
      imageUrl: service.imageUrl || '',
    });
    setSelectedShopIds(service.shopIds || []);
    setShowAddForm(true);

    setTimeout(() => {
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: addFormY - 20, animated: true });
      }
    }, 300);
  };

  // Show message if no shops are assigned to the owner
  if (shops.length === 0 && !pageLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Services</Text>
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
            You need to have at least one shop assigned to manage services.
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
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Services</Text>
          <Text style={styles.headerSubtitle}>Manage services and pricing</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(true)}
          disabled={loading}
        >
          <Plus size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        ref={scrollViewRef}
      >
        {showAddForm && (
          <View
            style={styles.addForm}
            onLayout={(event) => {
              const { y } = event.nativeEvent.layout;
              setAddFormY(y);
            }}
          >
            <Text style={styles.formTitle}>
              {editServiceId ? 'Edit Service' : 'Add New Service'}
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Service Name</Text>
              <TextInput
                style={styles.input}
                value={newService.name}
                onChangeText={(text) =>
                  setNewService({ ...newService, name: text })
                }
                placeholder="Enter service name"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={styles.input}
                value={newService.description}
                onChangeText={(text) =>
                  setNewService({ ...newService, description: text })
                }
                placeholder="Enter service description"
                placeholderTextColor={Colors.textLight}
                multiline
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Price (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={newService.price}
                  onChangeText={(text) =>
                    setNewService({ ...newService, price: text })
                  }
                  placeholder="0.00"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Duration (min)</Text>
                <TextInput
                  style={styles.input}
                  value={newService.duration}
                  onChangeText={(text) =>
                    setNewService({ ...newService, duration: text })
                  }
                  placeholder="30"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Available at Shops *</Text>
              <View style={styles.shopsContainer}>
                {shops.map((shop) => (
                  <TouchableOpacity
                    key={shop.id}
                    style={[
                      styles.shopButton,
                      selectedShopIds.includes(shop.id) &&
                        styles.shopButtonSelected,
                    ]}
                    onPress={() => toggleShopSelection(shop.id)}
                  >
                    <Text
                      style={[
                        styles.shopButtonText,
                        selectedShopIds.includes(shop.id) &&
                          styles.shopButtonTextSelected,
                      ]}
                    >
                      {shop.shopName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Gender Category *</Text>
              <View style={styles.genderChipContainer}>
                {[
                  { label: 'Men', value: 'man' },
                  { label: 'Women', value: 'woman' },
                  { label: 'Unisex', value: 'unisex' },
                ].map((opt) => {
                  const isSelected = newService.gender.includes(opt.value);
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.genderChip, isSelected && styles.genderChipSelected]}
                      onPress={() => {
                        const current = [...newService.gender];
                        if (isSelected) {
                          setNewService({ ...newService, gender: current.filter(g => g !== opt.value) });
                        } else {
                          setNewService({ ...newService, gender: [...current, opt.value] });
                        }
                      }}
                    >
                      <Text style={[styles.genderChipText, isSelected && styles.genderChipTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Service Category</Text>
              <CustomDropdown
                label="Select Category"
                value={newService.category}
                options={[
                  { label: 'Haircut', value: 'haircuts' },
                  { label: 'Beard Trim / Shave', value: 'beards' },
                  { label: 'Hair Color', value: 'hairColor' },
                  { label: 'Facial & Skincare', value: 'facial' },
                  { label: 'Massage & Spa', value: 'massage' },
                  { label: 'Kids', value: 'kids' },
                  { label: 'Premium / VIP', value: 'premium' },
                  { label: 'Packages', value: 'packages' },
                  { label: 'Hair Transplant', value: 'hairTransplant' },
                  { label: 'Other', value: 'other' },
                ]}
                onSelect={(value: string) => setNewService({ ...newService, category: value })}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Image URL</Text>
              <TextInput
                style={styles.input}
                value={newService.imageUrl}
                onChangeText={(text) =>
                  setNewService({ ...newService, imageUrl: text })
                }
                placeholder="Paste image URL or upload later"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.formButton, styles.cancelButton]}
                onPress={() => {
                  setNewService({
                    name: '',
                    description: '',
                    price: '',
                    duration: '',
                    gender: '',
                    category: '',
                    imageUrl: '',
                  });
                  setSelectedShopIds([]);
                  setEditServiceId(null);
                  setShowAddForm(false);
                }}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.formButton,
                  styles.saveButton,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleAddService}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>
                  {loading
                    ? editServiceId
                      ? 'Updating...'
                      : 'Saving...'
                    : editServiceId
                    ? 'Update'
                    : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {services.map((service) => (
          <View
            key={service.id}
            style={[
              styles.serviceCard,
              service.status === 'pending'
                ? { borderColor: 'orange', borderWidth: 2 }
                : null,
            ]}
          >
            <View style={styles.serviceHeader}>
              <Text style={styles.serviceName}>
                {service.name}{' '}
                {service.status === 'pending' ? '(Pending Approval)' : ''}
              </Text>
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => handleEditService(service)}
                  disabled={loading || service.status === 'pending'}
                >
                  <Edit2
                    size={16}
                    color={
                      service.status === 'pending'
                        ? Colors.textLight
                        : Colors.primary
                    }
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButton, styles.deleteButton]}
                  onPress={() => handleDeleteService(service.id, service.name)}
                  disabled={loading || service.status === 'pending'}
                >
                  <Trash2
                    size={16}
                    color={
                      service.status === 'pending'
                        ? Colors.textLight
                        : Colors.error
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.serviceDescription}>{service.description}</Text>

            <View style={styles.serviceDetails}>
              <View style={styles.detailItem}>
                <Text style={[styles.detailText, { fontWeight: 'bold' }]}>
                  ₹
                </Text>
                <Text style={styles.detailText}>{service.price}</Text>
              </View>

              <View style={styles.detailItem}>
                <Clock size={16} color={Colors.primary} />
                <Text style={styles.detailText}>{service.duration} min</Text>
              </View>

              <View style={styles.locationdetailItem}>
                <Store color="black" size={24} />
                <View style={styles.shopNamesContainer}>
                  {service.shopNames && service.shopNames.length > 0 ? (
                    service.shopNames.map((shopName, index) => (
                      <Text key={index} style={styles.shopNameText}>
                        {shopName}
                        {index < (service.shopNames?.length ?? 0) - 1 ? ', ' : ''}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.shopNameText}>
                      Not assigned to any shops
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        ))}

        {services.length === 0 && !pageLoading && (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No services found</Text>
            <Text style={styles.noDataSubtext}>
              Add your first service to get started
            </Text>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: Colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  addForm: {
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
  formTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 16,
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
  categoryHintText: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 6,
    fontStyle: 'italic',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    backgroundColor: Colors.backgroundLight,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  formButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    backgroundColor: Colors.errorLight,
  },
  saveButton: {
    backgroundColor: Colors.primary,
  },
  cancelButtonText: {
    color: Colors.error,
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },
  serviceCard: {
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
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    width: '60%',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: Colors.errorLight,
  },
  serviceDescription: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginBottom: 12,
  },
  serviceDetails: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginLeft: 4,
  },
  bottomPadding: {
    height: 100,
  },
  locationdetailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    width: '100%',
  },
  shopNamesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginLeft: 4,
    flex: 1,
  },
  shopNameText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  shopsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  shopButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundLight,
  },
  shopButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  shopButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
  },
  shopButtonTextSelected: {
    color: 'white',
  },
  genderChipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genderChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundLight,
  },
  genderChipSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  genderChipText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  genderChipTextSelected: {
    color: Colors.primary,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.backgroundLight,
    paddingHorizontal: 12,
    height: 50,
  },
  dropdownButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
  },
  dropdownButtonPlaceholder: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownModalContent: {
    width: '80%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  dropdownOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  dropdownOptionSelected: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownOptionText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
  },
  dropdownOptionTextSelected: {
    color: Colors.primary,
    fontFamily: 'Poppins-Medium',
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
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.textLight,
    marginBottom: 8,
  },
  noDataSubtext: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
});