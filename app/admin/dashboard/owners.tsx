import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  setDoc,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '@/config/firebase';
import Colors from '@/constants/Colors';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  User,
  Phone,
  Calendar,
  Trash2,
  Edit2,
  Plus,
  X,
  Check,
  CreditCard,
  Building,
  FileText,
  Wallet,
  ShieldCheck,
  AlertCircle,
  Key,
  Award,
  RefreshCw,
} from 'lucide-react-native';

// 👉 Live Backend URL for owner management and Cashfree onboarding
const BACKEND_URL = 'https://backend.vps.mybarber.co.in';

export default function AdminOwnersList() {
  const router = useRouter();
  const [owners, setOwners] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState<any>(null);
  const [syncing, setSyncing] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editOwnerId, setEditOwnerId] = useState<any>(null);
  const [creatingAuth, setCreatingAuth] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [newOwner, setNewOwner] = useState({
    name: '',
    phoneNumber: '',
    email: '',
    bankAccountNumber: '',
    bankIfscCode: '',
    bankAccountHolderName: '',
    bankAccountName: '',
    role: 'owner',
    referredByOwnerCode: '',
  });

  useEffect(() => {
    fetchOwners();
  }, []);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const fetchOwners = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'barberowner'));
      const data = querySnapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setOwners(data);
    } catch (error) {
      console.error('Error fetching owners:', error);
      Alert.alert('Error', 'Failed to load owners');
    } finally {
      setLoading(false);
    }
  };

  // 🔥 CREATE OWNER VIA BACKEND API (No authentication switching)
  const createOwnerViaBackend = async (ownerData) => {
    try {
      setCreatingAuth(true);

      // Get admin token for verification
      if (!auth.currentUser) {
        throw new Error('Not authenticated');
      }
      const adminToken = await auth.currentUser.getIdToken();

      const response = await fetch(`${BACKEND_URL}/api/owners/create-owner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...ownerData,
          adminToken: adminToken
        }),
      });

      const result = await response.json();

      if (result.success) {
        return result.ownerId;
      } else {
        throw new Error(result.message || 'Failed to create owner');
      }
    } catch (error) {
      console.error('Backend owner creation failed:', error);
      throw error;
    } finally {
      setCreatingAuth(false);
    }
  };

  // 🔥 UPDATE OWNER VIA BACKEND API
  const updateOwnerViaBackend = async (ownerId, ownerData) => {
    try {
      // Get admin token for verification
      if (!auth.currentUser) {
        throw new Error('Not authenticated');
      }
      const adminToken = await auth.currentUser.getIdToken();

      const response = await fetch(`${BACKEND_URL}/api/owners/update-owner/${ownerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...ownerData,
          adminToken: adminToken
        }),
      });

      const result = await response.json();

      if (result.success) {
        return true;
      } else {
        throw new Error(result.message || 'Failed to update owner');
      }
    } catch (error) {
      console.error('Backend owner update failed:', error);
      throw error;
    }
  };

  // 🔥 DELETE OWNER VIA BACKEND API
  const deleteOwnerViaBackend = async (ownerId) => {
    try {
      // Get admin token for verification
      if (!auth.currentUser) {
        throw new Error('Not authenticated');
      }
      const adminToken = await auth.currentUser.getIdToken();

      const response = await fetch(`${BACKEND_URL}/api/owners/delete-owner/${ownerId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminToken: adminToken
        }),
      });

      const result = await response.json();

      if (result.success) {
        return true;
      } else {
        throw new Error(result.message || 'Failed to delete owner');
      }
    } catch (error: any) {
      console.error('Backend owner deletion failed:', error);
      throw error;
    }
  };

  // 🔑 Onboard owner with Cashfree for Easy Split (90% payout)
  const onboardOwnerWithCashfree = async (owner: any) => {
    try {
      setRegistering(owner.id);

      if (!owner.bankAccountNumber || !owner.bankIfscCode || !owner.bankAccountHolderName) {
        Alert.alert('Missing Details', 'Owner must have complete bank details (Account Number, IFSC, Account Holder Name).');
        return;
      }

      // Get admin token for authorized call
      if (!auth.currentUser) {
        throw new Error('Not authenticated');
      }
      const adminToken = await auth.currentUser.getIdToken();

      const response = await fetch(`${BACKEND_URL}/api/owners/${owner.id}/onboard-cashfree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminToken
        }),
      });

      const result = await response.json();

      if (result.success) {
        await updateDoc(doc(db, 'barberowner', owner.id), {
          cashfreeVendorId: result.vendorId,
          cashfreeVendorStatus: result.vendorStatus || 'ACTIVE',
          cashfreeOnboardingStatus: 'COMPLETED',
          updatedAt: new Date().toISOString(),
        });
        setSuccessMessage('Owner successfully onboarded to Cashfree Easy Split!');
        fetchOwners();
      } else {
        throw new Error(result.message || 'Cashfree onboarding failed');
      }
    } catch (error: any) {
      console.error('Cashfree onboarding failed:', error);
      Alert.alert('Cashfree Onboarding Failed', error.message || 'Please check bank details.');
    } finally {
      setRegistering(null);
    }
  };

  // 🔄 Sync latest live status from Cashfree
  const syncCashfreeStatus = async (owner: any) => {
    try {
      setSyncing(owner.id);
      const response = await fetch(`${BACKEND_URL}/api/owners/${owner.id}/cashfree-status`);
      const result = await response.json();
      if (result.success) {
        setSuccessMessage(`Cashfree Status: ${result.status}`);
        fetchOwners();
      } else {
        Alert.alert('Status Check', result.message || 'Unable to fetch status');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSyncing(null);
    }
  };

  const handleAddOwner = async () => {
    if (!newOwner.name || !newOwner.phoneNumber || !newOwner.bankAccountHolderName) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    if (!newOwner.bankAccountNumber || !newOwner.bankIfscCode) {
      Alert.alert('Error', 'Bank details are required');
      return;
    }
    // ✅ Basic IFSC validation
    if (newOwner.bankIfscCode.length !== 11 || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(newOwner.bankIfscCode)) {
      Alert.alert('Error', 'Enter a valid IFSC code (e.g., SBIN0000123)');
      return;
    }

    try {
      setLoading(true);

      if (editOwnerId) {
        // Update existing owner via backend
        await updateOwnerViaBackend(editOwnerId, newOwner);
        setSuccessMessage('Owner updated successfully!');
      } else {
        // Create new owner via backend API
        const ownerId = await createOwnerViaBackend(newOwner);

        if (ownerId) {
          setSuccessMessage('Owner created successfully with login access!');
        }
      }

      resetForm();
      fetchOwners();

    } catch (error: any) {
      console.error('Error saving owner:', error);
      Alert.alert('Error', error.message || 'Failed to save owner');
    } finally {
      setLoading(false);
    }
  };

  const deleteOwner = (ownerId, ownerName) => {
    Alert.alert(
      'Delete Owner',
      `Delete "${ownerName}" permanently? This will remove their login access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteOwnerViaBackend(ownerId);
              setSuccessMessage('Owner deleted successfully!');
              fetchOwners();
            } catch (error: any) {
              console.error('Error deleting owner:', error);
              Alert.alert('Error', error.message || 'Failed to delete owner');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const editOwner = (owner) => {
    setEditOwnerId(owner.id);
    setNewOwner({
      name: owner.name,
      phoneNumber: owner.phoneNumber,
      email: owner.email || '',
      bankAccountNumber: owner.bankAccountNumber,
      bankIfscCode: owner.bankIfscCode,
      bankAccountHolderName: owner.bankAccountHolderName,
      bankAccountName: owner.bankAccountName,
      role: owner.role || 'owner',
      referredByOwnerCode: owner.referredByOwnerCode || '',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setNewOwner({
      name: '',
      phoneNumber: '',
      email: '',
      bankAccountNumber: '',
      bankIfscCode: '',
      bankAccountHolderName: '',
      bankAccountName: '',
      role: 'owner',
      referredByOwnerCode: '',
    });
    setEditOwnerId(null);
    setShowForm(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Barber Owners</Text>
          <Text style={styles.headerSubtitle}>
            Manage shop owners & Cashfree Easy Split (10%/90%)
          </Text>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowForm(true)}
          disabled={loading}
        >
          <Plus size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* BODY */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Success Message */}
        {successMessage ? (
          <View style={styles.successContainer}>
            <Check size={20} color={Colors.success} />
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        {loading && !showForm && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}

        {/* ADD / EDIT FORM */}
        {showForm && (
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>
              {editOwnerId ? 'Edit Owner' : 'Add New Owner'}
            </Text>

            {/* Authentication Info */}
            <View style={styles.authInfo}>
              <Key size={16} color={Colors.primary} />
              <Text style={styles.authInfoText}>
                {editOwnerId
                  ? 'Editing existing owner profile'
                  : 'Owner will receive login access using their phone number'
                }
              </Text>
            </View>

            {/* Personal Info */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={newOwner.name}
                onChangeText={(text) => setNewOwner({ ...newOwner, name: text })}
                placeholder="Owner's full name"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                value={newOwner.phoneNumber}
                onChangeText={(text) => setNewOwner({ ...newOwner, phoneNumber: text })}
                placeholder="+91 9876543210"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
              />
            </View>

            {!editOwnerId && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Referred by (owner code, optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newOwner.referredByOwnerCode}
                  onChangeText={(text) => setNewOwner({ ...newOwner, referredByOwnerCode: text })}
                  placeholder="e.g. OWA1B2C3"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="characters"
                />
                <Text style={styles.referralHint}>
                  If this owner was referred by an existing owner, entering their code credits
                  the referrer 10 commission-free appointments.
                </Text>
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={newOwner.email}
                onChangeText={(text) => setNewOwner({ ...newOwner, email: text })}
                placeholder="owner@example.com"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Bank Info */}
            <Text style={styles.sectionTitle}>Bank Account Details *</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Account Holder Name</Text>
              <TextInput
                style={styles.input}
                value={newOwner.bankAccountHolderName}
                onChangeText={(text) =>
                  setNewOwner({ ...newOwner, bankAccountHolderName: text })
                }
                placeholder="As per bank records"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Account Number</Text>
              <TextInput
                style={styles.input}
                value={newOwner.bankAccountNumber}
                onChangeText={(text) =>
                  setNewOwner({ ...newOwner, bankAccountNumber: text })
                }
                placeholder="Bank account number"
                keyboardType="numeric"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>IFSC Code</Text>
              <TextInput
                style={styles.input}
                value={newOwner.bankIfscCode}
                onChangeText={(text) =>
                  setNewOwner({ ...newOwner, bankIfscCode: text.toUpperCase() })
                }
                placeholder="e.g., SBIN0000123"
                maxLength={11}
                autoCapitalize="characters"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Bank Name</Text>
              <TextInput
                style={styles.input}
                value={newOwner.bankAccountName}
                onChangeText={(text) =>
                  setNewOwner({ ...newOwner, bankAccountName: text })
                }
                placeholder="State Bank of India"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            {/* Buttons */}
            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.formButton, styles.cancelButton]}
                onPress={resetForm}
                disabled={loading || creatingAuth}
              >
                <X size={18} color={Colors.error} />
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.formButton,
                  styles.saveButton,
                  (loading || creatingAuth) && styles.buttonDisabled,
                ]}
                onPress={handleAddOwner}
                disabled={loading || creatingAuth}
              >
                {creatingAuth ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Check size={18} color="white" />
                )}
                <Text style={styles.saveButtonText}>
                  {creatingAuth ? 'Creating Account...' :
                    loading ? (editOwnerId ? 'Updating...' : 'Saving...') :
                      editOwnerId ? 'Update' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* LIST */}
        {owners.length === 0 && !loading && !showForm && (
          <Text style={styles.noDataText}>No owners found</Text>
        )}

        {owners.map((owner) => (
          <View key={owner.id} style={styles.ownerCard}>
            <View style={styles.ownerHeader}>
              <View style={styles.ownerAvatar}>
                <User size={20} color={Colors.primary} />
              </View>
              <View style={styles.ownerInfo}>
                <Text style={styles.ownerName}>{owner.name}</Text>
                <View style={styles.badgesContainer}>
                  {owner.hasAuthAccount && (
                    <View style={styles.authBadge}>
                      <Key size={12} color={Colors.primary} />
                      <Text style={styles.authBadgeText}>Login Enabled</Text>
                    </View>
                  )}
                  {owner.cashfreeVendorStatus === 'ACTIVE' ? (
                    <View style={styles.cashfreeActiveBadge}>
                      <ShieldCheck size={12} color={Colors.success} />
                      <Text style={styles.cashfreeActiveBadgeText}>Cashfree: Active</Text>
                    </View>
                  ) : owner.cashfreeVendorStatus === 'IN_BANK_VALIDATION' ? (
                    <View style={[styles.cashfreePendingBadge, { backgroundColor: '#E0F2FE' }]}>
                      <AlertCircle size={12} color="#0284C7" />
                      <Text style={[styles.cashfreePendingBadgeText, { color: '#0284C7' }]}>Cashfree: Validating</Text>
                    </View>
                  ) : owner.cashfreeVendorStatus === 'PENDING' ? (
                    <View style={styles.cashfreePendingBadge}>
                      <AlertCircle size={12} color={Colors.warning} />
                      <Text style={styles.cashfreePendingBadgeText}>Cashfree: Pending</Text>
                    </View>
                  ) : owner.cashfreeVendorStatus === 'FAILED' ? (
                    <View style={styles.cashfreeFailedBadge}>
                      <AlertCircle size={12} color={Colors.error} />
                      <Text style={styles.cashfreeFailedBadgeText}>Cashfree: Failed</Text>
                    </View>
                  ) : (
                    <View style={styles.cashfreeNotOnboardedBadge}>
                      <AlertCircle size={12} color={Colors.textLight} />
                      <Text style={styles.cashfreeNotOnboardedBadgeText}>Cashfree: Not Onboarded</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.ownerActions}>
                {(!owner.cashfreeVendorId || owner.cashfreeVendorStatus === 'FAILED') ? (
                  <TouchableOpacity
                    style={[styles.iconButton, styles.cashfreeButton]}
                    onPress={() => onboardOwnerWithCashfree(owner)}
                    disabled={registering === owner.id}
                  >
                    {registering === owner.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Wallet size={16} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.iconButton, { backgroundColor: '#E0F2FE' }]}
                    onPress={() => syncCashfreeStatus(owner)}
                    disabled={syncing === owner.id}
                  >
                    {syncing === owner.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <RefreshCw size={14} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => editOwner(owner)}
                  disabled={loading}
                >
                  <Edit2 size={16} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButton, styles.deleteButton]}
                  onPress={() => deleteOwner(owner.id, owner.name)}
                  disabled={loading}
                >
                  <Trash2 size={16} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Details */}
            <View style={styles.ownerDetails}>
              <View style={styles.detailItem}>
                <Phone size={16} color={Colors.primary} />
                <Text style={styles.detailText}>{owner.phoneNumber}</Text>
              </View>

              {owner.ownerReferralCode && (
                <View style={styles.detailItem}>
                  <Award size={16} color={Colors.primary} />
                  <Text style={styles.detailText}>
                    Code: {owner.ownerReferralCode}
                    {owner.freeAppointmentCredits > 0 ? ` · ${owner.freeAppointmentCredits} free credits` : ''}
                  </Text>
                </View>
              )}

              {owner.email && (
                <View style={styles.detailItem}>
                  <User size={16} color={Colors.primary} />
                  <Text style={styles.detailText}>Email: {owner.email}</Text>
                </View>
              )}

              {owner.bankAccountNumber && (
                <>
                  <View style={styles.detailItem}>
                    <CreditCard size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>
                      Account: ••••{owner.bankAccountNumber.slice(-4)}
                    </Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Building size={16} color={Colors.primary} />
                    <Text style={styles.detailText}>IFSC: {owner.bankIfscCode}</Text>
                  </View>

                  {owner.bankAccountName && (
                    <View style={styles.detailItem}>
                      <FileText size={16} color={Colors.primary} />
                      <Text style={styles.detailText}>Bank: {owner.bankAccountName}</Text>
                    </View>
                  )}
                </>
              )}

              <View style={styles.detailItem}>
                <Calendar size={16} color={Colors.primary} />
                <Text style={styles.detailText}>Joined: {formatDate(owner.createdAt)}</Text>
              </View>

              {(!owner.cashfreeVendorId || owner.cashfreeVendorStatus === 'FAILED') && owner.bankAccountNumber && (
                <TouchableOpacity
                  style={styles.registrationPrompt}
                  onPress={() => onboardOwnerWithCashfree(owner)}
                  disabled={registering === owner.id}
                >
                  <AlertCircle size={14} color={Colors.warning} />
                  <Text style={styles.registrationPromptText}>
                    {registering === owner.id ? 'Connecting with Cashfree...' : 'Register with Cashfree for automatic 90% payouts'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  successText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: Colors.success,
    marginLeft: 8,
    flex: 1,
  },
  formContainer: {
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
  authInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  authInfoText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
    marginLeft: 8,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginTop: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
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
  referralHint: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 6,
    lineHeight: 15,
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
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  formButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 100,
  },
  buttonDisabled: {
    opacity: 0.6,
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
    marginLeft: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    marginLeft: 8,
  },
  noDataText: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 40,
  },
  ownerCard: {
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
  ownerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ownerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  ownerInfo: {
    flex: 1,
  },
  ownerName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 4,
  },
  badgesContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  authBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.primary}20`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  authBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
    marginLeft: 4,
  },
  cashfreeActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.success}20`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  cashfreeActiveBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.success,
    marginLeft: 4,
  },
  cashfreePendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.warning}20`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  cashfreePendingBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.warning,
    marginLeft: 4,
  },
  cashfreeFailedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.error}20`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  cashfreeFailedBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.error,
    marginLeft: 4,
  },
  cashfreeNotOnboardedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEEEEE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  cashfreeNotOnboardedBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-Medium',
    color: Colors.textLight,
    marginLeft: 4,
  },
  ownerActions: {
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
  cashfreeButton: {
    backgroundColor: '#E8F5E9',
  },
  deleteButton: {
    backgroundColor: Colors.errorLight,
  },
  ownerDetails: {
    gap: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginLeft: 8,
    flex: 1,
  },
  registrationPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.warning}20`,
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  registrationPromptText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.warning,
    marginLeft: 8,
    flex: 1,
  },
});