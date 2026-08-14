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
  Image,
  ScrollView,
  Dimensions,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import Colors from '@/constants/Colors';
import { Lock, Mail, CircleAlert as AlertCircle } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useAuth } from '@/context/auth';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

const { height, width } = Dimensions.get('window');

// Check if screen is small
const isSmallScreen = height <= 667; // iPhone SE, 6/7/8 height

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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

  // Check for existing admin session on component mount
  useEffect(() => {
    const checkAdminSession = async () => {
      try {
        const session = await safeStore.getItem('admin_session');
        if (session) {
          const { uid, email } = JSON.parse(session);

          // Silent sign in
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          const user = userCredential.user;

          // Get admin data from Firestore
          const adminDoc = await getDoc(doc(db, 'admins', user.uid));
          
          if (adminDoc.exists()) {
            const adminData = adminDoc.data();
            setUser({
              ...user,
              ...adminData,
              role: 'admin',
            });

            // Register push token
            await registerAdminPushToken(user.uid);

            // Redirect to admin dashboard
            router.replace('/admin/dashboard');
          }
        }
      } catch (error) {
        console.log('No existing admin session found');
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkAdminSession();
  }, []);

  const registerAdminPushToken = async (uid: string) => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permissions not granted for admin');
        return;
      }

      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: "dc3f6516-1f4d-4314-a201-674acfa67484",
      })).data;

      const adminRef = doc(db, 'admins', uid);
      const adminSnap = await getDoc(adminRef);

      if (!adminSnap.exists()) {
        console.log('❌ Cannot register push token, admin document not found');
        return;
      }

      const adminData = adminSnap.data();

      await setDoc(doc(db, 'pushTokens', uid), {
        uid,
        token,
        role: 'admin',
        createdAt: new Date().toISOString(),
        platform: Platform.OS,
        adminName: adminData.name || '',
        adminEmail: adminData.email || '',
      });

      console.log('✅ Push token saved for admin:', { uid, token });
    } catch (e) {
      console.error('❌ Error registering admin push token:', e);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, 'admins', userCredential.user.uid));
      
      if (!userDoc.exists()) {
        throw new Error('Unauthorized access');
      }

      const adminData = userDoc.data();
      
      // Update auth context
      setUser({
        ...userCredential.user,
        ...adminData,
        role: 'admin',
      });

      // Register push token
      await registerAdminPushToken(userCredential.user.uid);

      // Save persistent session to safeStore
      await safeStore.setItem(
        'admin_session',
        JSON.stringify({
          uid: userCredential.user.uid,
          email: email,
          lastLogin: new Date().toISOString(),
        })
      );

      router.replace('/admin/dashboard');
    } catch (error: any) {
      let errorMessage = 'Invalid credentials or unauthorized access';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password';
      } else if (error.message) {
        errorMessage = error.message;
      }
      setError(errorMessage);
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

  if (user && user?.role === 'admin') {
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
                ]}>Admin Dashboard</Text>
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
                  Sign in to manage your business
                </Text>

                {error && (
                  <View style={styles.errorContainer}>
                    <AlertCircle size={20} color={Colors.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <View style={styles.inputContainer}>
                  <Mail 
                    size={20} 
                    color={Colors.primary} 
                    style={styles.inputIcon} 
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                    editable={!loading}
                    autoComplete="email"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Lock 
                    size={20} 
                    color={Colors.primary} 
                    style={styles.inputIcon} 
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={Colors.textLight}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    editable={!loading}
                    autoComplete="password"
                  />
                </View>

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
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.buttonText}>Login</Text>
                  )}
                </TouchableOpacity>

                {/* Owner Login Link */}
                <TouchableOpacity
                  style={styles.ownerLoginButton}
                  onPress={handleOwnerLogin}
                  disabled={loading}
                >
                  <Text style={styles.ownerLoginText}>
                    Are you an owner? Login here
                  </Text>
                </TouchableOpacity>

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