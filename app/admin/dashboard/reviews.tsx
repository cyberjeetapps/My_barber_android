import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import Colors from '@/constants/Colors';
import { useRouter } from 'expo-router';
import {
  Check,
  X,
  ArrowLeft,
  Star,
  Calendar,
  Clock,
  MapPin,
  Scissors,
} from 'lucide-react-native';

interface Review {
  id: string;
  appointmentId: string;
  userId: string;
  userName?: string;
  userPhoto?: string;
  barberId: string;
  barberNumber: number;
  rating: number;
  review: string;
  serviceName: string;
  shopId: string;
  shopName: string;
  createdAt: string;
  status?: 'pending' | 'approved' | 'rejected';
}

export default function AdminReviewsApproval() {
  const router = useRouter();
  const [pendingReviews, setPendingReviews] = useState<Review[]>([]);
  const [approvedReviews, setApprovedReviews] = useState<Review[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [actionState, setActionState] = useState<{
    id: string | null;
    type: 'approve' | 'reject' | null;
  }>({
    id: null,
    type: null,
  });

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      setIsFetching(true);

      // Fetch pending reviews
      const pendingQuerySnapshot = await getDocs(
        collection(db, 'Pending reviews')
      );
      const pendingData = pendingQuerySnapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...(doc.data() as any),
          } as Review)
      );
      setPendingReviews(pendingData);

      // Fetch approved reviews
      const approvedQuery = query(
        collection(db, 'reviews'),
        where('status', '==', 'approved')
      );
      const approvedQuerySnapshot = await getDocs(approvedQuery);
      const approvedData = approvedQuerySnapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...(doc.data() as any),
          } as Review)
      );
      setApprovedReviews(approvedData);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      Alert.alert('Error', 'Failed to load reviews');
    } finally {
      setIsFetching(false);
    }
  };

  const rejectReview = async (id: string) => {
    try {
      setActionState({ id, type: 'reject' });

      // Optionally add to rejected reviews if you want to track them
      const reviewRef = doc(db, 'reviews', id);
      await updateDoc(reviewRef, {
        status: 'rejected',
        updatedAt: new Date().toISOString(),
      });

      // Remove from pending reviews
      await deleteDoc(doc(db, 'Pending reviews', id));

      Alert.alert('Success', 'Review rejected successfully');
      fetchReviews();
    } catch (error) {
      console.error('Error rejecting review:', error);
      Alert.alert('Error', 'Failed to reject review');
    } finally {
      setActionState({ id: null, type: null });
    }
  };

  const approveReview = async (review: Review) => {
    try {
      setActionState({ id: review.id, type: 'approve' });

      // Create the review in the main 'reviews' collection
      const reviewData = {
        appointmentId: review.appointmentId,
        userId: review.userId,
        userName: review.userName,
        barberId: review.barberId,
        barberNumber: review.barberNumber,
        rating: review.rating,
        review: review.review,
        serviceName: review.serviceName,
        shopId: review.shopId,
        shopName: review.shopName,
        status: 'approved',
        createdAt: review.createdAt,
        updatedAt: new Date().toISOString(),
      };

      // Add to main reviews collection
      await addDoc(collection(db, 'reviews'), reviewData);

      // Remove from pending reviews
      await deleteDoc(doc(db, 'Pending reviews', review.id));

      Alert.alert('Success', 'Review approved and published successfully');
      fetchReviews();
    } catch (error) {
      console.error('Error approving review:', error);
      Alert.alert('Error', 'Failed to approve review');
    } finally {
      setActionState({ id: null, type: null });
    }
  };

  const renderStars = (rating: number) => {
    const stars: any[] = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          size={18}
          color={i <= rating ? Colors.primary : Colors.border}
          fill={i <= rating ? Colors.primary : 'transparent'}
        />
      );
    }
    return stars;
  };

  const renderReviewCard = (review: Review, isPending: boolean) => {
    const isProcessing = actionState.id === review.id && isPending;
    const date = new Date(review.createdAt);

    return (
      // Removed Animated.View and replaced with regular View
      <View
        key={review.id}
        style={styles.card}
      >
        {/* User Info */}
        <View style={styles.userContainer}>
          {review.userPhoto ? (
            <Image
              source={{ uri: review.userPhoto }}
              style={styles.userImage}
            />
          ) : (
            <View style={styles.userPlaceholder}>
              <Text style={styles.userInitial}>
                {review.userName
                  ? review.userName.charAt(0).toUpperCase()
                  : 'U'}
              </Text>
            </View>
          )}
          <Text style={styles.userName}>
            {review.userName || 'Anonymous User'}
          </Text>
        </View>

        {/* Rating */}
        <View style={styles.ratingContainer}>
          {renderStars(review.rating)}
          <Text style={styles.ratingText}>{review.rating}/5</Text>
        </View>

        {/* Review Text */}
        <Text style={styles.reviewText}>{review.review}</Text>

        {/* Service Details */}
        <View style={styles.detailsContainer}>
          <View style={styles.detailItem}>
            <Scissors size={16} color={Colors.primary} />
            <Text style={styles.detailText}>{review.serviceName}</Text>
          </View>
          <View style={styles.detailItem}>
            <MapPin size={16} color={Colors.primary} />
            <Text style={styles.detailText}>{review.shopName}</Text>
          </View>
          {/* <View style={styles.detailItem}>
            <Text style={styles.detailText}>Barber #{review.barberNumber}</Text>
          </View> */}
        </View>

        {/* Date */}
        <View style={styles.dateContainer}>
          <Calendar size={16} color={Colors.textLight} />
          <Text style={styles.dateText}>
            {date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
          <Clock size={16} color={Colors.textLight} style={styles.timeIcon} />
          <Text style={styles.dateText}>
            {date.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {/* Actions for pending reviews */}
        {isPending && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => approveReview(review)}
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
              onPress={() => rejectReview(review.id)}
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
        )}
      </View>
    );
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
          <Text style={styles.headerTitle}>Reviews Management</Text>
          <Text style={styles.headerSubtitle}>Manage customer reviews</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'pending' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('pending')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'pending' && styles.activeTabText,
            ]}
          >
            Pending ({pendingReviews.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'approved' && styles.activeTab,
          ]}
          onPress={() => setActiveTab('approved')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'approved' && styles.activeTabText,
            ]}
          >
            Approved ({approvedReviews.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isFetching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading reviews...</Text>
          </View>
        ) : activeTab === 'pending' && pendingReviews.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No pending reviews to approve
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={fetchReviews}
              disabled={isFetching}
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : activeTab === 'approved' && approvedReviews.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No approved reviews yet</Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={fetchReviews}
              disabled={isFetching}
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {activeTab === 'pending'
              ? pendingReviews.map((review) => renderReviewCard(review, true))
              : approvedReviews.map((review) =>
                  renderReviewCard(review, false)
                )}
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
    paddingBottom: 16,
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
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.textLight,
  },
  activeTabText: {
    color: Colors.primary,
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
  userContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userInitial: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
  },
  userName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ratingText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    marginLeft: 8,
  },
  reviewText: {
    fontSize: 15,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginBottom: 12,
    lineHeight: 22,
  },
  detailsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginLeft: 6,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateText: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginLeft: 6,
    marginRight: 12,
  },
  timeIcon: {
    marginLeft: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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