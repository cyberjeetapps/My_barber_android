import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native'; // navigation hook
import Ionicons from 'react-native-vector-icons/Ionicons'; // arrow icon
import { auth, db } from '@/config/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
} from 'firebase/firestore';
import Colors from '@/constants/Colors';

export default function CreateAdminScreen() {
  const navigation = useNavigation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [admins, setAdmins] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  const fetchAdmins = async () => {
    setLoadingAdmins(true);
    try {
      const q = query(collection(db, 'admins'));
      const querySnapshot = await getDocs(q);
      const adminList: any[] = [];
      querySnapshot.forEach((doc) => {
        adminList.push({ id: doc.id, ...(doc.data() as any) });
      });
      setAdmins(adminList);
    } catch (error) {
      console.error('Error fetching admins:', error);
      Alert.alert('Error', 'Failed to load admins');
    } finally {
      setLoadingAdmins(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleCreateAdmin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const newUser = userCredential.user;

      await setDoc(doc(db, 'admins', newUser.uid), {
        uid: newUser.uid,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        role: 'admin',
      });

      Alert.alert('Success', 'New admin created successfully');
      setEmail('');
      setPassword('');
      fetchAdmins(); // Refresh admin list
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.message || 'Failed to create admin');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this admin?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'admins', adminId));
              Alert.alert('Deleted', 'Admin deleted successfully');
              fetchAdmins();
            } catch (error) {
              console.error('Error deleting admin:', error);
              Alert.alert('Error', 'Failed to delete admin');
            }
          },
        },
      ]
    );
  };

  const renderAdminItem = ({ item }: { item: any }) => (
    <View style={styles.adminRow}>
      <Text style={styles.adminEmail}>{item.email}</Text>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteAdmin(item.id)}
        activeOpacity={0.7}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header with back arrow and title */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={28} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Create New Admin</Text>
        <View style={{ width: 28 }} /> {/* spacer for symmetry */}
      </View>

      <Text style={styles.label}>Admin Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="Enter admin email"
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.label}>Admin Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Enter admin password"
        placeholderTextColor="#9ca3af"
      />
      <View style={styles.buttonContainer}>
        <Button
          title={loading ? 'Creating...' : 'Create Admin'}
          onPress={handleCreateAdmin}
          disabled={loading}
        />
      </View>

      <Text style={styles.listTitle}>Existing Admins</Text>

      {loadingAdmins ? (
        <ActivityIndicator
          size="large"
          color={Colors.primary}
          style={{ marginTop: 20 }}
        />
      ) : (
        <FlatList
          data={admins}
          keyExtractor={(item) => item.id}
          renderItem={renderAdminItem}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No admins found.</Text>
          }
          style={styles.adminList}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 40,
  },
  backButton: {
    padding: 6,
    marginRight: 12,
    borderRadius: 8,
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    fontFamily: 'System',
  },
  label: {
    fontSize: 18,
    marginBottom: 8,
    marginTop: 24,
    color: '#374151',
    fontWeight: '600',
  },
  input: {
    borderColor: '#d1d5db',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    color: '#111827',
  },
  listTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 48,
    marginBottom: 16,
    color: '#111827',
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
    paddingBottom: 4,
  },
  adminList: {
    flexGrow: 0,
  },
  adminRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  adminEmail: {
    fontSize: 17,
    color: '#1f2937',
    fontWeight: '500',
    maxWidth: '75%',
  },
  deleteButton: {
    backgroundColor: Colors.error,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    shadowColor: Colors.error,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.7,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 36,
    fontSize: 18,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  buttonContainer: {
    marginTop: 30,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: Colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
