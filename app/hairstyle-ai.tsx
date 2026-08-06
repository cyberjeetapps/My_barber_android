// app/hairstyle-ai.tsx
// "Virtual Mirror" — AI Hairstyle Try-On.
// Flow: take/upload a selfie -> pick a style from the salon's gallery ->
// get an AI-generated preview -> book that exact style directly.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, functions } from '@/config/firebase';
import Colors from '@/constants/Colors';
import { useGender } from '@/context/GenderContext';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/auth';
import {
  ArrowLeft,
  Camera,
  ImageIcon,
  Sparkles,
  RefreshCw,
  Calendar,
  Share2,
  Download,
} from 'lucide-react-native';

interface HairstyleOption {
  id: string;
  name: string;
  imageUrl: string;
  gender: 'man' | 'woman' | 'unisex';
  serviceName?: string; // maps to a bookable service, if set by the salon
}

type Step = 'photo' | 'gallery' | 'result';

const FALLBACK_UI_TEXT = {
  title: 'AI Hairstyle Try-On',
  subtitle: 'See a style on your own face before you book it.',
  takePhoto: 'Take a Selfie',
  uploadPhoto: 'Upload a Photo',
  photoHint: 'Face the camera in good light for the best result.',
  chooseStyle: 'Choose a hairstyle',
  noStyles: "Your salon hasn't added try-on styles yet. Check back soon!",
  generate: 'Generate Preview',
  generating: 'Creating your preview…',
  retake: 'Try Another Photo',
  changeStyle: 'Change Style',
  bookThisStyle: 'Book This Style',
  save: 'Save',
  share: 'Share',
  resultTitle: 'Here\'s your new look',
  errorTitle: 'Couldn\'t generate preview',
  errorBody: 'Please try again in a moment, or pick a different photo.',
  permissionDenied: 'Camera/gallery permission is needed to continue.',
  notConfigured: 'AI preview isn\'t set up yet for this salon. Please check back soon.',
};

