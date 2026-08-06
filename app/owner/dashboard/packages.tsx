import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
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
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Clock,
  Store,
} from 'lucide-react-native';
import { db } from '@/config/firebase';
import Colors from '@/constants/Colors';
import { useAuth } from '@/context/auth';

interface Shop {
  id: string;
  shopName: string;
  ownerId: string;
}

interface Package {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: string;
  services: string[];
  imageUrl: string;
  gender: string;
  shopIds?: string[];
  shopNames?: string[];
  status: string;
}

export default function PackagesManagement() {
  const router = useRouter();
  const { user } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    duration: '',
    services: '',
    imageUrl: '',
    gender: 'unisex',
  });

  useEffect(() => {
    if (user?.uid) {
      fetchShops();
    }
  }, [user]);

  useEffect(() => {
    if (shops.length > 0) {
      fetchPackages();
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

  const fetchPackages = async () => {
    setPageLoading(true);
    try {
      // Only fetch packages that belong to shops owned by the current user
      const shopIds = shops.map(shop => shop.id);
      
      if (shopIds.length === 0) {
        setPackages([]);
        return;
      }

      // Get approved packages for owner's shops
      const approvedQuery = query(
        collection(db, 'packages'),
        where('shopIds', 'array-contains-any', shopIds)
      );
      const approvedSnapshot = await getDocs(approvedQuery);
      const approvedPackages = approvedSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || '',
          description: data.description || '',
          price: data.price || 0,
          duration: data.duration || '',
          services: data.services || [],
          imageUrl: data.imageUrl || '',
          gender: data.gender || 'unisex',
          shopIds: data.shopIds || [],
          shopNames: data.shopIds
            ? data.shopIds.map(
                (id) =>
                  shops.find((shop) => shop.id === id)?.shopName || 'Unknown'
              )
            : [],
          status: 'approved',
        };
      });

      // Get pending packages for owner's shops
      const pendingQuery = query(
        collection(db, 'pending_packages'),
        where('shopIds', 'array-contains-any', shopIds)
      );
      const pendingSnapshot = await getDocs(pendingQuery);
      const pendingPackages = pendingSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: 'pending_' + doc.id,
          name: data.name || '',
          description: data.description || '',
          price: data.price || 0,
          duration: data.duration || '',
          services: data.services || [],
          imageUrl: data.imageUrl || '',
          gender: data.gender || 'unisex',
          shopIds: data.shopIds || [],
          shopNames: data.shopIds
            ? data.shopIds.map(
                (id) =>
                  shops.find((shop) => shop.id === id)?.shopName || 'Unknown'
              )
            : [],
          status: 'pending',
        };
      });

      // Combine approved and pending packages
      setPackages([...approvedPackages, ...pendingPackages]);
    } catch (error) {
      console.error('Error loading packages:', error);
      Alert.alert('Error', 'Failed to load packages.');
    } finally {
      setPageLoading(false);
    }
  };

  const handleSave = async () => {
    const { name, description, price, duration, services } = form;
    if (
      !name ||
      !description ||
      !price ||
      !duration ||
      !services ||
      selectedShopIds.length === 0
    ) {
      return Alert.alert(
        'Error',
        'Please fill all required fields and select at least one shop.'
      );
    }

    const data = {
      ...form,
      services: services.split(',').map((s) => s.trim()),
      price: parseFloat(price),
      duration,
      shopIds: selectedShopIds,
      shopNames: selectedShopIds.map(
        (id) => shops.find((shop) => shop.id === id)?.shopName || 'Unknown'
      ),
      ownerIds: [user?.uid], // Set the current owner's ID
      updatedAt: new Date().toISOString(),
    };

    try {
      setLoading(true);
      if (editId) {
        if (editId.startsWith('pending_')) {
          await updateDoc(
            doc(db, 'pending_packages', editId.replace('pending_', '')),
            {
              ...data,
              status: 'pending',
            }
          );
        } else {
          await addDoc(collection(db, 'pending_packages'), {
            originalId: editId,
            ...data,
            createdAt: new Date().toISOString(),
            status: 'pending',
          });
        }
        Alert.alert('Updated', 'Package update submitted for approval.');
      } else {
        await addDoc(collection(db, 'pending_packages'), {
          ...data,
          createdAt: new Date().toISOString(),
          status: 'pending',
        });
        Alert.alert('Added', 'Package added and submitted for approval.');
      }
      resetForm();
      fetchPackages();
    } catch (e) {
      console.error('Save failed:', e);
      Alert.alert('Error', 'Could not save package.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (pkg: Package) => {
    setForm({
      name: pkg.name,
      description: pkg.description,
      price: pkg.price.toString(),
      duration: pkg.duration,
      services: pkg.services.join(', '),
      imageUrl: pkg.imageUrl || '',
      gender: pkg.gender || 'unisex',
    });
    setSelectedShopIds(pkg.shopIds || []);
    setEditId(pkg.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string, name: string) => {
    Alert.alert(
      'Delete',
      `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'packages', id));
              fetchPackages();
              Alert.alert('Deleted', 'Package removed.');
            } catch (e) {
              console.error('Delete error:', e);
              Alert.alert('Error', 'Could not delete package.');
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      price: '',
      duration: '',
      services: '',
      imageUrl: '',
      gender: 'unisex',
    });
    setSelectedShopIds([]);
    setEditId(null);
    setShowForm(false);
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
          <Text style={styles.headerTitle}>Packages</Text>
          <TouchableOpacity
            onPress={() => setShowForm(true)}
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
            You need to have at least one shop assigned to manage packages.
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
          <Text style={styles.headerTitle}>Packages</Text>
          <Text style={styles.headerSubtitle}>Manage packages and pricing</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowForm(true)}
          style={styles.addButton}
          disabled={loading}
        >
          <Plus size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {showForm && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>
              {editId ? 'Edit Package' : 'Add Package'}
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Package Name</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(text) => setForm({ ...form, name: text })}
                placeholder="Enter package name"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={styles.input}
                value={form.description}
                onChangeText={(text) => setForm({ ...form, description: text })}
                placeholder="Enter package description"
                placeholderTextColor={Colors.textLight}
                multiline
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Price (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={form.price}
                  onChangeText={(text) => setForm({ ...form, price: text })}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Duration</Text>
                <TextInput
                  style={styles.input}
                  value={form.duration}
                  onChangeText={(text) => setForm({ ...form, duration: text })}
                  placeholder="e.g., 1 month, 3 sessions"
                  placeholderTextColor={Colors.textLight}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Services (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={form.services}
                onChangeText={(text) => setForm({ ...form, services: text })}
                placeholder="Haircut, Shave, Massage"
                placeholderTextColor={Colors.textLight}
                multiline
              />
            </View>

            {/* Shop Selection */}
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

            {/* Gender Selection */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Gender Category *</Text>
              <View style={styles.genderOptions}>
                {['unisex', 'man', 'woman'].map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.genderOption,
                      form.gender === option && styles.genderOptionSelected,
                    ]}
                    onPress={() => setForm({ ...form, gender: option })}
                  >
                    <Text
                      style={[
                        styles.genderOptionText,
                        form.gender === option &&
                          styles.genderOptionTextSelected,
                      ]}
                    >
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Image URL</Text>
              <TextInput
                style={styles.input}
                value={form.imageUrl}
                onChangeText={(text) => setForm({ ...form, imageUrl: text })}
                placeholder="Paste image URL or upload later"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.formButton, styles.cancelButton]}
                onPress={resetForm}
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
                onPress={handleSave}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>
                  {loading
                    ? editId
                      ? 'Updating...'
                      : 'Saving...'
                    : editId
                    ? 'Update'
                    : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {packages.map((pkg) => (
          <View
            key={pkg.id}
            style={[
              styles.card,
              pkg.status === 'pending'
                ? { borderColor: 'orange', borderWidth: 2 }
                : null,
            ]}
          >
            <View style={styles.serviceHeader}>
              <Text style={styles.packageName}>
                {pkg.name}{' '}
                {pkg.status === 'pending' ? '(Pending Approval)' : ''}
              </Text>
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  onPress={() => handleEdit(pkg)}
                  style={styles.iconButton}
                  disabled={loading || pkg.status === 'pending'}
                >
                  <Edit2
                    size={16}
                    color={
                      pkg.status === 'pending'
                        ? Colors.textLight
                        : Colors.primary
                    }
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(pkg.id, pkg.name)}
                  style={[styles.iconButton, styles.deleteButton]}
                  disabled={loading || pkg.status === 'pending'}
                >
                  <Trash2
                    size={16}
                    color={
                      pkg.status === 'pending' ? Colors.textLight : Colors.error
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.description}>{pkg.description}</Text>
            <Text style={styles.serviceList}>
              Includes: {pkg.services.join(', ')}
            </Text>

            {/* Shop Names */}
            <View style={styles.locationdetailItem}>
              <Store color="black" size={24} />
              <View style={styles.shopNamesContainer}>
                {pkg.shopNames && pkg.shopNames.length > 0 ? (
                  pkg.shopNames.map((shopName, index) => (
                    <Text key={index} style={styles.shopNameText}>
                      {shopName}
                      {index < (pkg.shopNames?.length ?? 0) - 1 ? ', ' : ''}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.shopNameText}>
                    Not assigned to any shops
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.serviceDetails}>
              <View style={styles.detailItem}>
                <Text style={[styles.detailText, { fontWeight: 'bold' }]}>
                  ₹
                </Text>
                <Text style={styles.detailText}>{pkg.price}</Text>
              </View>

              <View style={styles.detailItem}>
                <Clock size={16} color={Colors.primary} />
                <Text style={styles.detailText}>{pkg.duration}</Text>
              </View>

              <View style={styles.detailItem}>
                <Text style={styles.detailText}>• {pkg.gender || 'unisex'}</Text>
              </View>
            </View>
          </View>
        ))}

        {packages.length === 0 && !pageLoading && (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No packages found</Text>
            <Text style={styles.noDataSubtext}>
              Add your first package to get started
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
    paddingTop: 60,
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
  scroll: {
    paddingHorizontal: 24,
  },
  form: {
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
  card: {
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
  packageName: {
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
  description: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginBottom: 12,
  },
  serviceList: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
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
  locationdetailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    marginBottom: 12,
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
  genderOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  genderOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.backgroundLight,
    alignItems: 'center',
  },
  genderOptionSelected: {
    backgroundColor: Colors.primary,
  },
  genderOptionText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  genderOptionTextSelected: {
    color: 'white',
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