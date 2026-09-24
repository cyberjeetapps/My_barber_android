import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useLanguage } from '@/context/LanguageContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function HelpSupportScreen() {
  const router = useRouter();
  const { language, translate, loading } = useLanguage();

  // Translated UI texts (will be dynamically translated)
  const [uiTexts, setUiTexts] = useState({
    title: 'Help & Support',
    contactUs: 'Contact Us',
    emailUs: 'Email Us',
    faq: 'Frequently Asked Questions',
    faqQuestion: 'Q: How can I book an appointment?',
    faqAnswer:
      'A: You can book an appointment through our app or call us directly.',
    back: 'Back',
  });

  // Translate UI when language changes
  useEffect(() => {
    const translateUI = async () => {
      if (language === 'en') {
        setUiTexts({
          title: 'Help & Support',
          contactUs: 'Contact Us',
          emailUs: 'Email Us',
          faq: 'Frequently Asked Questions',
          faqQuestion: 'Q: How can I book an appointment?',
          faqAnswer:
            'A: You can book an appointment through our app or call us directly.',
          back: 'Back',
        });
      } else {
        const translated = await Promise.all([
          translate('Help & Support'),
          translate('Contact Us'),
          translate('Call Us'),
          translate('Email Us'),
          translate('Frequently Asked Questions'),
          translate('Q: How can I book an appointment?'),
          translate(
            'A: You can book an appointment through our app or call us directly.'
          ),
          translate('Back'),
        ]);

        setUiTexts({
          title: translated[0],
          contactUs: translated[1],
          emailUs: translated[3],
          faq: translated[4],
          faqQuestion: translated[5],
          faqAnswer: translated[6],
          back: translated[7],
        });
      }
    };

    translateUI();
  }, [language]);

  const fetchContactDetails = async () => {
    try {
      const docRef = doc(db, 'applink', '52TWSuUrjH0pMrqAR4Q1'); // Your document ID
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Contact details not found in Firebase');
      }

      const { phonenumber, email } = docSnap.data();

      if (!phonenumber || !email) {
        throw new Error('Phone number or email missing in Firebase');
      }

      return { phonenumber, email };
    } catch (error) {
      console.error('Error fetching contact details:', error);
      throw error; // Re-throw to handle in the calling function
    }
  };

  const handleContactPress = async () => {
    try {
      const { phonenumber } = await fetchContactDetails();
      const phoneUrl = `tel:${phonenumber}`;
      await Linking.openURL(phoneUrl);
    } catch (error) {
      Alert.alert(
        'Error',
        'Could not fetch phone number. Please try again later.'
      );
    }
  };

  const handleEmailPress = async () => {
    try {
      const { email } = await fetchContactDetails();
      const emailUrl = `mailto:${email}`;
      await Linking.openURL(emailUrl);
    } catch (error) {
      Alert.alert('Error', 'Could not fetch email. Please try again later.');
    }
  };

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

          <View style={styles.section}>
            <Text style={styles.subHeader}>{uiTexts.contactUs}</Text>
            <TouchableOpacity
              style={styles.contactButton}
              onPress={handleEmailPress}
            >
              <Text style={styles.contactText}>{uiTexts.emailUs}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.subHeader}>{uiTexts.faq}</Text>
            <Text style={styles.faqText}>{uiTexts.faqQuestion}</Text>
            <Text style={styles.faqText}>{uiTexts.faqAnswer}</Text>
            {/* Add more FAQs as needed */}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.background,
  },
  header: {
    fontSize: 24,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    marginBottom: 20,
    marginTop: 20,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  subHeader: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
    marginBottom: 10,
  },
  contactButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  contactText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
  },
  faqText: {
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: Colors.text,
    marginBottom: 5,
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
