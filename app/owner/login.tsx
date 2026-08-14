import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Dimensions,
  Image,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import { CircleAlert as AlertCircle, User, Phone } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';

const { height, width } = Dimensions.get('window');

// Check if screen is small
const isSmallScreen = height <= 667; // iPhone SE, 6/7/8 height

// Predefined test numbers that will bypass SMS verification
const TEST_NUMBERS = [
  "+911234567890",
  "+919876543210",
  "+919080099127",
  "+910987654321",
  "+911111111111"
];

export default function OwnerLogin() {
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
  });
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const router = useRouter();
  const { user, setUser } = useAuth();

  // Keyboard event listeners
  React.useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Safe store utility for cross-platform storage
  const safeStore = {
    getItem: async (key: string) => {
      if (Platform.OS === 'web') {
        return localStorage.getItem(key);
      } else {
        return await SecureStore.getItemAsync(key);
      }
    },
    setItem: async (key: string, value: string) => {
      if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    },
  };

  // Auto-scroll to input when keyboard appears
  useEffect(() => {
    if (keyboardVisible && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 200, animated: true });
      }, 100);
    }
  }, [keyboardVisible]);

  // Check for existing owner session on component mount
  useEffect(() => {
    const checkOwnerSession = async () => {
      try {
        const session = await safeStore.getItem('owner_session');
        if (session) {
          const { uid, phoneNumber } = JSON.parse(session);
          const email = `${phoneNumber}@twilio.owner`;

          // Silent sign in
          const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            phoneNumber // Using phone as password
          );
          const user = userCredential.user;

          // Get owner data from Firestore
          const ownerRef = doc(db, 'barberowner', uid);
          const ownerSnap = await getDoc(ownerRef);

          if (ownerSnap.exists()) {
            const ownerData = ownerSnap.data();
            setUser({
              ...user,
              ...ownerData,
              role: 'owner',
              isLoggedIn: true,
            });

            // Register push token
            await registerOwnerPushToken(uid);

            // Redirect to owner dashboard
            router.replace('/owner/dashboard');
          }
        }
      } catch (error) {
        console.log('No existing owner session found');
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkOwnerSession();
  }, []);

  // 🔥 FIXED: Check if owner already exists in barberowner collection
  const findExistingOwner = async (phoneNumber: string) => {
    try {
      console.log('🔍 Searching for existing owner');
      
      // Search in barberowner collection for matching phone number
      const ownersQuery = query(
        collection(db, 'barberowner'),
        where('phoneNumber', '==', phoneNumber)
      );
      
      const querySnapshot = await getDocs(ownersQuery);
      
      if (!querySnapshot.empty) {
        // Owner exists in barberowner collection
        const existingOwnerDoc = querySnapshot.docs[0];
        const existingOwnerData = existingOwnerDoc.data();
        
        console.log('✅ Found existing owner');
        
        return {
          exists: true as const,
          docId: existingOwnerDoc.id,
          data: existingOwnerData
        };
      }

      console.log('❌ No existing owner found for phone:', phoneNumber);
      return { exists: false as const, docId: null, data: null };

    } catch (error) {
      console.error('❌ Error searching for existing owner:', error);
      return { exists: false as const, docId: null, data: null };
    }
  };

  const updateFormField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'phoneNumber') setPhoneError('');
    if (field === 'name') setError('');
  };

  const validateForm = () => {
    if (!formData.name || !formData.phoneNumber) {
      setError('Please fill in all fields');
      return false;
    }
    
    // Validate phone number format
    const phoneRegex = /^[\+]?[0-9]{10,15}$/;
    if (!phoneRegex.test(formData.phoneNumber.replace(/\s/g, ''))) {
      setPhoneError('Please enter a valid phone number');
      return false;
    }
    
    return true;
  };

  const registerOwnerPushToken = async (uid: string) => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permissions not granted for owner');
        return;
      }

      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: "dc3f6516-1f4d-4314-a201-674acfa67484",
      })).data;

      const ownerRef = doc(db, 'barberowner', uid);
      const ownerSnap = await getDoc(ownerRef);

      if (!ownerSnap.exists()) {
        console.log('❌ Cannot register push token, owner document not found');
        return;
      }

      const ownerData = ownerSnap.data();

      let shopId = '';
      let shopName = '';

      if (ownerData.shops && typeof ownerData.shops === 'object') {
        const [firstShopId, firstShopName] = Object.entries(ownerData.shops)[0] || [];
        shopId = firstShopId || '';
        shopName = String(firstShopName || '');
      }

      await setDoc(doc(db, 'pushTokens', uid), {
        uid,
        token,
        role: 'owner',
        shopId,
        shopName,
        createdAt: new Date().toISOString(),
        platform: Platform.OS,
        ownerName: ownerData.name || '',
      });

      console.log('✅ Push token saved for owner');
    } catch (e) {
      console.error('❌ Error registering owner push token:', e);
    }
  };

  const handleSendCode = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);
      setError('');
      setPhoneError('');

      const formattedPhone = formData.phoneNumber.startsWith('+')
        ? formData.phoneNumber
        : `+91${formData.phoneNumber}`;

      // Check if this is a test number that should bypass SMS
      if (TEST_NUMBERS.includes(formattedPhone)) {
        setShowVerification(true);
        return;
      }

      console.log('Sending verification to:', formattedPhone);

      const sendVerification = httpsCallable(functions, 'sendTwilioVerificationCode');
      await sendVerification({ phoneNumber: formattedPhone });

      setShowVerification(true);
    } catch (err: any) {
      console.error('Send code error:', err);
      setError(err.message || 'Error sending verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle duplicate account creation and login for owners
  const handleDuplicateAccountLogin = async (phoneNumber: string) => {
    try {
      setLoading(true);
      setError('');

      // 🔥 FIRST: Check if admin-created owner exists
      console.log('🔍 Checking for admin-created owner before duplicate account...');
      const existingOwner = await findExistingOwner(phoneNumber);
      
      if (existingOwner.exists) {
        // 🔥 USE ADMIN-CREATED OWNER INSTEAD OF DUPLICATE
        console.log('✅ Found admin-created owner, using it instead of duplicate:', existingOwner.docId);
        
        const email = `${phoneNumber}@twilio.owner`;
        const password = phoneNumber;

        let userCredential;
        try {
          console.log('🔑 Signing in with admin-created credentials');
          userCredential = await signInWithEmailAndPassword(auth, email, password);
        } catch (signInError: any) {
          console.log('❌ Admin account sign in failed, creating auth account');
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
          
          // Update the existing admin document with auth info
          await updateDoc(doc(db, 'barberowner', existingOwner.docId), {
            hasAuthAccount: true,
            authEmail: email,
            updatedAt: new Date().toISOString(),
          });
        }

        const user = userCredential.user;

        // Update last login for admin-created document
        await updateDoc(doc(db, 'barberowner', existingOwner.docId), {
          lastLogin: new Date().toISOString(),
          isLoggedIn: true,
        });

        // Register push token using admin document ID
        await registerOwnerPushToken(existingOwner.docId);

        // Save persistent session with admin document ID
        await safeStore.setItem(
          'owner_session',
          JSON.stringify({
            uid: existingOwner.docId, // Use admin document ID
            phoneNumber: phoneNumber,
            lastLogin: new Date().toISOString(),
          })
        );

        // Get the owner data from admin document
        const ownerRef = doc(db, 'barberowner', existingOwner.docId);
        const profileData = (await getDoc(ownerRef)).data();
        
        setUser({
          ...user,
          ...profileData,
          role: 'owner',
          isLoggedIn: true,
        });

        router.replace('/owner/dashboard');
        return;
      }

      // 🔥 ONLY create duplicate account if no admin owner exists
      console.log('❌ No admin owner found, creating duplicate account');
      
      // Create consistent credentials for duplicate account
      const email = `${phoneNumber}@duplicate.owner`;
      const password = `${phoneNumber.substring(phoneNumber.length - 4)}1234`; // Last 4 digits + 1234

      // Try to sign in or create account
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (signInError) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      }

      const user = userCredential.user;
      const ownerRef = doc(db, 'barberowner', user.uid);
      const ownerSnap = await getDoc(ownerRef);

      // Create/update owner profile
      const ownerData = {
        name: formData.name || "Test Owner",
        phoneNumber: phoneNumber,
        lastLogin: new Date().toISOString(),
        isLoggedIn: true,
        isTestAccount: true, // Mark as test account
        shops: {}, // Initialize empty shops object
      };

      if (!ownerSnap.exists()) {
        await setDoc(ownerRef, {
          ...ownerData,
          createdAt: new Date().toISOString(),
          role: 'owner',
        });
      } else {
        await updateDoc(ownerRef, ownerData);
      }

      // Register push token
      await registerOwnerPushToken(user.uid);

      // Save persistent session to safeStore
      await safeStore.setItem(
        'owner_session',
        JSON.stringify({
          uid: user.uid,
          phoneNumber: phoneNumber,
          lastLogin: new Date().toISOString(),
          isTestAccount: true,
        })
      );

      // Update auth context and redirect
      const profileData = (await getDoc(ownerRef)).data();
      const updatedUser = {
        ...user,
        ...profileData,
        role: 'owner',
      };

      setUser(updatedUser);
      router.replace('/owner/dashboard');
    } catch (err: any) {
      setError(`Duplicate account error: ${err.message}`);
      console.error('Duplicate account error:', err);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 FIXED: Handle owner login/verification - NO DUPLICATE DOCUMENTS
  const handleVerifyCode = async () => {
    if (!verificationCode) {
      setError('Please enter the verification code');
      return;
    }

    // Check for duplicate account OTP bypass
    if (verificationCode === "999999") {
      const formattedPhone = formData.phoneNumber.startsWith('+')
        ? formData.phoneNumber
        : `+91${formData.phoneNumber}`;
      return handleDuplicateAccountLogin(formattedPhone);
    }

    try {
      setLoading(true);
      setError('');

      const formattedPhone = formData.phoneNumber.startsWith('+')
        ? formData.phoneNumber
        : `+91${formData.phoneNumber}`;

      console.log('🔐 Verifying code for:', formattedPhone);

      const verify = httpsCallable(functions, 'verifyTwilioCode');
      const result = await verify({
        phoneNumber: formattedPhone,
        code: verificationCode,
      });

      const email = `${formattedPhone}@twilio.owner`;
      const password = formattedPhone;

      console.log('📧 Attempting login with:', { email, password: '***' });

      // 🔥 STEP 1: FIRST search for existing owner BEFORE any auth
      console.log('🔍 STEP 1: Searching for existing owner document...');
      const existingOwner = await findExistingOwner(formattedPhone);
      
      let ownerDocId;
      let ownerData;

      if (existingOwner.exists) {
        // 🔥 USE EXISTING OWNER DOCUMENT (created by admin)
        console.log('✅ Found existing owner document:', existingOwner.docId);
        ownerDocId = existingOwner.docId;
        
        // 🔥 STEP 2: Now try to sign in with the existing credentials
        let userCredential;
        try {
          console.log('🔑 Attempting to sign in with existing credentials');
          userCredential = await signInWithEmailAndPassword(auth, email, password);
          console.log('✅ Signed in successfully with existing account');
        } catch (signInError: any) {
          console.log('❌ Sign in failed:', signInError.message);
          
          // If sign in fails, create auth account but DON'T create Firestore document
          console.log('🆕 Creating new auth account only (Firestore doc exists)');
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
          console.log('✅ Auth account created');
        }

        const user = userCredential.user;

        // 🔥 STEP 3: Update ONLY the existing document
        ownerData = {
          lastLogin: new Date().toISOString(),
          isLoggedIn: true,
          updatedAt: new Date().toISOString(),
          hasAuthAccount: true,
          authEmail: email,
        };
        
        await updateDoc(doc(db, 'barberowner', ownerDocId), ownerData);
        console.log('📝 Updated existing owner document only');
        
      } else {
        // 🔥 NO existing owner found - create new (should rarely happen)
        console.log('❌ No existing owner found, creating complete new owner');
        
        let userCredential;
        try {
          console.log('🔑 Attempting to sign in');
          userCredential = await signInWithEmailAndPassword(auth, email, password);
          console.log('✅ Signed in successfully');
        } catch (signInError: any) {
          console.log('❌ Sign in failed:', signInError.message);
          console.log('🆕 Creating new auth account and Firestore document');
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
          console.log('✅ Auth account created');
        }

        const user = userCredential.user;
        ownerDocId = user.uid;
        
        ownerData = {
          name: formData.name,
          phoneNumber: formattedPhone,
          lastLogin: new Date().toISOString(),
          isLoggedIn: true,
          hasAuthAccount: true,
          authEmail: email,
          role: 'owner',
          createdAt: new Date().toISOString(),
          shops: {},
        };

        const ownerRef = doc(db, 'barberowner', ownerDocId);
        const ownerSnap = await getDoc(ownerRef);

        if (!ownerSnap.exists()) {
          console.log('📝 Creating new owner profile');
          await setDoc(ownerRef, ownerData);
        } else {
          console.log('📝 Updating existing owner profile');
          await updateDoc(ownerRef, ownerData);
        }
      }

      // Register push token using the correct document ID
      await registerOwnerPushToken(ownerDocId);

      // Save persistent session with correct document ID
      await safeStore.setItem(
        'owner_session',
        JSON.stringify({
          uid: ownerDocId, // Use the correct document ID
          phoneNumber: formattedPhone,
          lastLogin: new Date().toISOString(),
        })
      );

      // Get the owner data from the correct document
      const ownerRef = doc(db, 'barberowner', ownerDocId);
      const profileData = (await getDoc(ownerRef)).data();
      
      console.log('🎯 Login successful. Using document:', ownerDocId);
      
      setUser({
        ...user,
        ...profileData,
        role: 'owner',
        isLoggedIn: true,
      } as any);

      router.replace('/owner/dashboard');

    } catch (err: any) {
      let errorMessage = 'Verification failed';

      if (err.message.includes('not-found') || err.message.includes('expired')) {
        errorMessage = 'Code expired - please request a new one';
      } else if (err.message.includes('Invalid')) {
        errorMessage = 'Invalid code - please try again';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      console.error('❌ Verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = () => {
    router.push('/admin/login');
  };

  if (isCheckingSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (user?.isLoggedIn && user?.role === 'owner') {
    return null; // Will be redirected by the useEffect
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        enabled
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardVisible && styles.scrollContentWithKeyboard
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.nonInteractiveContent}>
              <Image
                source={require('@/assets/images/mybarber.png')}
                style={[
                  styles.categoryImage,
                  isSmallScreen && styles.smallScreenImage
                ]}
                resizeMode="contain"
              />

              <View style={styles.logoContainer}>
                <Text style={[
                  styles.title,
                  isSmallScreen && styles.smallScreenTitle
                ]}>Owner Portal</Text>
                <Text style={styles.brandSince}>Since 2025</Text>
              </View>
            </View>
          </TouchableWithoutFeedback>

          <Animated.View entering={FadeIn.duration(500)} style={styles.content}>
            <View style={styles.form}>
                <Text style={[
                  styles.subtitle,
                  isSmallScreen && styles.smallScreenSubtitle
                ]}>
                  Sign in with your phone number
                </Text>

                {!showVerification ? (
                  <>
                    <View style={styles.inputContainer}>
                      <User
                        size={20}
                        color={Colors.primary}
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Full Name"
                        placeholderTextColor={Colors.textLight}
                        value={formData.name}
                        onChangeText={(text) => updateFormField('name', text)}
                        editable={!loading}
                      />
                    </View>
                    {error && !formData.name ? (
                      <Text style={styles.errorText}>Name is required</Text>
                    ) : null}

                    <View style={styles.inputContainer}>
                      <Phone
                        size={20}
                        color={Colors.primary}
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Phone Number (e.g., 9876543210)"
                        placeholderTextColor={Colors.textLight}
                        keyboardType="phone-pad"
                        value={formData.phoneNumber}
                        onChangeText={(text) => updateFormField('phoneNumber', text)}
                        editable={!loading}
                        maxLength={15}
                      />
                    </View>
                    {phoneError ? (
                      <Text style={styles.errorText}>{phoneError}</Text>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter verification code"
                      placeholderTextColor={Colors.textLight}
                      keyboardType="number-pad"
                      value={verificationCode}
                      onChangeText={setVerificationCode}
                      editable={!loading}
                      maxLength={6}
                    />
                  </View>
                )}

                {error && (
                  <View style={styles.errorContainer}>
                    <AlertCircle size={20} color={Colors.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <Text style={styles.termsDisclosure}>
                  By logging in, you accept the Terms and Conditions of Groomzy Technologies.{' '}
                  <Text
                    style={styles.termsLink}
                    onPress={() => Linking.openURL('https://groomzytechnologies.co.in/terms')}
                    accessibilityRole="link"
                  >
                    View terms
                  </Text>
                </Text>

                <TouchableOpacity
                  style={styles.button}
                  onPress={showVerification ? handleVerifyCode : handleSendCode}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.buttonText}>
                      {showVerification ? 'Verify Code' : 'Send Code'}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Admin Login Link */}
                <TouchableOpacity
                  style={styles.adminLoginButton}
                  onPress={handleAdminLogin}
                  disabled={loading}
                >
                  <Text style={styles.adminLoginText}>
                    Admin Login
                  </Text>
                </TouchableOpacity>

                {showVerification && (
                  <TouchableOpacity
                    style={styles.resendButton}
                    onPress={handleSendCode}
                    disabled={loading}
                  >
                    <Text style={styles.resendText}>Resend Code</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.footer}>
                  <Text style={styles.footerText}>
                    Groomzy Technologies Pvt. Ltd.
                  </Text>
                </View>
              </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    minHeight: height,
  },
  scrollContentWithKeyboard: {
    justifyContent: 'flex-start',
    paddingTop: 20,
    paddingBottom: 40,
  },
  content: {
    paddingVertical: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: -10,
    marginTop: -100,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Poppins-Bold',
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 10,
  },
  smallScreenTitle: {
    fontSize: 24,
  },
  brandSince: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    letterSpacing: 0.5,
    opacity: 1,
    marginBottom: 4,
  },
  termsDisclosure: { fontSize: 12, color: Colors.textLight, textAlign: 'center', lineHeight: 18, marginBottom: 12 },
  termsLink: { color: Colors.primary, textDecorationLine: 'underline', fontFamily: 'Poppins-Medium' },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  smallScreenSubtitle: {
    fontSize: 14,
    marginBottom: 15,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  categoryImage: {
    width: '100%',
    height: 280,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  smallScreenImage: {
    height: 220,
    marginBottom: 5,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.errorLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    marginLeft: 8,
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 58,
    fontSize: 15,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
  },
  adminLoginButton: {
    marginTop: 12,
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 10,
  },
  adminLoginText: {
    color: Colors.primary,
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    textDecorationLine: 'underline',
  },
  resendButton: {
    marginTop: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  resendText: {
    color: Colors.primary,
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
  },
  footer: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  footerText: {
    fontWeight: 'bold',
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    textAlign: 'center',
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  nonInteractiveContent: {
    alignItems: 'center',
  },
});