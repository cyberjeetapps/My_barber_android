// hooks/useCategorySelection.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { useGender } from '@/context/GenderContext';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';

export const useCategorySelection = () => {
  const { setGender, gender } = useGender();
  const router = useRouter();
  const [categoryDisabled, setCategoryDisabled] = useState(false);
  const [resettingCategory, setResettingCategory] = useState(false);
  const mountRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountRef.current = true;
    
    return () => {
      mountRef.current = false;
      // Cleanup all timeouts on unmount
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const safeSetState = useCallback((updater: any) => {
    if (mountRef.current) {
      updater();
    }
  }, []);

  const handleGenderSelection = useCallback((selectedGender: 'man' | 'woman' | 'unisex') => {
    if (categoryDisabled || !mountRef.current) return;
    
    console.log('Hook: Setting gender to', selectedGender);
    
    safeSetState(() => {
      setGender(selectedGender);
    });
    
    // Navigate with error handling
    try {
      router.replace({
        pathname: '/(tabs)',
        params: {
          showGender: 'true',
          gender: selectedGender,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback: just set the gender
      safeSetState(() => {
        setGender(selectedGender);
      });
    }
  }, [categoryDisabled, setGender, router, safeSetState]);

  const handleResetCategory = useCallback(() => {
    if (resettingCategory || !mountRef.current) return;
    
    safeSetState(() => {
      setResettingCategory(true);
      setCategoryDisabled(true);
    });
    
    Toast.show({
      type: 'info',
      text1: 'Resetting selection',
      text2: 'Please wait...',
      visibilityTime: 2000,
    });

    timeoutRef.current = setTimeout(() => {
      if (mountRef.current) {
        safeSetState(() => {
          setGender(null);
          setResettingCategory(false);
          setCategoryDisabled(false);
        });
        
        Toast.show({
          type: 'success',
          text1: 'Ready to select again',
          visibilityTime: 2000,
        });
      }
    }, 3000);
  }, [resettingCategory, setGender, safeSetState]);

  return {
    gender,
    categoryDisabled,
    resettingCategory,
    handleGenderSelection,
    handleResetCategory,
  };
};