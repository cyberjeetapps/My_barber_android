// contexts/GenderContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';
import Colors from '@/constants/Colors';

type GenderType = 'man' | 'woman' | 'unisex' | null;

type GenderContextType = {
  gender: GenderType;
  setGender: (gender: GenderType) => void;
  getThemeColor: () => string;
  getThemeLightColor: () => string;
};

const GenderContext = createContext<GenderContextType | undefined>(undefined);

export function GenderProvider({ children }: { children: ReactNode }) {
  const [gender, setGender] = useState<GenderType>(null);

  const getThemeColor = () => {
    switch(gender) {
      case 'man': return Colors.primary;       // Blue
      case 'woman': return Colors.pink;       // Pink
      case 'unisex': return Colors.purple;    // Purple
      default: return Colors.primary;         // Default to blue
    }
  };

  const getThemeLightColor = () => {
    switch(gender) {
      case 'man': return Colors.primary;       // Light blue
      case 'woman': return Colors.pink;        // Light pink
      case 'unisex': return Colors.purpleLight;     // Light purple
      default: return Colors.primary;          // Default to light blue
    }
  };

  return (
    <GenderContext.Provider value={{ 
      gender, 
      setGender,
      getThemeColor,
      getThemeLightColor
    }}>
      {children}
    </GenderContext.Provider>
  );
}

export function useGender() {
  const context = useContext(GenderContext);
  if (context === undefined) {
    throw new Error('useGender must be used within a GenderProvider');
  }
  return context;
}