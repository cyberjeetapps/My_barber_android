import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Image } from 'expo-image'; // cached image loading + blur placeholder instead of RN's uncached Image
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import {
  LogOut,
  Bell,
  Shield,
  CircleHelp as HelpCircle,
  Settings,
  User,
  ChevronRight,
  Share2,
  ShoppingBag,
  GraduationCap,
  Wrench,
} from 'lucide-react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useLanguage } from '@/context/LanguageContext';
import * as SecureStore from 'expo-secure-store';
import Toast from 'react-native-toast-message';
import { useCategorySelection } from '@/hooks/useCategorySelection';
import { useFocusEffect } from '@react-navigation/native';
import { Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildReferralCode } from '@/utils/simpleCustomerFeatures';

// Simple fade component with proper Animated import
const FadeView = ({ children, delay = 0, style }: any) => {
  const opacity = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, delay);
    
    return () => {
      clearTimeout(timer);
      opacity.setValue(0);
    };
  }, [delay, opacity]);

  return (
    <Animated.View style={[style, { opacity }]}>
      {children}
    </Animated.View>
  );
};

export default function ProfileScreen() {
  const { user, setUser } = useAuth(); // Make sure setUser is destructured
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  
  const {
    gender: contextGender,
    categoryDisabled,
    handleGenderSelection,
  } = useCategorySelection();

  const [showCategoryServices, setShowCategoryServices] = useState(false);
  const [userInfo, setUserInfo] = useState({
    name: '',
    phoneNumber: '',
  });
  const [loading, setLoading] = useState(true);
  const [isComponentMounted, setIsComponentMounted] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  
  // Refs for cleanup
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountRef = useRef(true);

  // Component mount/unmount management
  useEffect(() => {
    mountRef.current = true;
    setIsComponentMounted(true);
    
    return () => {
      mountRef.current = false;
      setIsComponentMounted(false);
      
      // Cleanup all timeouts
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, []);

  // Safe state updates only when mounted
  const safeSetState = useCallback((updater: any) => {
    if (mountRef.current) {
      updater();
    }
  }, []);

  // Handle category selection with better cleanup
  const handleProfileGenderSelection = useCallback((gender: 'man' | 'woman' | 'unisex') => {
    if (categoryDisabled || !mountRef.current) return;
    
    console.log('Profile: Selecting gender:', gender);
    
    // Close the selection modal first
    safeSetState(() => setShowCategoryServices(false));
    
    // Small delay to ensure modal is closed before navigation
    selectionTimeoutRef.current = setTimeout(() => {
      if (mountRef.current) {
        handleGenderSelection(gender);
      }
    }, 100);
  }, [categoryDisabled, handleGenderSelection, safeSetState]);

  // Reset function to clear any stuck states
  const resetComponentState = useCallback(() => {
    if (!mountRef.current) return;
    
    console.log('Profile: Resetting component state');
    setShowCategoryServices(false);
    
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
      selectionTimeoutRef.current = null;
    }
  }, []);

  // Safe focus effect with cleanup
  useFocusEffect(
    useCallback(() => {
      if (!mountRef.current) return;
      
      console.log('Profile: Screen focused');
      resetComponentState();
      
      return () => {
        console.log('Profile: Screen unfocused');
        resetComponentState();
      };
    }, [resetComponentState])
  );

  // Handle component errors
  const handleComponentError = useCallback((error: Error) => {
    console.error('Profile Screen Error:', error);
    // Reset to safe state
    resetComponentState();
  }, [resetComponentState]);

  // Fetch user data
  useEffect(() => {
    if (!user?.uid || !mountRef.current) return;

    const fetchUserInfo = async () => {
      try {
        setLoading(true);
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && mountRef.current) {
          const data = docSnap.data();
          safeSetState(() => setUserInfo({
            name: data.name || '',
            phoneNumber: data.phoneNumber || '',
          }));
        }
      } catch (error) {
        console.error('Error fetching user info:', error);
        handleComponentError(error as Error);
      } finally {
        if (mountRef.current) {
          safeSetState(() => setLoading(false));
        }
      }
    };
    
    fetchUserInfo();
  }, [user, safeSetState, handleComponentError]);

  // Enhanced sign out function
  const handleSignOut = async () => {
    if (isSigningOut) return; // Prevent multiple simultaneous sign-outs
    
    console.log('🔄 Sign out process initiated');
    
    try {
      setIsSigningOut(true);
      resetComponentState();

      // 1. Update Firestore user status
      try {
        const collection = user?.role === 'owner' ? 'barberowner' : 'users';
        const userRef = doc(db, collection, user?.uid || '');
        console.log('📝 Updating user status in Firestore');

        await updateDoc(userRef, {
          isLoggedIn: false,
          lastLogout: new Date().toISOString(),
        });
        console.log('✅ User status updated in Firestore');
      } catch (firestoreError) {
        console.warn('⚠️ Firestore update failed, continuing with signout:', firestoreError);
      }

      // 2. Clear SecureStore and localStorage
      console.log('🗑️ Clearing storage');
      try {
        await SecureStore.deleteItemAsync('user_session');
        console.log('✅ SecureStore cleared');
      } catch (secureStoreError) {
        console.log('ℹ️ SecureStore deletion failed (expected on web):', secureStoreError);
      }

      // Clear localStorage for web
      if (Platform.OS === 'web') {
        try {
          localStorage.removeItem('user_session');
          console.log('✅ localStorage cleared');
        } catch (localStorageError) {
          console.log('ℹ️ localStorage deletion failed:', localStorageError);
        }
      }

      // 3. Clear auth context
      console.log('🔒 Clearing auth context');
      if (setUser) {
        setUser(null);
      }

      // 4. Sign out from Firebase Auth
      console.log('🔥 Signing out from Firebase Auth');
      await signOut(auth);
      console.log('✅ Firebase Auth sign out completed');

      // 5. Force navigation with different strategies
      console.log('🔄 Navigating to login screen');
      
      if (Platform.OS === 'web') {
        // For web - use hard navigation to prevent caching
        window.location.href = '/login';
      } else {
        // For mobile - use router with replace and params
        router.replace({
          pathname: '/login',
          params: { 
            signedOut: 'true'
          },
        });
        
        // Additional safety - reset navigation state after a delay
        setTimeout(() => {
          router.canGoBack() && router.back();
        }, 1000);
      }

    } catch (error) {
      console.error('❌ Sign out error:', error);
      
      // Even if there's an error, try to clear local state and navigate
      try {
        if (setUser) setUser(null);
        await SecureStore.deleteItemAsync('user_session');
        if (Platform.OS === 'web') {
          localStorage.removeItem('user_session');
        }
        
        // Force navigation to login
        if (Platform.OS === 'web') {
          window.location.href = '/login?error=signout';
        } else {
          router.replace('/login');
        }
      } catch (fallbackError) {
        console.error('❌ Fallback sign out also failed:', fallbackError);
        Alert.alert('Error', 'Failed to sign out completely. Please restart the app.');
      }
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleShareApp = async () => {
    try {
      const docRef = doc(db, 'applink', '52TWSuUrjH0pMrqAR4Q1');
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('App link not found in Firebase');
      }

      const appLink = docSnap.data().link;
      const referralCode = buildReferralCode(user?.uid);
      const referralLink = referralCode
        ? `${appLink}${appLink.includes('?') ? '&' : '?'}ref=${encodeURIComponent(referralCode)}`
        : appLink;
      const shareOptions = {
        message: referralCode
          ? `Book your next salon visit with MyBarber. Use my referral code ${referralCode}.\n\n${referralLink}`
          : `Book your next salon visit with MyBarber.\n\n${referralLink}`,
        url: referralLink,
        title: 'Share MyBarber',
      };

      await Share.share(shareOptions);
    } catch (error) {
      console.error('Sharing failed:', error);
      Alert.alert('Error', 'Failed to share the app. Please try again.');
    }
  };

  const handleCategoryService = () => {
    safeSetState(() => setShowCategoryServices(true));
  };

  const menuItems = [
    {
      icon: <User size={20} color={Colors.primary} />,
      title: 'Personal Information',
      subtitle: 'View and update your information',
      action: () => router.push('/profile(tabs)/edit-profile'),
    },
    {
      icon: <Bell size={20} color={Colors.primary} />,
      title: 'Notifications',
      subtitle: 'Manage your notification preferences',
      action: () => router.push('/profile(tabs)/NotificationScreen'),
    },
    {
      icon: <Shield size={20} color={Colors.primary} />,
      title: 'Privacy & Security',
      subtitle: 'Manage your account security',
      action: () => router.push('/profile(tabs)/PrivacySecurityScreen'),
    },
    {
      icon: <HelpCircle size={20} color={Colors.primary} />,
      title: 'Help & Support',
      subtitle: 'Get help with our app',
      action: () => router.push('/profile(tabs)/HelpSupportScreen'),
    },
    {
      icon: <Settings size={20} color={Colors.primary} />,
      title: 'Settings',
      subtitle: 'Manage app settings',
      action: () => router.push('/profile(tabs)/AppSettingsScreen'),
    },
    {
      icon: <ShoppingBag size={20} color={Colors.primary} />,
      title: 'Shopping (Coming soon)',
      subtitle: 'Products and marketplace features',
      action: () => router.push('/shopping'),
    },
    {
      icon: <GraduationCap size={20} color={Colors.primary} />,
      title: 'Academy (Coming soon)',
      subtitle: 'Grooming tips and tutorials',
      action: () => router.push('/academy'),
    },
  ];

  // Show loading state
  if (loading || !isComponentMounted) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading Profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Category Selection Modal */}
      {showCategoryServices && (
        <View style={styles.selectionContainer}>
          <Text style={styles.selectionTitle}>Choose a Service Category</Text>
          <View style={styles.selectionButtons}>
            {['man', 'woman', 'unisex']
              .filter((gender) => {
                const accountGender = user?.gender?.toLowerCase();
                if (accountGender === 'woman' && gender === 'man') return false;
                if (accountGender === 'man' && gender === 'woman') return false;
                return true;
              })
              .map((gender) => (
              <View key={gender} style={styles.categoryButtonContainer}>
                <TouchableOpacity
                  style={[
                    styles.categoryButton,
                    styles[`categoryButton${gender.charAt(0).toUpperCase() + gender.slice(1)}`],
                    categoryDisabled && styles.disabledButton
                  ]}
                  onPress={() => handleProfileGenderSelection(gender as any)}
                  disabled={categoryDisabled}
                >
                  <Image
                    source={
                      gender === 'man' ? require('@/assets/images/man.png') :
                      gender === 'woman' ? require('@/assets/images/woman.png') :
                      require('@/assets/images/unisex.png')
                    }
                    style={[
                      styles.categoryImage,
                      categoryDisabled && { opacity: 0.6 }
                    ]}
                  />
                  {categoryDisabled && (
                    <ActivityIndicator 
                      size="small" 
                      color={Colors.primary} 
                      style={styles.buttonLoader}
                    />
                  )}
                </TouchableOpacity>
                <Text style={styles.categoryLabel}>
                  {gender === 'man' ? 'Men' : gender === 'woman' ? 'Women' : 'Unisex'}
                </Text>
              </View>
            ))}
          </View>
          
          {/* Close button for safety */}
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={resetComponentState}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Profile Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        <FadeView style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>Profile</Text>
        </FadeView>

        <FadeView delay={200} style={styles.profileSection}>
          <View style={styles.profileImagePlaceholder}>
            <Text style={styles.profileImageText}>
              {userInfo.name ? userInfo.name.charAt(0).toUpperCase() : 'U'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {userInfo.name || 'User'}
            </Text>
            <Text style={styles.profileEmail}>
              {userInfo.phoneNumber || 'Phone Number'}
            </Text>
          </View>
        </FadeView>

        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <FadeView key={index} delay={300 + index * 100}>
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={item.action}
                onPressIn={resetComponentState}
              >
                <View style={styles.menuIconContainer}>{item.icon}</View>
                <View style={styles.menuContent}>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
                <ChevronRight size={20} color={Colors.textLight} />
              </TouchableOpacity>
            </FadeView>
          ))}
        </View>

        <FadeView delay={950}>
          <TouchableOpacity onPress={handleShareApp} style={styles.shareButton}>
            <Share2 size={20} color={Colors.primary} />
            <Text style={styles.shareText}>Share App</Text>
          </TouchableOpacity>
        </FadeView>

        <FadeView delay={900}>
          <TouchableOpacity
            onPress={handleCategoryService}
            style={styles.selectcategorybutton}
          >
            <Text style={styles.selectcategorytext}>
              Category Services
            </Text>
          </TouchableOpacity>
        </FadeView>

        <TouchableOpacity
          style={[styles.signOutButton1, isSigningOut && styles.disabledButton]}
          onPress={handleSignOut}
          disabled={isSigningOut}
        >
          {isSigningOut ? (
            <ActivityIndicator size="small" color={Colors.error} />
          ) : (
            <LogOut size={20} color={Colors.error} />
          )}
          <Text style={styles.signOutText1}>
            {isSigningOut ? 'Signing Out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(tabs)/customer-tools')}>
          <View style={styles.menuIconContainer}><Wrench size={21} color={Colors.primary} /></View>
          <View style={styles.menuContent}><Text style={styles.menuTitle}>Customer Tools</Text><Text style={styles.menuSubtitle}>Favourites, support, notifications and repeat booking</Text></View>
          <ChevronRight size={20} color={Colors.textLight} />
        </TouchableOpacity>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: Colors.text,
    fontFamily: 'Poppins-Regular',
  },
  scrollContainer: {
    paddingBottom: 20,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    marginBottom: 24,
  },
  profileImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileImageText: {
    color: 'white',
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  profileEmail: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 4,
  },
  menuSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
  },
  menuSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 2,
  },
  signOutButton1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.errorLight,
    marginBottom: 20,
  },
  selectcategorybutton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
    marginBottom: 20,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.backgroundLight,
    marginBottom: 12,
    gap: 8,
  },
  signOutText1: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.error,
    marginLeft: 8,
  },
  selectcategorytext: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.success,
    marginLeft: 8,
  },
  shareText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.primary,
  },
  bottomPadding: {
    height: 20,
  },
  selectionContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.background,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  selectionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 40,
    color: Colors.text,
    textAlign: 'center',
  },
  selectionButtons: {
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 60,
  },
  categoryButtonContainer: {
    marginBottom: 30,
    alignItems: 'center',
  },
  categoryButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 100,
    overflow: 'hidden',
    position: 'relative',
  },
  categoryButtonMen: {
    width: 140,
    height: 140,
    backgroundColor: 'transparent',
  },
  categoryButtonWomen: {
    width: 140,
    height: 140,
    backgroundColor: 'transparent',
  },
  categoryButtonUnisex: {
    width: 140,
    height: 140,
    backgroundColor: 'transparent',
  },
  categoryImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#ccc',
  },
  categoryLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 10,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonLoader: {
    position: 'absolute',
  },
  closeButton: {
    marginTop: 20,
    padding: 12,
    backgroundColor: Colors.errorLight,
    borderRadius: 8,
  },
  closeButtonText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: 'bold',
  },
});