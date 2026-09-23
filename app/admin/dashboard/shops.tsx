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
  Minus,
  Armchair,
  Edit2,
  Trash2,
  Clock,
  MapPin,
  Mail,
  Phone,
  User,
  Calendar,
  Award,
  Type,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react-native';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export default function ShopsManagement() {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);

  interface Shop {
    id: string;
    shopName: string;
    ownerId: string;
    ownerName?: string;
    shopEmail: string;
    phoneNumber: string;
    businessType: string;
    gender: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateRegion: string;
    postalCode: string;
    country: string;
    googleMapLink?: string;
    openingHours: string;
    closedDays: string[];
    latitude: number;
    longitude: number;
    capacity?: number;
  }

  interface Owner {
    id: string;
    name: string;
  }

  const [shops, setShops] = useState<Shop[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [editShopId, setEditShopId] = useState<string | null>(null);
  const [previousOwnerId, setPreviousOwnerId] = useState<string | null>(null);
  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
  const [geocodingError, setGeocodingError] = useState<string | null>(null);
  const [newShop, setNewShop] = useState<Omit<Shop, 'id'>>({
    shopName: '',
    ownerId: '',
    shopEmail: '',
    phoneNumber: '',
    businessType: '',
    gender: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateRegion: '',
    postalCode: '',
    country: '',
    googleMapLink: '',
    openingHours: '',
    closedDays: [],
    latitude: 0,
    longitude: 0,
    capacity: 4,
  });

  // Fetch data
  useEffect(() => {
    fetchShops();
    fetchOwners();
  }, []);

  const normalizeAddress = (address: string) => {
    return address
      .replace(/\s+/g, ' ')
      .replace(/,+/g, ',')
      .trim()
      .replace(/,$/, '');
  };

  const validateAddressStructure = (address: string) => {
    const parts = address.split(',').filter(Boolean);
    if (parts.length < 3) {
      throw new Error(
        'Address should contain at least street, city, and country'
      );
    }
    return true;
  };

  const updateOwnerWithShop = async (
    ownerId: string,
    shopId: string,
    shopName: string
  ) => {
    if (!ownerId) return;
    try {
      const ownerRef = doc(db, 'barberowner', ownerId);
      await setDoc(
        ownerRef,
        {
          shopId: shopId,
          shopName: shopName,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      console.warn('Notice: Could not update owner with shop info:', error);
    }
  };

  const clearOwnerShop = async (ownerId: string) => {
    if (!ownerId) return;
    try {
      const ownerRef = doc(db, 'barberowner', ownerId);
      await setDoc(
        ownerRef,
        {
          shopId: '',
          shopName: '',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      console.warn('Notice: Could not clear shop from previous owner:', error);
    }
  };

  const geocodeAddress = async (address: string) => {
    const apiKey = 'AIzaSyCWDKIO4zO3YOBWfobTpWkRj_crtJ07NeI';
    const cleanAddress = normalizeAddress(address);

    try {
      validateAddressStructure(cleanAddress);

      const encodedAddress = encodeURIComponent(cleanAddress);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'ZERO_RESULTS') {
        throw new Error(
          'No results found for this address. Please check the address details.'
        );
      }
      if (data.status !== 'OK') {
        throw new Error(data.error_message || 'Geocoding API error');
      }

      return data.results[0].geometry.location;
    } catch (error) {
      console.error('Geocoding error:', {
        error,
        originalAddress: address,
        cleanAddress,
      });
      throw error;
    }
  };

  const geocodeWithRetry = async (address: string, retries = 2) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await geocodeAddress(address);
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    throw new Error('Geocoding failed after retries');
  };

  const fetchShops = async () => {
    try {
      setIsFetching(true);
      const querySnapshot = await getDocs(collection(db, 'shops'));
      const shopsData = await Promise.all(
        querySnapshot.docs.map(async (shopDoc) => {
          const shopData = shopDoc.data();

          // Fetch owner name if not already on the shop document
          let ownerName = shopData.ownerName || 'Unknown';
          if (shopData.ownerId) {
            try {
              const ownerDoc = await getDoc(
                doc(db, 'barberowner', shopData.ownerId)
              );
              if (ownerDoc.exists()) {
                const od = ownerDoc.data();
                ownerName =
                  od.name || od.ownerName || od.fullName || ownerName;
              }
            } catch (error) {
              console.warn('Error fetching owner name for shop:', error);
            }
          }

          return {
            id: shopDoc.id,
            ...shopData,
            ownerName,
          } as Shop;
        })
      );
      setShops(shopsData);
    } catch (error) {
      console.error('Error fetching shops:', error);
      Alert.alert('Error', 'Failed to load shops');
    } finally {
      setIsFetching(false);
    }
  };

  const fetchOwners = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'barberowner'));
      const ownersData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        name:
          doc.data().name ||
          doc.data().ownerName ||
          doc.data().fullName ||
          'Unknown',
      }));
      setOwners(ownersData);
    } catch (error) {
      console.error('Error fetching owners:', error);
      Alert.alert('Error', 'Failed to load owners');
    }
  };

  const handleAddShop = async () => {
    if (!validateForm()) return;
    setGeocodingError(null);

    try {
      setLoading(true);

      const requiredAddressFields = [
        newShop.addressLine1,
        newShop.city,
        newShop.country,
      ];

      if (requiredAddressFields.some((field) => !field)) {
        throw new Error(
          'Please fill all required address fields (Address Line 1, City, Country)'
        );
      }

      const fullAddress = [
        newShop.addressLine1,
        newShop.addressLine2,
        newShop.city,
        newShop.stateRegion,
        newShop.postalCode,
        newShop.country,
      ]
        .filter(Boolean)
        .join(', ');

      let lat = newShop.latitude || 0;
      let lng = newShop.longitude || 0;

      // Only attempt geocoding if coordinates are 0 (e.g., new shop or missing coordinates)
      if (!lat || !lng) {
        try {
          const coordinates = await geocodeWithRetry(fullAddress);
          lat = coordinates.lat;
          lng = coordinates.lng;
        } catch (geoError: any) {
          console.warn('Geocoding notice:', geoError?.message);
          // If creating a brand new shop without coordinates, require geocoding
          if (!editShopId) {
            throw geoError;
          }
        }
      }

      // Resolve selected owner name
      const selectedOwner = owners.find((o) => o.id === newShop.ownerId);
      const ownerName = selectedOwner
        ? selectedOwner.name
        : (newShop as any).ownerName || 'Unknown';

      const shopData = {
        ...newShop,
        ownerName,
        latitude: lat,
        longitude: lng,
      };

      if (editShopId) {
        // Update existing shop in Firestore
        await updateDoc(doc(db, 'shops', editShopId), {
          ...shopData,
          updatedAt: new Date().toISOString(),
        });

        // If owner was changed, unassign from old owner
        if (previousOwnerId && previousOwnerId !== newShop.ownerId) {
          await clearOwnerShop(previousOwnerId);
        }

        // Link new owner with this shop
        if (newShop.ownerId) {
          await updateOwnerWithShop(
            newShop.ownerId,
            editShopId,
            newShop.shopName
          );
        }

        Alert.alert('Success', 'Shop updated successfully');
      } else {
        // Create new shop
        const docRef = await addDoc(collection(db, 'shops'), {
          ...shopData,
          createdAt: new Date().toISOString(),
        });

        // Update the owner's document with the new shop info
        if (newShop.ownerId) {
          await updateOwnerWithShop(
            newShop.ownerId,
            docRef.id,
            newShop.shopName
          );
        }

        Alert.alert('Success', 'Shop added successfully');
      }

      resetForm();
      await fetchShops();
      await fetchOwners();
    } catch (error: any) {
      console.error('Error saving shop:', error);

      if (
        error.message?.includes('geocode') ||
        error.message?.includes('address')
      ) {
        setGeocodingError(error.message);
        Alert.alert('Address Error', error.message);
      } else {
        Alert.alert(
          'Error',
          editShopId
            ? `Failed to update shop: ${error.message || ''}`
            : `Failed to add shop: ${error.message || ''}`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const fieldLabels: Record<string, string> = {
      shopName: 'Shop Name',
      ownerId: 'Owner',
      shopEmail: 'Shop Email',
      phoneNumber: 'Phone Number',
      businessType: 'Business Type',
      gender: 'Gender',
      addressLine1: 'Address Line 1',
      city: 'City',
      stateRegion: 'State / Region',
      postalCode: 'Postal Code',
      country: 'Country',
      openingHours: 'Opening Hours',
    };

    const missingFields = Object.keys(fieldLabels).filter(
      (field) => !newShop[field as keyof typeof newShop]
    );

    if (missingFields.length > 0) {
      const missingLabels = missingFields.map((f) => fieldLabels[f]).join(', ');
      Alert.alert(
        'Missing Required Fields',
        `Please fill in: ${missingLabels}`
      );
      return false;
    }
    return true;
  };

  const resetForm = () => {
    setNewShop({
      shopName: '',
      ownerId: '',
      shopEmail: '',
      phoneNumber: '',
      businessType: '',
      gender: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      stateRegion: '',
      postalCode: '',
      country: '',
      googleMapLink: '',
      openingHours: '',
      closedDays: [],
      latitude: 0,
      longitude: 0,
      capacity: 4,
    });
    setPreviousOwnerId(null);
    setEditShopId(null);
    setIsOwnerDropdownOpen(false);
    setShowAddForm(false);
  };

  const handleDeleteShop = async (shopId: string, shopName: string) => {
    Alert.alert(
      'Delete Shop',
      `Are you sure you want to delete "${shopName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);

              // First get the shop to find the owner
              const shopDoc = doc(db, 'shops', shopId);
              const shopSnapshot = await getDoc(shopDoc);
              const shopData = shopSnapshot.data();

              // Delete the shop
              await deleteDoc(shopDoc);

              // Remove the shop from the owner's document
              if (shopData?.ownerId) {
                await clearOwnerShop(shopData.ownerId);
              }

              await fetchShops();
              await fetchOwners();
              Alert.alert('Success', 'Shop deleted successfully');
            } catch (error) {
              console.error('Error deleting shop:', error);
              Alert.alert('Error', 'Failed to delete shop');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleEditShop = (shop: Shop) => {
    setEditShopId(shop.id);
    setPreviousOwnerId(shop.ownerId || null);
    setNewShop({
      shopName: shop.shopName || '',
      ownerId: shop.ownerId || '',
      shopEmail: shop.shopEmail || '',
      phoneNumber: shop.phoneNumber || '',
      businessType: shop.businessType || 'Barber',
      gender: shop.gender || 'Men',
      addressLine1: shop.addressLine1 || '',
      addressLine2: shop.addressLine2 || '',
      city: shop.city || '',
      stateRegion: shop.stateRegion || '',
      postalCode: shop.postalCode || '',
      country: shop.country || 'India',
      googleMapLink: shop.googleMapLink || '',
      openingHours: shop.openingHours || '',
      closedDays: shop.closedDays || [],
      latitude: shop.latitude || 0,
      longitude: shop.longitude || 0,
      capacity: shop.capacity || 4,
    });
    setIsOwnerDropdownOpen(false);
    setShowAddForm(true);
  };

  const toggleClosedDay = (day: string) => {
    setNewShop((prev) => ({
      ...prev,
      closedDays: prev.closedDays.includes(day)
        ? prev.closedDays.filter((d) => d !== day)
        : [...prev.closedDays, day],
    }));
  };

  // Constants
  const businessTypes = ['Salon', 'Spa', 'Barber', 'Nail Salon', 'Other'];
  const genders = ['Men', 'Women', 'Unisex'];
  const countries = ['India', 'USA', 'UK', 'Canada', 'Australia', 'UAE'];
  const daysOfWeek = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  return (
    <View style={styles.container}>
      {/* Header - Removed Animated.View */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Shops Management</Text>
          <Text style={styles.headerSubtitle}>Manage all registered shops</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(true)}
          disabled={loading || isFetching}
        >
          <Plus size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Add/Edit Form */}
        {isFetching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            {showAddForm && (
              // Removed Animated.View and replaced with regular View
              <View style={styles.addForm}>
                <Text style={styles.formTitle}>
                  {editShopId ? 'Edit Shop Details' : 'Register New Shop'}
                </Text>

                {/* Shop Basic Info */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Basic Information</Text>
                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Shop Name *</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.shopName}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, shopName: text })
                        }
                        placeholder="Enter shop name"
                      />
                    </View>
                  </View>

                  {/* Owner Selector */}
                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Owner *</Text>
                      <TouchableOpacity
                        style={styles.dropdownButton}
                        onPress={() => setIsOwnerDropdownOpen(!isOwnerDropdownOpen)}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <User size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                          <Text
                            style={[
                              styles.dropdownButtonText,
                              !newShop.ownerId && { color: Colors.textLight },
                            ]}
                          >
                            {newShop.ownerId
                              ? owners.find((o) => o.id === newShop.ownerId)?.name ||
                                `Unlinked (${newShop.ownerId.slice(0, 10)}...)`
                              : 'Select Owner'}
                          </Text>
                        </View>
                        {isOwnerDropdownOpen ? (
                          <ChevronUp size={20} color={Colors.text} />
                        ) : (
                          <ChevronDown size={20} color={Colors.text} />
                        )}
                      </TouchableOpacity>

                      {isOwnerDropdownOpen && (
                        <View style={styles.dropdownMenu}>
                          {owners.length === 0 ? (
                            <Text style={styles.dropdownEmptyText}>
                              No owners registered
                            </Text>
                          ) : (
                            owners.map((owner) => {
                              const isSelected = newShop.ownerId === owner.id;
                              return (
                                <TouchableOpacity
                                  key={owner.id}
                                  style={[
                                    styles.dropdownMenuItem,
                                    isSelected && styles.dropdownMenuItemSelected,
                                  ]}
                                  onPress={() => {
                                    setNewShop({ ...newShop, ownerId: owner.id });
                                    setIsOwnerDropdownOpen(false);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.dropdownMenuItemText,
                                      isSelected && styles.dropdownMenuItemTextSelected,
                                    ]}
                                  >
                                    {owner.name}
                                  </Text>
                                  {isSelected && (
                                    <Check size={16} color={Colors.primary} />
                                  )}
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Business Type Selector */}
                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Business Type *</Text>
                      <View style={styles.chipsContainer}>
                        {businessTypes.map((type) => {
                          const isSelected = newShop.businessType === type;
                          return (
                            <TouchableOpacity
                              key={type}
                              style={[
                                styles.chipButton,
                                isSelected && styles.chipButtonSelected,
                              ]}
                              onPress={() =>
                                setNewShop({ ...newShop, businessType: type })
                              }
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  isSelected && styles.chipTextSelected,
                                ]}
                              >
                                {type}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>

                  {/* Gender Selector */}
                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Gender *</Text>
                      <View style={styles.chipsContainer}>
                        {genders.map((gender) => {
                          const isSelected = newShop.gender === gender;
                          return (
                            <TouchableOpacity
                              key={gender}
                              style={[
                                styles.chipButton,
                                isSelected && styles.chipButtonSelected,
                              ]}
                              onPress={() =>
                                setNewShop({ ...newShop, gender })
                              }
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  isSelected && styles.chipTextSelected,
                                ]}
                              >
                                {gender}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                </View>

                {/* Contact Information */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Contact Information</Text>
                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Email *</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.shopEmail}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, shopEmail: text })
                        }
                        placeholder="shop@example.com"
                        keyboardType="email-address"
                      />
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Phone *</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.phoneNumber}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, phoneNumber: text })
                        }
                        placeholder="+91 9876543210"
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>
                </View>

                {/* Address Information */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Address Information</Text>
                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Address Line 1 *</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.addressLine1}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, addressLine1: text })
                        }
                        placeholder="Street address, P.O. box"
                      />
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Address Line 2</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.addressLine2}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, addressLine2: text })
                        }
                        placeholder="Apartment, suite, unit, building, floor"
                      />
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View
                      style={[
                        styles.inputContainer,
                        { flex: 0.6, marginRight: 10 },
                      ]}
                    >
                      <Text style={styles.inputLabel}>City *</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.city}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, city: text })
                        }
                        placeholder="City"
                      />
                    </View>
                    <View style={[styles.inputContainer, { flex: 0.4 }]}>
                      <Text style={styles.inputLabel}>Postal Code *</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.postalCode}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, postalCode: text })
                        }
                        placeholder="PIN code"
                      />
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View
                      style={[
                        styles.inputContainer,
                        { flex: 0.6, marginRight: 10 },
                      ]}
                    >
                      <Text style={styles.inputLabel}>State/Region *</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.stateRegion}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, stateRegion: text })
                        }
                        placeholder="State or region"
                      />
                    </View>
                    <View style={[styles.inputContainer, { flex: 0.4 }]}>
                      <Text style={styles.inputLabel}>Country *</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.country}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, country: text })
                        }
                        placeholder="e.g. India"
                      />
                      <View style={[styles.chipsContainer, { marginTop: 6 }]}>
                        {['India', 'USA', 'UAE', 'UK'].map((c) => {
                          const isSelected =
                            newShop.country?.toLowerCase() === c.toLowerCase();
                          return (
                            <TouchableOpacity
                              key={c}
                              style={[
                                styles.chipButtonSmall,
                                isSelected && styles.chipButtonSmallSelected,
                              ]}
                              onPress={() =>
                                setNewShop({ ...newShop, country: c })
                              }
                            >
                              <Text
                                style={[
                                  styles.chipTextSmall,
                                  isSelected && styles.chipTextSmallSelected,
                                ]}
                              >
                                {c}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Google Maps Link</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.googleMapLink}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, googleMapLink: text })
                        }
                        placeholder="https://maps.google.com/..."
                      />
                    </View>
                  </View>
                </View>

                {/* Business Hours */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Business Hours</Text>
                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Opening Hours *</Text>
                      <TextInput
                        style={styles.input}
                        value={newShop.openingHours}
                        onChangeText={(text) =>
                          setNewShop({ ...newShop, openingHours: text })
                        }
                        placeholder="e.g., 9:00 AM - 8:00 PM"
                      />
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Seating (chairs available for booking)</Text>
                      <View style={styles.capacityStepper}>
                        <TouchableOpacity
                          style={styles.capacityButton}
                          onPress={() =>
                            setNewShop({ ...newShop, capacity: Math.max(1, (newShop.capacity || 4) - 1) })
                          }
                        >
                          <Minus size={18} color={Colors.primary} />
                        </TouchableOpacity>
                        <View style={styles.capacityValueBox}>
                          <Armchair size={16} color={Colors.primary} />
                          <Text style={styles.capacityValueText}>{newShop.capacity || 4}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.capacityButton}
                          onPress={() =>
                            setNewShop({ ...newShop, capacity: Math.min(10, (newShop.capacity || 4) + 1) })
                          }
                        >
                          <Plus size={18} color={Colors.primary} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.capacityHint}>
                        1 to 10 chairs. Customers pick a specific chair when booking — this is
                        exactly how many will show up as options.
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Closed Days */}
                <View style={styles.section}>
                  <View style={styles.inputRow}>
                    <View style={[styles.inputContainer, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Closed Days</Text>
                      <View style={styles.daysContainer}>
                        {daysOfWeek.map((day) => (
                          <TouchableOpacity
                            key={day}
                            style={[
                              styles.dayButton,
                              newShop.closedDays.includes(day) &&
                                styles.dayButtonSelected,
                            ]}
                            onPress={() => toggleClosedDay(day)}
                          >
                            <Text
                              style={[
                                styles.dayText,
                                newShop.closedDays.includes(day) &&
                                  styles.dayTextSelected,
                              ]}
                            >
                              {day.substring(0, 3)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>

                {/* Form Actions */}
                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.cancelButton]}
                    onPress={resetForm}
                    disabled={loading}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.saveButton,
                      loading && styles.buttonDisabled,
                    ]}
                    onPress={handleAddShop}
                    disabled={loading}
                  >
                    <Text style={styles.saveButtonText}>
                      {loading
                        ? editShopId
                          ? 'Updating...'
                          : 'Saving...'
                        : editShopId
                        ? 'Update'
                        : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Shops List */}
            {shops.map((shop) => (
              // Removed Animated.View and replaced with regular View
              <View
                key={shop.id}
                style={styles.shopCard}
              >
                <View style={styles.shopHeader}>
                  <Text style={styles.shopName}>{shop.shopName}</Text>
                  <View style={styles.shopActions}>
                    <TouchableOpacity
                      style={styles.actionIcon}
                      onPress={() => handleEditShop(shop)}
                    >
                      <Edit2 size={18} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.actionIcon,
                        { backgroundColor: Colors.errorLight },
                      ]}
                      onPress={() => handleDeleteShop(shop.id, shop.shopName)}
                    >
                      <Trash2 size={18} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.shopDetails}>
                  <View style={styles.detailRow}>
                    <User size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>
                      Owner:{' '}
                      <Text style={{ fontFamily: 'Poppins-SemiBold', color: Colors.primary }}>
                        {shop.ownerName && shop.ownerName !== 'Unknown'
                          ? shop.ownerName
                          : owners.find((o) => o.id === shop.ownerId)?.name ||
                            'Not Assigned / Unknown'}
                      </Text>
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Award size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>
                      Type: {shop.businessType}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Type size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>Gender: {shop.gender}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Mail size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>{shop.shopEmail}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Phone size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>{shop.phoneNumber}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <MapPin size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>
                      {[
                        shop.addressLine1,
                        shop.addressLine2,
                        shop.city,
                        shop.stateRegion,
                        shop.postalCode,
                        shop.country,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Clock size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>
                      Hours: {shop.openingHours}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Armchair size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>
                      {shop.capacity || 4} chair{(shop.capacity || 4) === 1 ? '' : 's'}
                    </Text>
                  </View>

                  {shop.closedDays?.length > 0 && (
                    <View style={styles.detailRow}>
                      <Calendar size={16} color={Colors.primary} />
                      <Text style={styles.detailText}>
                        Closed: {shop.closedDays.join(', ')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </>
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
    paddingBottom: 20,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    fontSize: 22,
    fontFamily: 'Poppins-SemiBold',
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
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Form Styles
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
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginBottom: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  capacityStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  capacityButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capacityValueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    minWidth: 64,
    justifyContent: 'center',
  },
  capacityValueText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
  },
  capacityHint: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 8,
    lineHeight: 16,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    backgroundColor: Colors.backgroundLight,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Colors.backgroundLight,
    minHeight: 48,
  },
  dropdownButtonText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
  },
  dropdownMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    backgroundColor: Colors.white || '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 220,
    zIndex: 1000,
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dropdownMenuItemSelected: {
    backgroundColor: '#eff6ff',
  },
  dropdownMenuItemText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
  },
  dropdownMenuItemTextSelected: {
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
  },
  dropdownEmptyText: {
    padding: 16,
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chipButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundLight,
  },
  chipButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  chipTextSelected: {
    color: '#ffffff',
    fontFamily: 'Poppins-SemiBold',
  },
  chipButtonSmall: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundLight,
  },
  chipButtonSmallSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipTextSmall: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  chipTextSmallSelected: {
    color: '#ffffff',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundLight,
  },
  dayButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  dayTextSelected: {
    color: 'white',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.backgroundLight,
  },
  saveButton: {
    backgroundColor: Colors.primary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },

  // Shop Card Styles
  shopCard: {
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
  shopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  shopName: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    flex: 1,
  },
  shopActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    lineHeight: 20,
  },

  bottomPadding: {
    height: 80,
  },
});