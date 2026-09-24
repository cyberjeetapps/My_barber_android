import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { auth, db } from '@/config/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [savingLoading, setSavingLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',

    age: '',
    Email: '',
    address: '',
  });

  useEffect(() => {
    const fetchUserData = async () => {
      if (!auth.currentUser?.uid) return;
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        const userData = docSnap.data();
        setFormData({
          name: userData.name || '',
          phoneNumber: userData.phoneNumber || '',
          age: userData.age || '',
          Email: userData.Email || '',
          address: userData.address || '',
        });
      }
    };

    fetchUserData();
  }, []);

  const handleInputChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Live email validation
    if (name === 'Email') {
      if (!validateEmail(value)) {
        setEmailError('Please enter a valid email address.');
      } else {
        setEmailError('');
      }
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSave = async () => {
    if (!auth.currentUser?.uid) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    if (!validateEmail(formData.Email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    setSavingLoading(true);

    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await setDoc(userRef, formData, { merge: true });
      Alert.alert('Success', 'Your information has been updated.');
      router.back();
    } catch (error) {
      console.error('Error saving data:', error);
      Alert.alert('Error', 'Failed to update information. Please try again.');
    } finally {
      setSavingLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.headerContainer, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <Text style={styles.header}>Edit Personal Information</Text>
        <Text style={styles.helperIntro}>
          These details are shown to salons when you book, so keep them accurate.
        </Text>

        <View style={styles.form}>
          {/* Name */}
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={[styles.input, styles.inputLocked]}
            value={formData.name}
            placeholder="Your full name"
            placeholderTextColor={Colors.textLight || '#999'}
            editable={false}
          />
          <Text style={styles.hintText}>
            Locked for verification — contact support to change your name.
          </Text>

          {/* Phone Number */}
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={[styles.input, styles.inputLocked]}
            value={formData.phoneNumber}
            placeholder="e.g. +91 98765 43210"
            placeholderTextColor={Colors.textLight || '#999'}
            editable={false}
            keyboardType="phone-pad"
          />
          <Text style={styles.hintText}>
            This is your login number, so it can't be edited here.
          </Text>

          {/* Email */}
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            value={formData.Email}
            onChangeText={(text) => handleInputChange('Email', text)}
            placeholder="e.g. yourname@example.com"
            placeholderTextColor={Colors.textLight || '#999'}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {emailError ? (
            <Text style={styles.errorText}>{emailError}</Text>
          ) : (
            <Text style={styles.hintText}>
              Booking confirmations and receipts go here.
            </Text>
          )}

          {/* Address */}
          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={formData.address}
            onChangeText={(text) => handleInputChange('address', text)}
            placeholder="House/flat no., street, area, city"
            placeholderTextColor={Colors.textLight || '#999'}
            multiline
          />
          <Text style={styles.hintText}>
            Helps us suggest salons closer to you.
          </Text>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, savingLoading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={savingLoading}
          >
            {savingLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerContainer: {
    paddingHorizontal: 20,
  },
  backIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContainer: {
    padding: 20,
    paddingTop: 0,
    paddingBottom: 60,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    marginTop: 10,
    color: Colors.text,
  },
  helperIntro: {
    fontSize: 13,
    color: Colors.textLight || '#888',
    marginBottom: 20,
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  input: {
    height: 45,
    borderColor: Colors.border || '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 6,
    paddingHorizontal: 10,
    fontSize: 16,
    backgroundColor: Colors.cardBackground || '#fff',
    color: Colors.text,
  },
  inputLocked: {
    backgroundColor: Colors.backgroundLight || '#f2f2f2',
    color: Colors.textLight || '#888',
  },
  inputError: {
    borderColor: 'red',
  },
  hintText: {
    fontSize: 12,
    color: Colors.textLight || '#999',
    marginBottom: 14,
    marginTop: -2,
  },
  errorText: {
    color: 'red',
    marginTop: -4,
    marginBottom: 12,
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    backgroundColor: Colors.backgroundLight,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 100,
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.primary,
  },
});
