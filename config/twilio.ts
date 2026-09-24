import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

type CallableResult = { success?: boolean; status?: string };

export const sendVerificationCode = async (phoneNumber: string) => {
  const call = httpsCallable<{ phoneNumber: string }, CallableResult>(functions, 'sendTwilioVerificationCode');
  const result = await call({ phoneNumber });
  return result.data;
};

export const verifyCode = async (phoneNumber: string, code: string) => {
  const call = httpsCallable<{ phoneNumber: string; code: string }, CallableResult>(functions, 'verifyTwilioCode');
  const result = await call({ phoneNumber, code });
  return result.data.success === true || result.data.status === 'approved';
};

export const sendWhatsAppNotification = async (to: string, message: string) => {
  const call = httpsCallable<{ to: string; message: string }, CallableResult>(functions, 'sendTwilioWhatsAppNotification');
  const result = await call({ to, message });
  return result.data;
};
