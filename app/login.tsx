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
  useWindowDimensions,
  Linking,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import { CircleAlert as AlertCircle, User, Phone, CheckSquare, Square, X, ExternalLink } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Picker } from '@react-native-picker/picker';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { haptics } from '@/utils/haptics';

const { height, width } = Dimensions.get('window');

// Check if screen is small
const isSmallScreen = height <= 667; // iPhone SE, 6/7/8 height

// Predefined test numbers that will bypass SMS verification
const TEST_NUMBERS = [
  "+911234567890",
  "+919876543210",
  "+911111111111",
  "+919080099127"
];

export default function Signup() {
  // Recomputed on every render (rotation, split-screen, browser resize) instead of
  // the frozen value from Dimensions.get('window') at module load time.
  const { height: liveHeight } = useWindowDimensions();
  const isSmallScreen = liveHeight <= 667;
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    gender: '',
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
  const [isLoading, setIsLoading] = useState(false);
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

  // Register push token for user
  const registerUserPushToken = async (uid: string) => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permissions not granted for user');
        return;
      }

      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: "dc3f6516-1f4d-4314-a201-674acfa67484",
      })).data;

      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        console.log('❌ Cannot register push token, user document not found');
        return;
      }

      const userData = userSnap.data();

      await setDoc(doc(db, 'pushTokens', uid), {
        uid,
        token,
        role: 'user',
        createdAt: new Date().toISOString(),
        platform: Platform.OS,
        userName: userData.name || '',
        phoneNumber: userData.phoneNumber || '',
        gender: userData.gender || '',
      });

      console.log('✅ Push token saved for user:', { uid, token });
    } catch (e) {
      console.error('❌ Error registering user push token:', e);
    }
  };

  // Check for existing session on component mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await safeStore.getItem('user_session');

        if (session) {
          const { uid, phoneNumber } = JSON.parse(session);
          const email = `${phoneNumber}@twilio.user`;
          const password = phoneNumber;

          // Silent sign in
          const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password
          );
          const user = userCredential.user;

          // Get user data from Firestore
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            setUser({
              ...user,
              ...userData,
              role: 'user',
            } as any);

            // Register push token
            await registerUserPushToken(user.uid);

            // Redirect to dashboard
            router.replace('/(tabs)');
          }
        }
      } catch (error) {
        console.log('No existing session found');
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  // Handle duplicate account creation and login
  const handleDuplicateAccountLogin = async (phoneNumber: string) => {
    try {
      setLoading(true);
      setError('');

      // Create consistent credentials for duplicate account
      const email = `${phoneNumber}@duplicate.user`;
      const password = `${phoneNumber.substring(phoneNumber.length - 4)}1234`; // Last 4 digits + 1234

      // Try to sign in or create account
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (signInError) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      }

      const user = userCredential.user;
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      // Create/update user profile
      const userData = {
        name: formData.name || "Test User",
        phoneNumber: phoneNumber,
        gender: formData.gender || "Other",
        lastLogin: new Date().toISOString(),
        isLoggedIn: true,
        isTestAccount: true, // Mark as test account
      };

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          ...userData,
          createdAt: new Date().toISOString(),
        });
      } else {
        await updateDoc(userRef, userData);
      }

      // Register push token
      await registerUserPushToken(user.uid);

      // Save persistent session to SecureStore
      await safeStore.setItem('user_session', JSON.stringify({
        uid: user.uid,
        phoneNumber: phoneNumber,
        lastLogin: new Date().toISOString(),
        isTestAccount: true,
      })
      );

      // Update auth context and redirect
      const profileData = (await getDoc(userRef)).data();
      const updatedUser = {
        ...user,
        ...profileData,
        role: 'user',
      };

      setUser(updatedUser);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(`Duplicate account error: ${err.message}`);
      console.error('Duplicate account error:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateFormField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'phoneNumber') setPhoneError('');
    if (field === 'name' || field === 'gender') setError('');
  };

  const validateForm = () => {
    if (!formData.name || !formData.phoneNumber || !formData.gender) {
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

  const handleSendCode = async () => {
    if (!validateForm()) return;
    haptics.press();

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

      // Normal SMS verification flow
      const sendVerification = httpsCallable(functions, 'sendTwilioVerificationCode');
      await sendVerification({ phoneNumber: formattedPhone });

      haptics.success();
      setShowVerification(true);
    } catch (err: any) {
      haptics.error();
      console.error('Send code error:', err);
      setError(err.message || 'Error sending verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode) {
      setError('Please enter the verification code');
      return;
    }

    // Check for duplicate account OTP bypass
    if (verificationCode === "140725") {
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

      // 1. Verify the Twilio code
      const verify = httpsCallable(functions, 'verifyTwilioCode');
      await verify({
        phoneNumber: formattedPhone,
        code: verificationCode,
      });

      const email = `${formattedPhone}@twilio.user`;
      const password = formattedPhone;

      // 2. Sign in or create user
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (signInError) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      }

      const user = userCredential.user;
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      // 3. Create/update user profile
      const userData = {
        name: formData.name,
        phoneNumber: formattedPhone,
        gender: formData.gender,
        lastLogin: new Date().toISOString(),
        isLoggedIn: true,
      };

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          ...userData,
          createdAt: new Date().toISOString(),
        });
      } else {
        await updateDoc(userRef, userData);
      }

      // 4. Register push token
      await registerUserPushToken(user.uid);

      // 5. Save persistent session to SecureStore
      await SecureStore.setItemAsync(
        'user_session',
        JSON.stringify({
          uid: user.uid,
          phoneNumber: formattedPhone,
          lastLogin: new Date().toISOString(),
        })
      ).catch((error) => {
        console.error('SecureStore setItemAsync error:', error);
      });

      // 6. Update auth context and redirect
      const profileData = (await getDoc(userRef)).data();
      const updatedUser = {
        ...user,
        ...profileData,
        role: 'user',
      };

      setUser(updatedUser);
      haptics.success();
      router.replace('/(tabs)');
    } catch (err: any) {
      haptics.error();
      let errorMessage = 'Verification failed';

      if (err.message.includes('not-found') || err.message.includes('expired')) {
        errorMessage = 'Code expired - please request a new one';
      } else if (err.message.includes('Invalid')) {
        errorMessage = 'Invalid code - please try again';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      console.error('Verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerLogin = () => {
    router.push('/owner/login');
  };

  if (isCheckingSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (user && user?.role === 'user') {
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
            { minHeight: liveHeight },
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
                ]}>Welcome!!</Text>
                <Text style={styles.brandTagline}>Connecting every Salon in India</Text>
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

                  <View style={styles.inputContainer}>
                    <User
                      size={20}
                      color={Colors.primary}
                      style={styles.inputIcon}
                    />
                    <Picker
                      selectedValue={formData.gender}
                      style={styles.input}
                      onValueChange={(itemValue) =>
                        updateFormField('gender', itemValue)
                      }
                      enabled={!loading}
                    >
                      <Picker.Item label="Select Gender" value="" />
                      <Picker.Item label="Male" value="Male" />
                      <Picker.Item label="Female" value="Female" />
                      <Picker.Item label="Other" value="Other" />
                    </Picker>
                  </View>
                  {error && !formData.gender ? (
                    <Text style={styles.errorText}>Gender is required</Text>
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

              {error ? (
                <View style={styles.errorContainer}>
                  <AlertCircle size={20} color={Colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.termsCheckboxContainer}
                onPress={() => {
                  if (!agreedToTerms) {
                    setShowTermsModal(true);
                  } else {
                    setAgreedToTerms(false);
                  }
                }}
                activeOpacity={0.7}
              >
                {agreedToTerms ? (
                  <CheckSquare size={20} color={Colors.primary} />
                ) : (
                  <Square size={20} color={Colors.textLight} />
                )}
                <Text style={styles.termsDisclosure}>
                  I accept the Privacy Policy & Agreement of Groomzy Technologies.{' '}
                  <Text
                    style={styles.termsLink}
                    onPress={() => setShowTermsModal(true)}
                    accessibilityRole="link"
                  >
                    View Agreement
                  </Text>
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, (!agreedToTerms) && { opacity: 0.5 }]}
                onPress={showVerification ? handleVerifyCode : handleSendCode}
                disabled={loading || !agreedToTerms}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.buttonText}>
                    {showVerification ? 'Verify Code' : 'Send Code'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Owner Login Link */}
              <TouchableOpacity
                style={styles.ownerLoginButton}
                onPress={handleOwnerLogin}
                disabled={loading}
              >
                <Text style={styles.ownerLoginText}>
                  Are you a barber? Login here
                </Text>
              </TouchableOpacity>

              {showVerification ? (
                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={handleSendCode}
                  disabled={loading}
                >
                  <Text style={styles.resendText}>Resend Code</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Groomzy Technologies Pvt. Ltd.
                </Text>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Terms Modal */}
      <Modal
        visible={showTermsModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={[styles.container, { backgroundColor: Colors.background, paddingTop: 40 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}>
            <TouchableOpacity onPress={() => setShowTermsModal(false)} style={{ padding: 4 }}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={{ color: Colors.primary, fontSize: 18, fontFamily: 'Poppins-Bold', marginLeft: 16 }}>
              Privacy Policy & Agreement
            </Text>
          </View>
          <ScrollView style={{ flex: 1, padding: 20 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}
              onPress={() => Linking.openURL('https://www.groomzytechnologies.co.in/terms')}
              activeOpacity={0.7}
            >
              <ExternalLink size={16} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={{ color: Colors.primary, fontSize: 14, textDecorationLine: 'underline' }}>
                View full Terms — groomzytechnologies.co.in/terms
              </Text>
            </TouchableOpacity>
            <Text style={{ color: Colors.textLight, fontSize: 14, lineHeight: 22, fontFamily: 'Poppins-Regular', marginBottom: 20 }}>
              1. Bookings are confirmed only once payment or a valid time slot reservation is completed.{"\n\n"}
              2. Please arrive on time; slots may be released after a short grace period if you are late.{"\n\n"}
              3. Cancellations or rescheduling should be done as early as possible so the slot can be offered to others.{"\n\n"}
              4. Prices, service duration and offers are subject to change without prior notice and may vary by shop.{"\n\n"}
              5. Family bookings must be for members physically present at the time of the appointment.{"\n\n"}
              6. The salon/shop is not responsible for any allergic reactions to products; please inform staff of any sensitivities beforehand.{"\n\n"}
              7. By booking, you consent to receive booking-related notifications via app, SMS and WhatsApp.{"\n\n"}
              For the complete, up-to-date Terms & Conditions, please see the link above.
            </Text>
            <View style={{ paddingVertical: 20, paddingBottom: 40, borderTopWidth: 1, borderTopColor: '#2A2A2A' }}>
              <TouchableOpacity
                style={{ backgroundColor: Colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' }}
                onPress={() => {
                  if (!agreedToTerms) {
                    setAgreedToTerms(true);
                  }
                  setShowTermsModal(false);
                }}
              >
                <Text style={{ color: '#FFF', fontSize: 16, fontFamily: 'Poppins-SemiBold' }}>
                  {!agreedToTerms ? 'I Agree' : 'Close'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: -0,
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
  brandTagline: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight || '#888',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
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
  smallScreenTitle: {
    fontSize: 24,
  },
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
  termsCheckboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  termsDisclosure: { fontSize: 12, color: Colors.textLight, lineHeight: 18, marginLeft: 12, flex: 1 },
  termsLink: { color: Colors.primary, textDecorationLine: 'underline', fontFamily: 'Poppins-Medium' },
  ownerLoginButton: {
    marginTop: 12,
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 10,
  },
  ownerLoginText: {
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