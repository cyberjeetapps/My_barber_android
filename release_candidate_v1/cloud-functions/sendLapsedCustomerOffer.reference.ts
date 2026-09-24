/**
 * Reference implementation. Copy into functions/src only during an approved
 * integration change. It is deliberately not imported by the live index.ts.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const ALLOWED_TEMPLATES = new Set(['COMEBACK_10', 'COMEBACK_FLAT_100', 'WE_MISS_YOU']);
const COOLDOWN_DAYS = 30;
const DAILY_SHOP_CAP = 100;

export const sendLapsedCustomerOfferReference = onCall(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const { customerId, shopId, templateId, expiresInDays } = request.data ?? {};
    if (![customerId, shopId, templateId].every((v) => typeof v === 'string' && v.trim())) {
      throw new HttpsError('invalid-argument', 'Customer, shop and template are required');
    }
    if (!ALLOWED_TEMPLATES.has(templateId) || ![3, 7, 14].includes(expiresInDays)) {
      throw new HttpsError('invalid-argument', 'Unsupported campaign configuration');
    }

    const db = getFirestore();
    const [shopSnap, userSnap] = await Promise.all([
      db.doc(`shops/${shopId}`).get(),
      db.doc(`users/${customerId}`).get(),
    ]);
    if (!shopSnap.exists || shopSnap.data()?.ownerId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'You do not own this shop');
    }
    if (!userSnap.exists || !userSnap.data()?.phone) {
      throw new HttpsError('failed-precondition', 'Customer phone is unavailable');
    }
    if (userSnap.data()?.marketingOptOut === true) {
      throw new HttpsError('failed-precondition', 'Customer opted out of marketing');
    }

    const now = Timestamp.now();
    const cooldownStart = Timestamp.fromMillis(now.toMillis() - COOLDOWN_DAYS * 86400000);
    const dayStart = Timestamp.fromMillis(new Date().setHours(0, 0, 0, 0));

    const [recentCustomerSend, shopToday] = await Promise.all([
      db.collection('reengagementCampaigns')
        .where('shopId', '==', shopId)
        .where('customerId', '==', customerId)
        .where('createdAt', '>=', cooldownStart)
        .limit(1)
        .get(),
      db.collection('reengagementCampaigns')
        .where('shopId', '==', shopId)
        .where('createdAt', '>=', dayStart)
        .limit(DAILY_SHOP_CAP)
        .get(),
    ]);
    if (!recentCustomerSend.empty) {
      throw new HttpsError('resource-exhausted', 'A recent offer was already sent');
    }
    if (shopToday.size >= DAILY_SHOP_CAP) {
      throw new HttpsError('resource-exhausted', 'Daily send limit reached');
    }

    // Before production: calculate lapsed status server-side from completed bookings,
    // render an approved WhatsApp template, send through Twilio, then store its SID.
    const campaign = await db.collection('reengagementCampaigns').add({
      customerId,
      shopId,
      templateId,
      expiresInDays,
      ownerId: request.auth.uid,
      status: 'queued',
      createdAt: FieldValue.serverTimestamp(),
    });

    return { success: true as const, campaignId: campaign.id };
  },
);
