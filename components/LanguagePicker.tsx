// components/LanguagePicker.tsx
// A reusable "select your language" modal — used by both the customer app
// (Profile > App Settings) and the salon-owner dashboard (Settings).
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Check, Globe, X } from 'lucide-react-native';
import Colors from '@/constants/Colors';
import { useLanguage, SUPPORTED_LANGUAGES, Language } from '@/context/LanguageContext';

interface LanguagePickerProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
}

export default function LanguagePicker({ visible, onClose, title = 'Select Language' }: LanguagePickerProps) {
  const { language, setLanguage, loading } = useLanguage();

  const handleSelect = async (code: Language) => {
    if (code === language) {
      onClose();
      return;
    }
    await setLanguage(code);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Globe size={20} color={Colors.primary} />
              <Text style={styles.headerTitle}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={20} color={Colors.textLight} />
            </TouchableOpacity>
          </View>

          {SUPPORTED_LANGUAGES.map((opt) => {
            const isActive = opt.code === language;
            return (
              <TouchableOpacity
                key={opt.code}
                style={[styles.row, isActive && styles.rowActive]}
                onPress={() => handleSelect(opt.code)}
                disabled={loading}
              >
                <View>
                  <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{opt.label}</Text>
                  <Text style={styles.rowSubLabel}>{opt.englishName}</Text>
                </View>
                {isActive && <Check size={18} color={Colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Poppins-SemiBold',
    color: Colors.text,
    marginLeft: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  rowActive: {
    backgroundColor: Colors.primaryLight,
  },
  rowLabel: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
  },
  rowLabelActive: {
    color: Colors.primary,
  },
  rowSubLabel: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 2,
  },
});
