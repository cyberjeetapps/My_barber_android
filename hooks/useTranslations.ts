// hooks/useTranslations.ts
import { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';

export const useTranslations = (defaultTexts: Record<string, string>) => {
  const { language, translate } = useLanguage();
  const [texts, setTexts] = useState(defaultTexts);

  useEffect(() => {
    const translateUI = async () => {
      if (language === 'en') {
        setTexts(defaultTexts);
      } else {
        const translationKeys = Object.keys(defaultTexts)
          .filter(key => !['english', 'kannada'].includes(key)); // Skip language names
        
        const translatedValues = await Promise.all(
          translationKeys.map(key => translate(defaultTexts[key]))
        );

        const newTexts = { ...defaultTexts };
        translationKeys.forEach((key, index) => {
          newTexts[key] = translatedValues[index];
        });
        
        setTexts(newTexts);
      }
    };

    translateUI();
  }, [language]);

  return texts;
};