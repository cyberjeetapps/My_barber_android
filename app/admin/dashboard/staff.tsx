// import React, { useEffect, useState } from 'react';
// import {
//   View,
//   Text,
//   ScrollView,
//   TouchableOpacity,
//   Alert,
//   StyleSheet,
//   ActivityIndicator,
// } from 'react-native';
// import {
//   collection,
//   getDocs,
//   doc,
//   deleteDoc,
//   setDoc,
// } from 'firebase/firestore';
// import { db } from '@/config/firebase';
// import Colors from '@/constants/Colors';
// import { useRouter } from 'expo-router';
// import {
//   Check,
//   X,
//   ArrowLeft,
//   Mail,
//   Phone,
//   Award,
//   User,
//   Smile,
// } from 'lucide-react-native';
// import Animated, { FadeIn } from 'react-native-reanimated';

// export default function AdminStaffApproval() {
//   const router = useRouter();
//   const [pendingStaff, setPendingStaff] = useState([]);
//   const [isFetching, setIsFetching] = useState(true);
//   const [actionState, setActionState] = useState<{
//     id: string | null;
//     type: 'approve' | 'reject' | null;
//   }>({
//     id: null,
//     type: null,
//   });

//   useEffect(() => {
//     fetchPendingStaff();
//   }, []);

//   const fetchPendingStaff = async () => {
//     try {
//       setIsFetching(true);
//       const querySnapshot = await getDocs(collection(db, 'pending_staff'));
//       const data = querySnapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...(doc.data() as any),
//       }));
//       setPendingStaff(data);
//     } catch (error) {
//       console.error('Error fetching pending staff:', error);
//       Alert.alert('Error', 'Failed to load pending staff');
//     } finally {
//       setIsFetching(false);
//     }
//   };

//   const approveStaff = async (staff) => {
//     try {
//       setActionState({ id: staff.id, type: 'approve' });

//       const staffData = {
//         name: staff.name,
//         email: staff.email,
//         phone: staff.phone,
//         specialization: staff.specialization,
//         ranking: staff.ranking,
//         imageUrl: staff.imageUrl,
//         staffGender: staff.staffGender,
//         serviceGender: staff.serviceGender,
//         updatedAt: new Date().toISOString(),
//       };

//       if (staff.originalId) {
//         await setDoc(doc(db, 'staff', staff.originalId), staffData);
//       } else {
//         await setDoc(doc(db, 'staff', staff.id), {
//           ...staffData,
//           createdAt: new Date().toISOString(),
//         });
//       }

//       await deleteDoc(doc(db, 'pending_staff', staff.id));
//       Alert.alert('Success', 'Staff approved successfully');
//       fetchPendingStaff();
//     } catch (error) {
//       console.error('Error approving staff:', error);
//       Alert.alert('Error', 'Failed to approve staff');
//     } finally {
//       setActionState({ id: null, type: null });
//     }
//   };

//   const rejectStaff = async (staffId) => {
//     try {
//       setActionState({ id: staffId, type: 'reject' });
//       await deleteDoc(doc(db, 'pending_staff', staffId));
//       Alert.alert('Success', 'Staff rejected successfully');
//       fetchPendingStaff();
//     } catch (error) {
//       console.error('Error rejecting staff:', error);
//       Alert.alert('Error', 'Failed to reject staff');
//     } finally {
//       setActionState({ id: null, type: null });
//     }
//   };

//   return (
//     <View style={styles.container}>
//       <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
//         <TouchableOpacity
//           style={styles.backButton}
//           onPress={() => router.back()}
//         >
//           <ArrowLeft size={24} color={Colors.text} />
//         </TouchableOpacity>
//         <View style={styles.headerContent}>
//           <Text style={styles.headerTitle}>Pending Staff</Text>
//           <Text style={styles.headerSubtitle}>
//             Approve or reject staff requests
//           </Text>
//         </View>
//       </Animated.View>

//       <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
//         {isFetching ? (
//           <View style={styles.loadingContainer}>
//             <ActivityIndicator size="large" color={Colors.primary} />
//             <Text style={styles.loadingText}>Loading pending staff...</Text>
//           </View>
//         ) : pendingStaff.length === 0 ? (
//           <View style={styles.emptyState}>
//             <Text style={styles.emptyStateText}>
//               No pending staff to approve
//             </Text>
//             <TouchableOpacity
//               style={styles.refreshButton}
//               onPress={fetchPendingStaff}
//               disabled={isFetching}
//             >
//               <Text style={styles.refreshButtonText}>Refresh</Text>
//             </TouchableOpacity>
//           </View>
//         ) : (
//           pendingStaff.map((staff) => {
//             const isProcessing = actionState.id === staff.id;
//             return (
//               <Animated.View
//                 key={staff.id}
//                 entering={FadeIn.duration(500)}
//                 style={styles.card}
//               >
//                 <Text style={styles.staffName}>{staff.name}</Text>

//                 <View style={styles.detailItem}>
//                   <Mail size={16} color={Colors.primary} />
//                   <Text style={styles.detailText}>{staff.email}</Text>
//                 </View>

//                 <View style={styles.detailItem}>
//                   <Phone size={16} color={Colors.primary} />
//                   <Text style={styles.detailText}>{staff.phone}</Text>
//                 </View>

//                 <View style={styles.detailItem}>
//                   <Award size={16} color={Colors.primary} />
//                   <Text style={styles.detailText}>{staff.specialization}</Text>
//                 </View>

