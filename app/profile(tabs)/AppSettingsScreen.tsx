import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { useLanguage, SUPPORTED_LANGUAGES } from '@/context/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import { auth, db, storage } from '@/config/firebase';
import { deleteUser } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { useAuth } from '@/context/auth';
import * as SecureStore from 'expo-secure-store';
import { Trash2 } from 'lucide-react-native';
import LanguagePicker from '@/components/LanguagePicker';

export default function AppSettingsScreen() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const { language, translate, loading } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const { user } = useAuth();

  const currentLanguageLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === language)?.label ?? 'English';

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Settings are local/AsyncStorage only — nothing to refetch here.
    } finally {
      setRefreshing(false);
    }
  };

  const [uiTexts, setUiTexts] = useState({
    title: 'App Settings',
    notifications: 'Enable Notifications',
    darkMode: 'Dark Mode',
    language: 'Language',
    version: 'App Version',
    back: 'Back',
    deleteAccount: 'Delete Account',
    deleteAccountConfirm: 'Are you sure you want to delete your account? This action cannot be undone.',
    deleteAccountSuccess: 'Account deleted successfully',
    deleteAccountError: 'Failed to delete account. Please try again.',
    error: 'Error',
    success: 'Success',
  });

  useEffect(() => {
    const translateUI = async () => {
      const keysToTranslate = [
        'App Settings',
        'Enable Notifications',
        'Dark Mode',
        'Language',
        'App Version',
        'Back',
        'Delete Account',
        'Are you sure you want to delete your account? This action cannot be undone.',
        'Account deleted successfully',
        'Failed to delete account. Please try again.',
        'Error',
        'Success',
      ];

      if (language === 'en') {
        setUiTexts({
          title: keysToTranslate[0],
          notifications: keysToTranslate[1],
          darkMode: keysToTranslate[2],
          language: keysToTranslate[3],
          version: keysToTranslate[4],
          back: keysToTranslate[5],
          deleteAccount: keysToTranslate[6],
          deleteAccountConfirm: keysToTranslate[7],
          deleteAccountSuccess: keysToTranslate[8],
          deleteAccountError: keysToTranslate[9],
          error: keysToTranslate[10],
          success: keysToTranslate[11],
        });
      } else {
        const translated = await Promise.all(
          keysToTranslate.map((text) => translate(text))
        );

        setUiTexts({
          title: translated[0],
          notifications: translated[1],
          darkMode: translated[2],
          language: translated[3],
          version: translated[4],
          back: translated[5],
          deleteAccount: translated[6],
          deleteAccountConfirm: translated[7],
          deleteAccountSuccess: translated[8],
          deleteAccountError: translated[9],
          error: translated[10],
          success: translated[11],
        });
      }
    };

    translateUI();
  }, [language]);

  const handleDeleteAccount = async () => {
    Alert.alert(
      uiTexts.deleteAccount,
      uiTexts.deleteAccountConfirm,
      [
        {
          text: uiTexts.back,
          style: 'cancel',
        },
        {
          text: uiTexts.deleteAccount,
          style: 'destructive',
          onPress: async () => {
            try {
              if (!user || !auth.currentUser) {
                throw new Error('No user authenticated');
              }

              // Get the current authenticated user instance
              const currentUser = auth.currentUser;

              // First delete the user document from Firestore
              const collection = user.role === 'owner' ? 'barberowner' : 'users';
              const userRef = doc(db, collection, user.uid);
              await deleteDoc(userRef);

              // Delete profile image from storage if it exists
              if (user.profileImageUrl) {
                const imageRef = ref(storage, user.profileImageUrl);
                await deleteObject(imageRef).catch((error) => {
                  console.log('Error deleting profile image:', error);
                });
              }

              // Now delete the auth user
              await deleteUser(currentUser);

              // Clear session storage
              await SecureStore.deleteItemAsync('user_session');

              // Navigate to login screen
              router.replace({
                pathname: '/login',
                params: { resetForm: 'true' },
              });

              Alert.alert(uiTexts.success, uiTexts.deleteAccountSuccess);
            } catch (error) {
              console.error('Account deletion error:', error);
              Alert.alert(
                uiTexts.error,
                error instanceof Error
                  ? error.message
                  : uiTexts.deleteAccountError
              );
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[Colors.primary]}
          tintColor={Colors.primary}
        />
      }
    >
      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} />
      ) : (
        <>
          <TouchableOpacity
            style={styles.topBackButton}
            onPress={() => router.back()}
            disabled={loading}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
            <Text style={styles.topBackButtonText}>{uiTexts.back}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{uiTexts.title}</Text>

          <View style={styles.settingItem}>
            <Text style={styles.settingText}>{uiTexts.language}</Text>
            <TouchableOpacity
              onPress={() => setLanguagePickerVisible(true)}
              style={styles.languageButton}
            >
              <Text style={styles.languageText}>{currentLanguageLabel}</Text>
            </TouchableOpacity>
          </View>

          <LanguagePicker
            visible={languagePickerVisible}
            onClose={() => setLanguagePickerVisible(false)}
            title={uiTexts.language}
          />

          <View style={styles.settingItem}>
            <Text style={styles.settingText}>{uiTexts.version}</Text>
            <Text style={styles.settingSubText}>1.0.0</Text>
          </View>

          <TouchableOpacity
            style={styles.deleteAccountButton}
            onPress={handleDeleteAccount}
          >
            <Trash2 size={20} color={Colors.error} />
            <Text style={styles.deleteAccountText}>{uiTexts.deleteAccount}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: Colors.background,
  },
  languageButton: {
    padding: 8,
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
  },
  languageText: {
    color: Colors.primary,
    fontFamily: 'Poppins-Medium',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    marginBottom: 24,
    marginTop: 20,
    textAlign: 'center',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  settingText: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  settingSubText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
  },
  backButton: {
    marginTop: 40,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'Poppins-SemiBold',
  },
  topBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 10,
    paddingVertical: 8,
  },
  topBackButtonText: {
    fontSize: 16,
    color: Colors.primary,
    fontFamily: 'Poppins-SemiBold',
    marginLeft: 8,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginTop: 24,
    // borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: Colors.errorLight,
    borderRadius: 8,
    justifyContent: 'center',
  },
  deleteAccountText: {
    color: Colors.error,
    fontFamily: 'Poppins-SemiBold',
    marginLeft: 8,
  },
});