export default function HairstyleAIScreen() {
  const router = useRouter();
  const { gender } = useGender();
  const { language, translate } = useLanguage();
  const { user } = useAuth();

  const [uiText, setUiText] = useState(FALLBACK_UI_TEXT);
  const [step, setStep] = useState<Step>('photo');
  const [selfie, setSelfie] = useState<{ uri: string; base64: string } | null>(null);
  const [styles_, setStyles_] = useState<HairstyleOption[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<HairstyleOption | null>(null);
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // Translate the static UI copy whenever the app language changes.
  useEffect(() => {
    const run = async () => {
      if (language === 'en') {
        setUiText(FALLBACK_UI_TEXT);
        return;
      }
      const keys = Object.keys(FALLBACK_UI_TEXT) as (keyof typeof FALLBACK_UI_TEXT)[];
      const translated = await Promise.all(keys.map((k) => translate(FALLBACK_UI_TEXT[k])));
      const next = { ...FALLBACK_UI_TEXT };
      keys.forEach((k, i) => {
        next[k] = translated[i];
      });
      setUiText(next);
    };
    run();
  }, [language]);

  const fetchStyles = useCallback(async () => {
    setLoadingStyles(true);
    try {
      const targetGender = gender || 'unisex';
      const q = query(
        collection(db, 'hairstyleCatalog'),
        where('gender', 'in', [targetGender, 'unisex'])
      );
      const snap = await getDocs(q);
      const options: HairstyleOption[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<HairstyleOption, 'id'>),
      }));
      setStyles_(options);
    } catch (error) {
      console.error('Failed to load hairstyle catalog:', error);
      setStyles_([]);
    } finally {
      setLoadingStyles(false);
    }
  }, [gender]);

  const pickPhoto = async (source: 'camera' | 'library') => {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(uiText.errorTitle, uiText.permissionDenied);
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [3, 4],
              quality: 0.7,
              base64: true,
              cameraType: ImagePicker.CameraType.front,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [3, 4],
              quality: 0.7,
              base64: true,
            });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert(uiText.errorTitle, uiText.errorBody);
        return;
      }

      setSelfie({ uri: asset.uri, base64: asset.base64 });
      setStep('gallery');
      fetchStyles();
    } catch (error) {
      console.error('Photo selection failed:', error);
      Alert.alert(uiText.errorTitle, uiText.errorBody);
    }
  };

  const handleGenerate = async () => {
    if (!selfie || !selectedStyle) return;
    setGenerating(true);
    setResultUrl(null);
    try {
      const generate = httpsCallable<
        { selfieImageBase64: string; hairstyleImageUrl: string; userId?: string },
        { resultImageUrl: string }
      >(functions, 'generateHairstylePreview');

      const response = await generate({
        selfieImageBase64: selfie.base64,
        hairstyleImageUrl: selectedStyle.imageUrl,
        userId: user?.uid,
      });

      setResultUrl(response.data.resultImageUrl);
      setStep('result');
    } catch (error: any) {
      console.error('Hairstyle generation failed:', error);
      const isNotConfigured = error?.code === 'functions/failed-precondition';
      Alert.alert(
        uiText.errorTitle,
        isNotConfigured ? uiText.notConfigured : uiText.errorBody
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleBookThisStyle = () => {
    router.push({
      pathname: '/services',
      params: selectedStyle?.serviceName ? { highlightService: selectedStyle.serviceName } : {},
    });
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{uiText.title}</Text>
          <Text style={s.subtitle}>{uiText.subtitle}</Text>
        </View>
        <Sparkles size={22} color={Colors.accent} />
      </View>

      {step === 'photo' && (
        <View style={s.photoStep}>
          <View style={s.photoPlaceholder}>
            <ImageIcon size={40} color={Colors.textLight} />
          </View>
          <Text style={s.hint}>{uiText.photoHint}</Text>
          <Text style={s.consentNotice}>
            Your photo is sent to our AI preview provider only to generate this
            image and isn't used for any other purpose. It's not shared with
            other customers or salons.
          </Text>
          <TouchableOpacity style={s.primaryButton} onPress={() => pickPhoto('camera')}>
            <Camera size={18} color="#fff" />
            <Text style={s.primaryButtonText}>{uiText.takePhoto}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryButton} onPress={() => pickPhoto('library')}>
            <ImageIcon size={18} color={Colors.primary} />
            <Text style={s.secondaryButtonText}>{uiText.uploadPhoto}</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'gallery' && selfie && (
        <View style={s.galleryStep}>
          <View style={s.selfieRow}>
            <Image source={{ uri: selfie.uri }} style={s.selfieThumb} />
            <TouchableOpacity style={s.linkButton} onPress={() => setStep('photo')}>
              <RefreshCw size={14} color={Colors.primary} />
              <Text style={s.linkButtonText}>{uiText.retake}</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.sectionTitle}>{uiText.chooseStyle}</Text>

          {loadingStyles ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
          ) : styles_.length === 0 ? (
            <Text style={s.emptyText}>{uiText.noStyles}</Text>
          ) : (
            <View style={s.styleGrid}>
              {styles_.map((style) => {
                const active = selectedStyle?.id === style.id;
                return (
                  <TouchableOpacity
                    key={style.id}
                    style={[s.styleCard, active && s.styleCardActive]}
                    onPress={() => setSelectedStyle(style)}
                  >
                    <Image source={{ uri: style.imageUrl }} style={s.styleImage} />
                    <Text style={s.styleName} numberOfLines={1}>
                      {style.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {selectedStyle && (
            <TouchableOpacity
              style={[s.primaryButton, generating && s.disabledButton]}
              onPress={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Sparkles size={18} color="#fff" />
              )}
              <Text style={s.primaryButtonText}>
                {generating ? uiText.generating : uiText.generate}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {step === 'result' && resultUrl && selfie && (
        <View style={s.resultStep}>
          <Text style={s.sectionTitle}>{uiText.resultTitle}</Text>
          <View style={s.compareRow}>
            <View style={s.compareCol}>
              <Image source={{ uri: selfie.uri }} style={s.compareImage} />
              <Text style={s.compareLabel}>Before</Text>
            </View>
            <View style={s.compareCol}>
              <Image source={{ uri: resultUrl }} style={s.compareImage} />
              <Text style={s.compareLabel}>After</Text>
            </View>
          </View>

          <TouchableOpacity style={s.primaryButton} onPress={handleBookThisStyle}>
            <Calendar size={18} color="#fff" />
            <Text style={s.primaryButtonText}>{uiText.bookThisStyle}</Text>
          </TouchableOpacity>

          <View style={s.resultActionsRow}>
            <TouchableOpacity
              style={s.secondaryButtonSmall}
              onPress={() => setStep('gallery')}
            >
              <RefreshCw size={16} color={Colors.primary} />
              <Text style={s.secondaryButtonText}>{uiText.changeStyle}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 2,
  },
  photoStep: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  photoPlaceholder: {
    width: '100%',
    height: 260,
    borderRadius: 20,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  hint: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 20,
  },
  consentNotice: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 20,
    paddingHorizontal: 12,
    opacity: 0.85,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    marginTop: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.7,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primaryLight,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
  },
  secondaryButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  galleryStep: {
    paddingHorizontal: 20,
  },
  selfieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  selfieThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkButtonText: {
    color: Colors.primary,
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 24,
  },
  styleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  styleCard: {
    width: '31%',
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: Colors.cardBackground,
  },
  styleCardActive: {
    borderColor: Colors.primary,
  },
  styleImage: {
    width: '100%',
    aspectRatio: 1,
  },
  styleName: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    padding: 6,
    textAlign: 'center',
  },
  resultStep: {
    paddingHorizontal: 20,
  },
  compareRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  compareCol: {
    flex: 1,
    alignItems: 'center',
  },
  compareImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: Colors.inputBackground,
  },
  compareLabel: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: Colors.textLight,
  },
  resultActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
  },
});
