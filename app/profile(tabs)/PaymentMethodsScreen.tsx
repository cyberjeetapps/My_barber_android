import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    phoneNumber: '',
    upiId: '',
  });

  const [showUpi, setShowUpi] = useState(false);

  const handleInputChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const maskUpi = (upi: string) => {
    if (!upi.includes('@')) return '********';
    const [user, domain] = upi.split('@');
    return `${'*'.repeat(user.length)}@${domain}`;
  };

  const handleSave = () => {
    Alert.alert('Success', 'Payment details saved successfully.');
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.header}>Payment Methods</Text>

      <TextInput
        style={styles.input}
        placeholder="Bank Name"
        value={formData.bankName}
        onChangeText={(text) => handleInputChange('bankName', text)}
      />
      <TextInput
        style={styles.input}
        placeholder="Account Number"
        value={formData.accountNumber}
        onChangeText={(text) => handleInputChange('accountNumber', text)}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        placeholder="IFSC Code"
        value={formData.ifscCode}
        onChangeText={(text) => handleInputChange('ifscCode', text)}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone Number"
        value={formData.phoneNumber}
        onChangeText={(text) => handleInputChange('phoneNumber', text)}
        keyboardType="phone-pad"
      />

      <TextInput
        style={styles.input}
        placeholder="UPI ID"
        value={showUpi ? formData.upiId : maskUpi(formData.upiId)}
        onChangeText={(text) => handleInputChange('upiId', text)}
        editable={showUpi} // only editable when visible
      />

      <TouchableOpacity
        onPress={() => setShowUpi(!showUpi)}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          {showUpi ? 'Hide UPI ID' : 'Show UPI ID'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.background,
  },
  headerContainer: {
    paddingTop: 50,
    paddingHorizontal: 0,
  },
  backIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    height: 45,
    borderColor: Colors.border || '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
    paddingHorizontal: 10,
    fontSize: 16,
    backgroundColor: Colors.cardBackground || '#fff',
    color: Colors.text,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  toggle: {
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  toggleText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
});
