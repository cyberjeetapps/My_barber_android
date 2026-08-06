import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, Dimensions, ActivityIndicator } from 'react-native';
import { ArrowLeft, ChevronRight, User, CheckCircle } from 'lucide-react-native';
import Colors from '@/constants/Colors';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

interface BookingWizardModalProps {
  visible: boolean;
  onClose: () => void;
  shopName: string;
  accentColor: string;
  uiTexts: any;
  
  shopStaff: any[];
  selectedBarber: any | null;
  setSelectedBarber: (barber: any | null) => void;

  renderDateAndTime: () => React.ReactNode;
  renderServices: () => React.ReactNode;
  renderSummary: () => React.ReactNode;
  
  onConfirm: () => void;
  isConfirmDisabled: boolean;
  confirmLoading: boolean;
  isPackage: boolean;
  
  // Date and Time selection check to enable "Continue" on Step 2
  hasSelectedDateTime: boolean;
  totalAmount?: number;
  summaryFooterInfo?: { method: string, servicesText: string };
}

const STEPS = ['Barber', 'Date & Time', 'Services', 'Summary'];

export default function BookingWizardModal({
  visible,
  onClose,
  shopName,
  accentColor,
  uiTexts,
  shopStaff,
  selectedBarber,
  setSelectedBarber,
  renderDateAndTime,
  renderServices,
  renderSummary,
  onConfirm,
  isConfirmDisabled,
  confirmLoading,
  isPackage,
  hasSelectedDateTime,
  totalAmount,
  summaryFooterInfo,
}: BookingWizardModalProps) {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(0);

  // Reset step when modal opens
  useEffect(() => {
    if (visible) {
      setCurrentStep(0);
    }
  }, [visible]);

  if (!visible) return null;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onConfirm();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      onClose();
    }
  };

  const renderProgressBar = () => {
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressLabels}>
          {STEPS.map((step, index) => (
            <Text 
              key={index} 
              style={[
                styles.progressLabelText, 
                currentStep === index && { color: accentColor, fontWeight: 'bold' },
                currentStep > index && { color: Colors.textLight }
              ]}
            >
              {step}
            </Text>
          ))}
        </View>
        <View style={styles.progressBarBg}>
          {STEPS.map((step, index) => (
            <View 
              key={index} 
              style={[
                styles.progressSegment,
                currentStep >= index && { backgroundColor: accentColor }
              ]} 
            />
          ))}
        </View>
      </View>
    );
  };

  const renderBarberSelection = () => (
    <Animated.View entering={FadeIn} style={styles.stepContent}>
      <Text style={styles.stepTitle}>Choose Your Barber</Text>
      <Text style={styles.stepSubtitle}>Select a barber or let us assign the best available</Text>
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <TouchableOpacity
          style={[
            styles.barberCard,
            selectedBarber === null && { borderColor: accentColor }
          ]}
          onPress={() => setSelectedBarber(null)}
        >
          <View style={[styles.barberIconContainer, { backgroundColor: 'rgba(212, 175, 55, 0.1)' }]}>
            <User size={24} color={accentColor} />
          </View>
          <View style={styles.barberInfo}>
            <Text style={styles.barberName}>Any Available</Text>
            <Text style={styles.barberSpec}>We'll assign the best barber for you</Text>
          </View>
          {selectedBarber === null && (
            <CheckCircle size={20} color={accentColor} />
          )}
        </TouchableOpacity>

        {shopStaff.map((staff) => (
          <TouchableOpacity
            key={staff.id}
            style={[
              styles.barberCard,
              selectedBarber?.id === staff.id && { borderColor: accentColor }
            ]}
            onPress={() => setSelectedBarber(staff)}
          >
            {staff.image ? (
              <Image source={{ uri: staff.image }} style={styles.barberAvatar} />
            ) : (
              <View style={[styles.barberIconContainer, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
                <User size={24} color={Colors.textLight} />
              </View>
            )}
            
            <View style={styles.barberInfo}>
              <Text style={styles.barberName}>{staff.name}</Text>
              <Text style={styles.barberSpec}>{staff.specialization || 'Staff'}</Text>
              {staff.ranking && (
                <Text style={styles.barberRating}>⭐ {staff.ranking}</Text>
              )}
            </View>
            {selectedBarber?.id === staff.id ? (
              <CheckCircle size={20} color={accentColor} />
            ) : (
              <ChevronRight size={20} color={Colors.textLight} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );

  const getStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderBarberSelection();
      case 1:
        return (
          <Animated.View entering={SlideInRight} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Date & Time</Text>
            <Text style={styles.stepSubtitle}>Select when you want to visit</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              {renderDateAndTime()}
            </ScrollView>
          </Animated.View>
        );
      case 2:
        return (
          <Animated.View entering={SlideInRight} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Services</Text>
            <Text style={styles.stepSubtitle}>Review your selected services</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              {renderServices()}
            </ScrollView>
          </Animated.View>
        );
      case 3:
        return (
          <Animated.View entering={SlideInRight} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Summary</Text>
            <Text style={styles.stepSubtitle}>Review and confirm your booking</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 180 }}>
              {renderSummary()}
            </ScrollView>
          </Animated.View>
        );
      default:
        return null;
    }
  };

  const getContinueButtonState = () => {
    if (currentStep === 0) return { disabled: false, text: 'Continue' };
    if (currentStep === 1) return { disabled: !hasSelectedDateTime, text: 'Continue' };
    if (currentStep === 2) return { disabled: false, text: 'Continue to Summary' };
    if (currentStep === 3) return { 
      disabled: isConfirmDisabled, 
      text: `${isPackage ? uiTexts.purchasePackage : uiTexts.confirmBooking}${totalAmount ? ` · ₹${totalAmount}` : ''}`
    };
    return { disabled: false, text: 'Continue' };
  };

  const continueBtnState = getContinueButtonState();

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleBack}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.shopName}>{shopName || 'Shop'}</Text>
            <Text style={[styles.stepName, { color: Colors.text }]}>
              {STEPS[currentStep]}
            </Text>
          </View>
          <Text style={styles.stepCounter}>
            {currentStep + 1} / {STEPS.length}
          </Text>
        </View>

        {renderProgressBar()}

        {/* Content */}
        <View style={styles.contentContainer}>
          {getStepContent()}
        </View>

        {/* Footer Button */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {currentStep === 3 && totalAmount !== undefined && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 }}>
              <View>
                <Text style={{ color: Colors.textLight, fontSize: 14 }}>Total Amount</Text>
                <Text style={{ color: accentColor, fontSize: 24, fontWeight: 'bold' }}>₹{totalAmount}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                <Text style={{ color: Colors.textLight, fontSize: 14 }}>{summaryFooterInfo?.method}</Text>
                <Text style={{ color: Colors.textLight, fontSize: 14 }}>{summaryFooterInfo?.servicesText}</Text>
              </View>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.continueButton,
              { backgroundColor: accentColor },
              continueBtnState.disabled && styles.continueButtonDisabled
            ]}
            onPress={handleNext}
            disabled={continueBtnState.disabled || confirmLoading}
          >
            {confirmLoading && currentStep === 3 ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.continueButtonText}>{continueBtnState.text}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  shopName: {
    color: Colors.textLight,
    fontSize: 12,
    marginBottom: 2,
  },
  stepName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  stepCounter: {
    color: Colors.textLight,
    fontSize: 14,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressLabelText: {
    fontSize: 12,
    color: '#555',
    flex: 1,
    textAlign: 'center',
  },
  progressBarBg: {
    flexDirection: 'row',
    height: 4,
    backgroundColor: '#1E1E1E',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressSegment: {
    flex: 1,
    height: '100%',
    backgroundColor: '#333',
    marginRight: 2,
  },
  contentContainer: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
    padding: 20,
  },
  stepTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'serif',
    marginBottom: 8,
  },
  stepSubtitle: {
    color: Colors.textLight,
    fontSize: 14,
    marginBottom: 24,
  },
  barberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  barberIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  barberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
  },
  barberInfo: {
    flex: 1,
  },
  barberName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  barberSpec: {
    color: Colors.textLight,
    fontSize: 14,
  },
  barberRating: {
    color: '#FFD700',
    fontSize: 12,
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
  },
  continueButton: {
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
