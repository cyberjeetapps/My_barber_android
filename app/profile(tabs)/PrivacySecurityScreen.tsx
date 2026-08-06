import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import Colors from '@/constants/Colors';
import { ShieldCheck } from 'lucide-react-native';
import { useLanguage } from '@/context/LanguageContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function PrivacySecurityScreen() {
  const router = useRouter();
  const { language, translate, loading } = useLanguage();

  // Translated UI texts (will be dynamically translated)
  const [uiTexts, setUiTexts] = useState({
    title: 'Privacy & Security',
    cardTitle: 'Your Details Are Protected',
    cardDescription: 'We use advanced encryption and security protocols to keep your information safe. Your data is stored securely and cannot be accessed by unauthorized users.',
    footerNote: 'Your privacy matters to us — your information is never shared without your consent.',
    back: 'Back'
  });

  // Translate UI when language changes
  useEffect(() => {
    const translateUI = async () => {
      if (language === 'en') {
        setUiTexts({
          title: 'Privacy & Security',
          cardTitle: 'Your Details Are Protected',
          cardDescription: 'We use advanced encryption and security protocols to keep your information safe. Your data is stored securely and cannot be accessed by unauthorized users.',
          footerNote: 'Your privacy matters to us — your information is never shared without your consent.',
          back: 'Back',
       });
      } else {
        const translated = await Promise.all([
          translate('Privacy & Security'),
          translate('Your Details Are Protected'),
          translate('We use advanced encryption and security protocols to keep your information safe. Your data is stored securely and cannot be accessed by unauthorized users.'),
          translate('Your privacy matters to us — your information is never shared without your consent.'),
          translate('Back'),
        ]);

        setUiTexts({
          title: translated[0],
          cardTitle: translated[1],
          cardDescription: translated[2],
          footerNote: translated[3],
          back: translated[4]
        });
      }
    };

    translateUI();
  }, [language]);

  const handleBackPress = () => {
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} />
      ) : (
        <>
          {/* Back button in top left */}
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={handleBackPress}
            disabled={loading}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.primary} />
            <Text style={styles.backButtonText}>{uiTexts.back}</Text>
          </TouchableOpacity>

          <Text style={styles.header}>{uiTexts.title}</Text>

          <View style={styles.card}>
            <ShieldCheck color={Colors.primary} size={48} />
            <Text style={styles.title}>{uiTexts.cardTitle}</Text>
            <Text style={styles.description}>{uiTexts.cardDescription}</Text>
          </View>

          <Image
            source={{
              uri: 'https://cdn-icons-png.flaticon.com/512/3064/3064197.png',
            }}
            style={styles.lockImage}
            resizeMode="contain"
          />

          <Text style={styles.footerNote}>
            {uiTexts.footerNote}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    marginBottom: 20,
    marginTop: 20,
    textAlign: 'center'
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 10,
  },
  description: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  lockImage: {
    width: '100%',
    height: 200,
    marginBottom: 20,
  },
  footerNote: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    textAlign: 'center',
    color: Colors.textLight,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 10,
    paddingVertical: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: Colors.primary,
    fontFamily: 'Poppins-SemiBold',
    marginLeft: 8,
  },
});