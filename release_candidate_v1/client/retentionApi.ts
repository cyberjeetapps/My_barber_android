import { getFunctions, httpsCallable } from 'firebase/functions';
import type { ReengagementRequest } from './models';

export async function sendLapsedCustomerOffer(input: ReengagementRequest) {
  const callable = httpsCallable<ReengagementRequest, { success: true; campaignId: string }>(
    getFunctions(undefined, 'us-central1'),
    'sendLapsedCustomerOffer',
  );
  const result = await callable(input);
  return result.data;
}
