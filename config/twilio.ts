import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const BACKEND_URL = 'https://backend.vps.mybarber.co.in';

type CallableResult = { success?: boolean; status?: string; message?: string };

/**
 * Send OTP verification code via backend (with Firebase Functions fallback)
 */
export const sendVerificationCode = async (phoneNumber: string): Promise<CallableResult> => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber }),
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'Failed to send OTP from backend');
    }

    return data;
  } catch (backendError: any) {
    console.warn('⚠️ Backend OTP send failed, attempting Firebase fallback:', backendError.message);
    try {
      const call = httpsCallable<{ phoneNumber: string }, CallableResult>(
        functions,
        'sendTwilioVerificationCode'
      );
      const result = await call({ phoneNumber });
      return result.data;
    } catch (fbError) {
      // Throw the more informative backend error if available
      throw backendError;
    }
  }
};

/**
 * Verify OTP code via backend (with Firebase Functions fallback)
 */
export const verifyCode = async (phoneNumber: string, code: string): Promise<boolean> => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber, code }),
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'Invalid verification code');
    }

    return data.success === true || data.status === 'approved';
  } catch (backendError: any) {
    console.warn('⚠️ Backend OTP verify failed, attempting Firebase fallback:', backendError.message);
    try {
      const call = httpsCallable<{ phoneNumber: string; code: string }, CallableResult>(
        functions,
        'verifyTwilioCode'
      );
      const result = await call({ phoneNumber, code });
      return result.data.success === true || result.data.status === 'approved';
    } catch (fbError) {
      throw backendError;
    }
  }
};

/**
 * Send WhatsApp notification via backend (with Firebase Functions fallback)
 */
export const sendWhatsAppNotification = async (to: string, message: string): Promise<CallableResult> => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, message }),
    });

    const data = await response.json();
    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'Failed to send WhatsApp notification');
    }
    return data;
  } catch (backendError: any) {
    console.warn('⚠️ Backend WhatsApp failed, attempting Firebase fallback:', backendError.message);
    const call = httpsCallable<{ to: string; message: string }, CallableResult>(
      functions,
      'sendTwilioWhatsAppNotification'
    );
    const result = await call({ to, message });
    return result.data;
  }
};
