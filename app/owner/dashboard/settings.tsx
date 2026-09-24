// app/profile(tabs)/AppSettingsScreen.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { useLanguage, SUPPORTED_LANGUAGES } from '@/context/LanguageContext';
import LanguagePicker from '@/components/LanguagePicker';

export default function AppSettingsScreen() {
  const router = useRouter();
  const [darkMode, setDarkMode] = React.useState(false);
  const [notifications, setNotifications] = React.useState(true);
  const [languagePickerVisible, setLanguagePickerVisible] = React.useState(false);
  const { language } = useLanguage();

  const currentLanguageLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === language)?.label ?? 'English';

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>App Settings</Text>

      <View style={styles.settingItem}>
        <Text style={styles.settingText}>Enable Notifications</Text>
        <Switch
          value={notifications}
          onValueChange={setNotifications}
          trackColor={{ false: '#ccc', true: Colors.primary }}
          thumbColor={notifications ? Colors.primary : '#f4f3f4'}
        />
      </View>

      <View style={styles.settingItem}>
        <Text style={styles.settingText}>Language</Text>
        <TouchableOpacity
          onPress={() => setLanguagePickerVisible(true)}
          style={styles.languageButton}
        >
          <Text style={styles.languageButtonText}>{currentLanguageLabel}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.settingItem}>
        <Text style={styles.settingText}>App Version</Text>
        <Text style={styles.settingSubText}>1.0.0</Text>
      </View>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>

      <LanguagePicker
        visible={languagePickerVisible}
        onClose={() => setLanguagePickerVisible(false)}
        title="Select Language"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    marginBottom: 24,
    marginTop: 60,
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
  languageButton: {
    padding: 8,
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
  },
  languageButtonText: {
    color: Colors.primary,
    fontFamily: 'Poppins-Medium',
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
});
