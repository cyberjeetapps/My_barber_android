import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import Colors from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { Check, X, ArrowLeft, Clock, MapPin, Award, Tag } from 'lucide-react-native';

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  shopIds?: string[];
  shopNames?: string[];
  gender: string | string[];
  category?: string;
  type?: string;
  packageDuration?: string;
  imageUrl: string;
  originalId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function AdminServicesApproval() {
  const router = useRouter();
  const [pendingServices, setPendingServices] = useState<Service[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState<{
    id: string;
    type: 'approve' | 'reject';
  } | null>(null);

  useEffect(() => {
    fetchPendingServices();
  }, []);

  const fetchPendingServices = async () => {
    try {
      setIsFetching(true);
      const shopsSnapshot = await getDocs(collection(db, 'shops'));
      const shopsData = shopsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));

      const servicesSnapshot = await getDocs(
        collection(db, 'pending_services')
      );
      const data = servicesSnapshot.docs.map((doc) => {
        const serviceData: any = doc.data();
        return {
          id: doc.id,
          ...serviceData,
          shopNames: serviceData.shopIds
            ? serviceData.shopIds.map(
                (id: string) =>
                  shopsData.find((shop) => shop.id === id)?.shopName ||
                  'Unknown'
              )
            : [],
        };
      });

      setPendingServices(data);
    } catch (error) {
      console.error('Error fetching pending services:', error);
      Alert.alert('Error', 'Failed to load pending services');
    } finally {
      setIsFetching(false);
    }
  };

  const approveService = async (service: Service) => {
    setActionLoading({ id: service.id, type: 'approve' });
    try {
      const serviceData = Object.fromEntries(
        Object.entries({
          name: service.name,
          description: service.description,
          price: service.price,
          duration: service.duration,
          shopIds: service.shopIds,
          shopNames: service.shopNames,
          gender: service.gender,
          category: service.category || '',
          type: service.type,
          packageDuration: service.packageDuration,
          imageUrl: service.imageUrl,
          updatedAt: new Date().toISOString(),
        }).filter(([_, v]) => v !== undefined)
      );

      if (service.originalId) {
        await setDoc(doc(db, 'services', service.originalId), serviceData);
      } else {
        await setDoc(doc(db, 'services', service.id), {
          ...serviceData,
          createdAt: new Date().toISOString(),
        });
      }

      await deleteDoc(doc(db, 'pending_services', service.id));
      Alert.alert('Success', 'Service approved successfully');
      fetchPendingServices();
    } catch (error) {
      console.error('Error approving service:', error);
      Alert.alert('Error', 'Failed to approve service');
    } finally {
      setActionLoading(null);
    }
  };

  const rejectService = async (serviceId: string) => {
    setActionLoading({ id: serviceId, type: 'reject' });
    try {
      await deleteDoc(doc(db, 'pending_services', serviceId));
      Alert.alert('Success', 'Service rejected successfully');
      fetchPendingServices();
    } catch (error) {
      console.error('Error rejecting service:', error);
      Alert.alert('Error', 'Failed to reject service');
    } finally {
      setActionLoading(null);
    }
  };

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
          <Text style={styles.headerTitle}>Pending Services</Text>
          <Text style={styles.headerSubtitle}>
            Approve or reject service requests
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isFetching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading pending services...</Text>
          </View>
        ) : pendingServices.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No pending services to approve
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={fetchPendingServices}
              disabled={isFetching}
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          pendingServices.map((service) => (
            // Removed Animated.View and replaced with regular View
            <View
              key={service.id}
              style={styles.card}
            >
              <Text style={styles.serviceName}>{service.name}</Text>
              <Text style={styles.serviceDescription}>
                {service.description}
              </Text>

              <View style={styles.detailsContainer}>
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
              </View>

              {service.category && (
                <View style={styles.categoryBadgeRow}>
                  <Text style={styles.categoryLabel}>Service Category:</Text>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>
                      {service.category.charAt(0).toUpperCase() +
                        service.category.slice(1)}
                    </Text>
                  </View>
                </View>
              )}

              {service.gender && (
                <View style={styles.categoryBadgeRow}>
                  <Text style={styles.categoryLabel}>Gender Category:</Text>
                  <View style={[styles.categoryBadge, styles.genderBadge]}>
                    <Text style={[styles.categoryBadgeText, styles.genderBadgeText]}>
                      {Array.isArray(service.gender)
                        ? service.gender.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(', ')
                        : service.gender.charAt(0).toUpperCase() + service.gender.slice(1)}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.categoryBadgeRow}>
                <Text style={styles.categoryLabel}>Type:</Text>
                <View style={[
                  styles.categoryBadge,
                  service.type === 'package' ? styles.packageBadge : styles.serviceBadge,
                ]}>
                  <Text style={[
                    styles.categoryBadgeText,
                    service.type === 'package' ? styles.packageBadgeText : styles.serviceBadgeText,
                  ]}>
                    {service.type === 'package' ? '📦 Package' : '✂️ Service'}
                  </Text>
                </View>
              </View>

              {service.type === 'package' && service.packageDuration && (
                <View style={styles.categoryBadgeRow}>
                  <Text style={styles.categoryLabel}>Package Validity:</Text>
                  <View style={[styles.categoryBadge, styles.packageBadge]}>
                    <Text style={[styles.categoryBadgeText, styles.packageBadgeText]}>
                      {service.packageDuration}
                    </Text>
                  </View>
                </View>
              )}

              {service.imageUrl && (
                <View style={styles.detailItem}>
                  <Text style={styles.detailText}>
                    Image: {service.imageUrl}
                  </Text>
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Available at Shops</Text>
                {service.shopNames && service.shopNames.length > 0 ? (
                  service.shopNames.map((shopName, index) => (
                    <View key={index} style={styles.shopItem}>
                      <MapPin size={16} color={Colors.primary} />
                      <Text style={styles.shopText}>{shopName}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noShopsText}>
                    Not assigned to any shops
                  </Text>
                )}
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={() => approveService(service)}
                  disabled={!!actionLoading}
                >
                  {actionLoading?.id === service.id &&
                  actionLoading.type === 'approve' ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <Check size={18} color="white" />
                      <Text style={styles.actionButtonText}>Approve</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={() => rejectService(service.id)}
                  disabled={!!actionLoading}
                >
                  {actionLoading?.id === service.id &&
                  actionLoading.type === 'reject' ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <X size={18} color="white" />
                      <Text style={styles.actionButtonText}>Reject</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))
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
    flex: 1,
    paddingHorizontal: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginBottom: 16,
  },
  refreshButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 16,
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
  serviceName: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 8,
  },
  serviceDescription: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginBottom: 12,
  },
  detailsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginLeft: 8,
  },
  section: {
    marginVertical: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 8,
  },
  shopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  shopText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginLeft: 8,
  },
  noShopsText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  approveButton: {
    backgroundColor: Colors.success,
  },
  rejectButton: {
    backgroundColor: Colors.error,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    marginLeft: 8,
  },
  bottomPadding: {
    height: 100,
  },
  categoryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.textLight,
    marginRight: 8,
  },
  categoryBadge: {
    backgroundColor: Colors.primary + '22',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  categoryBadgeText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
  },
  genderBadge: {
    backgroundColor: '#0d948822',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#0d9488',
  },
  genderBadgeText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#0d9488',
  },
  serviceBadge: {
    backgroundColor: '#16a34a22',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#16a34a',
  },
  serviceBadgeText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#16a34a',
  },
  packageBadge: {
    backgroundColor: '#ea580c22',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#ea580c',
  },
  packageBadgeText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#ea580c',
  },
});