//                 <View style={styles.detailItem}>
//                   <User size={16} color={Colors.primary} />
//                   <Text style={styles.detailText}>Rank: {staff.ranking}</Text>
//                 </View>

//                 <View style={styles.row}>
//                   <View style={styles.genderBadge}>
//                     <Smile size={14} color={Colors.primary} />
//                     <Text style={styles.genderText}>
//                       Staff: {staff.staffGender || 'Not specified'}
//                     </Text>
//                   </View>
//                   <View style={styles.genderBadge}>
//                     <Smile size={14} color={Colors.primary} />
//                     <Text style={styles.genderText}>
//                       Service: {staff.serviceGender || 'Not specified'}
//                     </Text>
//                   </View>
//                 </View>

//                 <View style={styles.actionRow}>
//                   <TouchableOpacity
//                     style={[styles.actionButton, styles.approveButton]}
//                     onPress={() => approveStaff(staff)}
//                     disabled={!!actionState.id}
//                   >
//                     {isProcessing && actionState.type === 'approve' ? (
//                       <ActivityIndicator color="white" size="small" />
//                     ) : (
//                       <>
//                         <Check size={18} color="white" />
//                         <Text style={styles.actionButtonText}>Approve</Text>
//                       </>
//                     )}
//                   </TouchableOpacity>

//                   <TouchableOpacity
//                     style={[styles.actionButton, styles.rejectButton]}
//                     onPress={() => rejectStaff(staff.id)}
//                     disabled={!!actionState.id}
//                   >
//                     {isProcessing && actionState.type === 'reject' ? (
//                       <ActivityIndicator color="white" size="small" />
//                     ) : (
//                       <>
//                         <X size={18} color="white" />
//                         <Text style={styles.actionButtonText}>Reject</Text>
//                       </>
//                     )}
//                   </TouchableOpacity>
//                 </View>
//               </Animated.View>
//             );
//           })
//         )}
//         <View style={styles.bottomPadding} />
//       </ScrollView>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: Colors.background,
//   },
//   header: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     paddingHorizontal: 24,
//     paddingTop: 60,
//     paddingBottom: 24,
//     backgroundColor: Colors.background,
//     borderBottomWidth: 1,
//     borderBottomColor: Colors.border,
//   },
//   backButton: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: Colors.backgroundLight,
//     justifyContent: 'center',
//     alignItems: 'center',
//     marginRight: 16,
//   },
//   headerContent: {
//     flex: 1,
//   },
//   headerTitle: {
//     fontSize: 24,
//     fontFamily: 'Poppins-Bold',
//     color: Colors.text,
//   },
//   headerSubtitle: {
//     fontSize: 14,
//     fontFamily: 'Poppins-Regular',
//     color: Colors.textLight,
//   },
//   content: {
//     flex: 1,
//     paddingHorizontal: 24,
//   },
//   loadingContainer: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//     paddingVertical: 40,
//   },
//   loadingText: {
//     marginTop: 16,
//     fontSize: 16,
//     fontFamily: 'Poppins-Regular',
//     color: Colors.textLight,
//   },
//   emptyState: {
//     justifyContent: 'center',
//     alignItems: 'center',
//     paddingVertical: 40,
//   },
//   emptyStateText: {
//     fontSize: 16,
//     fontFamily: 'Poppins-Regular',
//     color: Colors.textLight,
//     marginBottom: 16,
//   },
//   refreshButton: {
//     backgroundColor: Colors.primary,
//     paddingHorizontal: 24,
//     paddingVertical: 12,
//     borderRadius: 8,
//   },
//   refreshButtonText: {
//     color: 'white',
//     fontSize: 16,
//     fontFamily: 'Poppins-SemiBold',
//   },
//   card: {
//     backgroundColor: Colors.cardBackground,
//     borderRadius: 12,
//     padding: 16,
//     marginBottom: 16,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.1,
//     shadowRadius: 8,
//     elevation: 3,
//   },
//   staffName: {
//     fontSize: 18,
//     fontFamily: 'Poppins-SemiBold',
//     color: Colors.text,
//     marginBottom: 12,
//   },
//   detailItem: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 8,
//   },
//   detailText: {
//     fontSize: 14,
//     fontFamily: 'Poppins-Regular',
//     color: Colors.text,
//     marginLeft: 8,
//   },
//   row: {
//     flexDirection: 'row',
//     marginVertical: 8,
//     gap: 8,
//   },
//   genderBadge: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: Colors.backgroundLight,
//     paddingHorizontal: 10,
//     paddingVertical: 6,
//     borderRadius: 20,
//     flex: 1,
//   },
//   genderText: {
//     fontSize: 12,
//     fontFamily: 'Poppins-Medium',
//     color: Colors.text,
//     marginLeft: 4,
//   },
//   actionRow: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     marginTop: 12,
//   },
//   actionButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     paddingVertical: 10,
//     paddingHorizontal: 16,
//     borderRadius: 8,
//     flex: 1,
//     marginHorizontal: 4,
//   },
//   approveButton: {
//     backgroundColor: Colors.success,
//   },
//   rejectButton: {
//     backgroundColor: Colors.error,
//   },
//   actionButtonText: {
//     color: 'white',
//     fontSize: 14,
//     fontFamily: 'Poppins-SemiBold',
//     marginLeft: 8,
//   },
//   bottomPadding: {
//     height: 100,
//   },
// });
