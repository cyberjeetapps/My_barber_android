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
import { Check, X, ArrowLeft, Clock, Store } from 'lucide-react-native';

interface Package {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: string;
  services?: string[];
  gender?: string;
  imageUrl?: string;
  originalId?: string;
  shopIds?: string[];
  shopNames?: string[];
}

export default function AdminPackagesApproval() {
  const router = useRouter();
  const [pendingPackages, setPendingPackages] = useState<Package[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [actionState, setActionState] = useState<{
    id: string | null;
    type: 'approve' | 'reject' | null;
  }>({
    id: null,
    type: null,
  });

  useEffect(() => {
    fetchPendingPackages();
  }, []);

  const fetchPendingPackages = async () => {
    try {
      setIsFetching(true);
      const querySnapshot = await getDocs(collection(db, 'pending_packages'));
      const data = querySnapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...(doc.data() as any),
          } as Package)
      );
      setPendingPackages(data);
    } catch (error) {
      console.error('Error fetching pending packages:', error);
      Alert.alert('Error', 'Failed to load pending packages');
    } finally {
      setIsFetching(false);
    }
  };

  const rejectPackage = async (id: string) => {
    try {
      setActionState({ id, type: 'reject' });
      await deleteDoc(doc(db, 'pending_packages', id));
      Alert.alert('Success', 'Package rejected successfully');
      fetchPendingPackages();
    } catch (error) {
      console.error('Error rejecting package:', error);
      Alert.alert('Error', 'Failed to reject package');
    } finally {
      setActionState({ id: null, type: null });
    }
  };

  const approvePackage = async (pkg: Package) => {
    try {
      setActionState({ id: pkg.id, type: 'approve' });

      const packageData = {
        name: pkg.name,
        description: pkg.description,
        price: pkg.price,
        duration: pkg.duration,
        services: pkg.services ?? [],
        gender: pkg.gender || 'unisex',
        imageUrl: pkg.imageUrl || '',
        shopIds: pkg.shopIds || [],
        shopNames: pkg.shopNames || [],
        updatedAt: new Date().toISOString(),
      };

      if (pkg.originalId) {
        await setDoc(doc(db, 'packages', pkg.originalId), packageData);
      } else {
        await setDoc(doc(db, 'packages', pkg.id), {
          ...packageData,
          createdAt: new Date().toISOString(),
        });
      }

      await deleteDoc(doc(db, 'pending_packages', pkg.id));
      Alert.alert('Success', 'Package approved successfully');
      fetchPendingPackages();
    } catch (error) {
      console.error('Error approving package:', error);
      Alert.alert('Error', 'Failed to approve package');
    } finally {
      setActionState({ id: null, type: null });
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
          <Text style={styles.headerTitle}>Pending Packages</Text>
          <Text style={styles.headerSubtitle}>
            Approve or reject package requests
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isFetching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading pending packages...</Text>
          </View>
        ) : pendingPackages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No pending packages to approve
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={fetchPendingPackages}
              disabled={isFetching}
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          pendingPackages.map((pkg) => {
            const isProcessing = actionState.id === pkg.id;
            return (
              // Removed Animated.View and replaced with regular View
              <View
                key={pkg.id}
                style={styles.card}
              >
                <Text style={styles.packageName}>{pkg.name}</Text>
                <Text style={styles.packageDescription}>
                  {pkg.description?.replace(/>/g, '\u003e')}
                </Text>

                <View style={styles.detailsContainer}>
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
                    <Text style={styles.detailText}>
                      • {pkg.gender || 'unisex'}
                    </Text>
                  </View>
                </View>

                {pkg.services && pkg.services.length > 0 && (
                  <View style={styles.servicesContainer}>
                    <Text style={styles.sectionTitle}>Services Included:</Text>
                    {pkg.services.map((service, index) => (
                      <Text key={index} style={styles.servicesText}>
                        • {service.replace(/>/g, '\u003e')}
                      </Text>
                    ))}
                  </View>
                )}

                {pkg.shopNames && pkg.shopNames.length > 0 && (
                  <View style={styles.shopContainer}>
                    <Text style={styles.sectionTitle}>Available at:</Text>
                    <View style={styles.shopNamesContainer}>
                      {pkg.shopNames.map((shopName, index) => (
                        <View key={index} style={styles.shopItem}>
                          <Store size={16} color={Colors.primary} />
                          <Text style={styles.shopText}>
                            {shopName.replace(/>/g, '\u003e')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.approveButton]}
                    onPress={() => approvePackage(pkg)}
                    disabled={!!actionState.id}
                  >
                    {isProcessing && actionState.type === 'approve' ? (
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
                    onPress={() => rejectPackage(pkg.id)}
                    disabled={!!actionState.id}
                  >
                    {isProcessing && actionState.type === 'reject' ? (
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
            );
          })
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
  packageName: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 8,
  },
  packageDescription: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginBottom: 12,
  },
  detailsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
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
  servicesContainer: {
    marginBottom: 12,
  },
  shopContainer: {
    marginBottom: 12,
  },
  shopNamesContainer: {
    marginTop: 4,
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
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginBottom: 4,
  },
  servicesText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
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
});