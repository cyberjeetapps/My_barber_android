// context/LanguageContext.tsx
// Multi-language support: English, Hindi, Kannada, Telugu, Marathi.
// Translation is done live via the existing `translateText` Firebase Function
// (Google Translate API) — no new backend work needed, since Google Translate
// already supports 'hi', 'kn', 'te', 'mr' language codes out of the box.
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '@/config/firebase';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';

// 'en' = English, 'hi' = Hindi, 'kn' = Kannada, 'te' = Telugu, 'mr' = Marathi
export type Language = 'en' | 'hi' | 'kn' | 'te' | 'mr';

export interface LanguageOption {
  code: Language;
  label: string; // native-script label shown in the picker
  englishName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', englishName: 'English' },
  { code: 'hi', label: 'हिंदी', englishName: 'Hindi' },
  { code: 'kn', label: 'ಕನ್ನಡ', englishName: 'Kannada' },
  { code: 'te', label: 'తెలుగు', englishName: 'Telugu' },
  { code: 'mr', label: 'मराठी', englishName: 'Marathi' },
];

interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage?: string;
}

interface LanguageContextType {
  language: Language;
  /** Preferred: set an exact language from the picker */
  setLanguage: (lang: Language) => Promise<void>;
  /** Back-compat: cycles en -> hi -> kn -> te -> mr -> en. Existing screens
   *  using toggleLanguage() keep working without changes. */
  toggleLanguage: () => Promise<void>;
  translate: (text: string) => Promise<string>;
  loading: boolean;
  translationError: string | null;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'appLanguage';
const VALID_CODES: Language[] = ['en', 'hi', 'kn', 'te', 'mr'];

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');
  const [loading, setLoading] = useState(false);
  // Cache is keyed per-language so switching back and forth doesn't
  // re-hit the network for text you've already translated in this session.
  const [cache, setCache] = useState<Record<string, string>>({});
  const [translationError, setTranslationError] = useState<string | null>(null);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedLanguage && (VALID_CODES as string[]).includes(savedLanguage)) {
          setLanguageState(savedLanguage as Language);
        }
      } catch (error) {
        console.error('Failed to load language preference:', error);
      }
    };
    loadLanguage();
  }, []);

  const translate = async (text: string): Promise<string> => {
    if (language === 'en' || !text.trim()) return text;

    const cacheKey = `${text}_${language}`;

    if (cache[cacheKey]) {
      return cache[cacheKey];
    }

    try {
      setLoading(true);
      setTranslationError(null);

      const translateText = httpsCallable<{ text: string; targetLang: string }, TranslationResult>(
        functions,
        'translateText'
      );

      let result: HttpsCallableResult<TranslationResult>;
      try {
        result = await translateText({ text, targetLang: language });
      } catch (error) {
        console.warn('First translation attempt failed, retrying...', error);
        result = await translateText({ text, targetLang: language });
      }

      if (!result?.data?.translatedText) {
        throw new Error('Empty translation response');
      }

      const translated = result.data.translatedText;

      setCache((prev) => ({
        ...prev,
        [cacheKey]: translated,
      }));

      return translated;
    } catch (error: any) {
      console.error('Translation failed:', {
        error: error.message,
        text,
        stack: error.stack,
      });

      setTranslationError(`Translation failed: ${error.message}`);
      return text; // Fall back to the original text rather than break the UI
    } finally {
      setLoading(false);
    }
  };

  const setLanguage = async (lang: Language) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, lang);
      setLanguageState(lang);
      setTranslationError(null);
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  };

  const toggleLanguage = async () => {
    const currentIndex = VALID_CODES.indexOf(language);
    const nextLanguage = VALID_CODES[(currentIndex + 1) % VALID_CODES.length];
    await setLanguage(nextLanguage);
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        translate,
        loading,
        translationError,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
