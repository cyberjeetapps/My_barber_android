import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, getDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Heart, Bell, Headphones, Ticket, MapPin, X, Gift, Award, Share2 } from 'lucide-react-native';
import { FeaturePage, FeatureCard } from '@/components/FeatureUI';
import { listFavorites, removeFavorite, FavoriteRecord } from '@/utils/favorites';
import { getMyReferralCode, redeemReferralCode, GOLD_REFERRAL_STEP, GOLD_DURATION_DAYS, REFERRAL_REWARD_POINTS } from '@/utils/referral';
import { toast } from '@/utils/toast';
import Colors from '@/constants/Colors';
import { TextInput, Share } from 'react-native';

type NotificationDoc = {
  id: string;
  content?: string;
  type?: string;
  read?: boolean;
  metadata?: { timestamp?: string; shopId?: string };
};

type RecentSalon = { shopId: string; shopName: string; lastVisit: string };

export default function CustomerTools() {
  const { user } = useAuth();
  const router = useRouter();
  const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
  const [recentSalons, setRecentSalons] = useState<RecentSalon[]>([]);
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [ticketCount, setTicketCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [myReferralCode, setMyReferralCode] = useState('');
  const [rewardPoints, setRewardPoints] = useState(0);
  const [isGold, setIsGold] = useState(false);
  const [successfulReferralCount, setSuccessfulReferralCount] = useState(0);
  const [goldExpiresAt, setGoldExpiresAt] = useState<Date | null>(null);
  const [freeServiceCredits, setFreeServiceCredits] = useState(0);
  const [alreadyReferred, setAlreadyReferred] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const [favSnap, apptSnap, notifSnap, ticketSnap, myCode, myDoc] = await Promise.all([
        // Favorites
        (async () => listFavorites(user.uid, 'shop'))(),
        // Recent salons — derived from real appointment history, most recent per shop
        getDocs(query(collection(db, 'appointments'), where('userId', '==', user.uid))),
        // Notification centre — the real collection the booking flow already writes to
        getDocs(query(collection(db, 'notifications'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'supportTickets'), where('createdBy', '==', user.uid))),
        getMyReferralCode(user.uid),
        getDoc(doc(db, 'users', user.uid)),
      ]);

      setFavorites(favSnap);
      setMyReferralCode(myCode);

      const myData = myDoc.data();
      setRewardPoints(myData?.rewardPoints || 0);
      setIsGold(!!myData?.goldTierGranted);
      setFreeServiceCredits(myData?.freeServiceCredits || 0);
      setAlreadyReferred(!!myData?.referredBy);
      setSuccessfulReferralCount(myData?.successfulReferralCount || 0);
      setGoldExpiresAt(myData?.goldExpiresAt?.toDate ? myData.goldExpiresAt.toDate() : null);

      const byShop = new Map<string, RecentSalon>();
      apptSnap.docs.forEach((d) => {
        const a = d.data();
        if (!a.shopId || !a.dateTime) return;
        const existing = byShop.get(a.shopId);
        if (!existing || a.dateTime > existing.lastVisit) {
          byShop.set(a.shopId, { shopId: a.shopId, shopName: a.shopName || 'Salon', lastVisit: a.dateTime });
        }
      });
      setRecentSalons(
        Array.from(byShop.values()).sort((a, b) => (a.lastVisit < b.lastVisit ? 1 : -1)).slice(0, 5)
      );

      const notifs = notifSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort((a, b) => {
          const ta = a.metadata?.timestamp || '';
          const tb = b.metadata?.timestamp || '';
          return ta < tb ? 1 : -1;
        })
        .slice(0, 30);
      setNotifications(notifs);

      setTicketCount(ticketSnap.size);
    } catch (err) {
      console.warn('Failed to load customer tools data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleRedeemReferral = async () => {
    if (!user?.uid) return;
    setRedeeming(true);
    try {
      await redeemReferralCode(user.uid, redeemInput);
      toast.success('Code applied', "You'll both benefit once you complete your first booking.");
      setRedeemInput('');
      load();
    } catch (err: any) {
      toast.error('Could not apply code', err.message || 'Please check the code and try again.');
    } finally {
      setRedeeming(false);
    }
  };

  const shareReferralCode = async () => {
    try {
      await Share.share({
        message: `Join me on MyBarber! Use my code ${myReferralCode} when you sign up.`,
      });
    } catch {
      // user cancelled the share sheet — nothing to do
    }
  };

  const createSupportTicket = async () => {
    if (!user?.uid) return;
    try {
      await addDoc(collection(db, 'supportTickets'), {
        createdBy: user.uid,
        createdByRole: 'customer',
        category: 'general',
        priority: 'normal',
        status: 'open',
        subject: 'Customer support request',
        description: 'Please contact me regarding my MyBarber account or booking.',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Request created', 'Your support ticket is now visible to the admin team.');
      load();
    } catch {
      toast.error('Unable to create request', 'Please try again.');
    }
  };

  const handleRemoveFavorite = async (fav: FavoriteRecord) => {
    setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
    try {
      await removeFavorite(fav.id);
    } catch {
      toast.error('Could not remove favorite');
      load();
    }
  };

  const markNotificationRead = async (n: NotificationDoc) => {
    if (n.read) return;
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      await updateDoc(doc(db, 'notifications', n.id), { read: true });
    } catch {
      // non-critical — a stale unread flag isn't worth surfacing an error for
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <FeaturePage title="MyBarber Customer Tools" subtitle="Convenience, support and repeat-booking features" loading>
        <View />
      </FeaturePage>
    );
  }

  return (
    <FeaturePage title="MyBarber Customer Tools" subtitle="Convenience, support and repeat-booking features">
      {/* Rewards & referrals */}
      <View style={[styles.rewardsCard, isGold && styles.rewardsCardGold]}>
        <View style={styles.rewardsTop}>
          <View>
            <Text style={styles.rewardsPoints}>{rewardPoints} pts</Text>
            <Text style={styles.rewardsSub}>
              {isGold
                ? goldExpiresAt
                  ? `Gold member — expires ${goldExpiresAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                  : 'Gold member'
                : `${successfulReferralCount % GOLD_REFERRAL_STEP} of ${GOLD_REFERRAL_STEP} referrals to Gold`}
            </Text>
          </View>
          {isGold && (
            <View style={styles.goldBadge}>
              <Award size={16} color="#7a5c00" />
              <Text style={styles.goldBadgeText}>GOLD</Text>
            </View>
          )}
        </View>

        {freeServiceCredits > 0 && (
          <Text style={styles.creditsText}>
            🎁 You have {freeServiceCredits} free service credit{freeServiceCredits === 1 ? '' : 's'} — mention it at your next booking.
          </Text>
        )}

        <View style={styles.referralRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.referralLabel}>Your referral code</Text>
            <Text style={styles.referralCode}>{myReferralCode || '…'}</Text>
          </View>
          <TouchableOpacity style={styles.shareButton} onPress={shareReferralCode}>
            <Share2 size={16} color="#fff" />
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.rewardsHint}>
          Earn {REFERRAL_REWARD_POINTS} points every time someone you invite completes their
          first booking. Every {GOLD_REFERRAL_STEP} successful referrals earns {GOLD_DURATION_DAYS} days
          of Gold status and a free service — Gold expires automatically after {GOLD_DURATION_DAYS} days.
        </Text>

        {!alreadyReferred && (
          <View style={styles.redeemRow}>
            <TextInput
              style={styles.redeemInput}
              placeholder="Have a friend's code?"
              placeholderTextColor={Colors.textLight}
              value={redeemInput}
              onChangeText={setRedeemInput}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={styles.redeemButton}
              onPress={handleRedeemReferral}
              disabled={redeeming || !redeemInput.trim()}
            >
              {redeeming ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.redeemButtonText}>Apply</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Favorites */}
      <TouchableOpacity onPress={() => setShowFavorites((v) => !v)} activeOpacity={0.8}>
        <FeatureCard
          title="Favourite salons"
          description="Save preferred salons — tap the heart on any salon card to add one."
          badge={`${favorites.length} saved`}
        />
      </TouchableOpacity>
      {showFavorites && (
        <View style={styles.expandedPanel}>
          {favorites.length === 0 ? (
            <Text style={styles.emptyText}>No favorites yet — tap the heart icon on a salon card on the Home tab.</Text>
          ) : (
            favorites.map((fav) => (
              <View key={fav.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowTitle}>{fav.label}</Text>
                  {!!fav.subLabel && <Text style={styles.listRowSub}>{fav.subLabel}</Text>}
                </View>
                <TouchableOpacity onPress={() => handleRemoveFavorite(fav)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={18} color={Colors.textLight} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      {/* Recent salons — real, derived from booking history */}
      <FeatureCard
        title="Recent salons"
        description={
          recentSalons.length
            ? recentSalons.map((s) => s.shopName).join(' · ')
            : 'Salons you book with will show up here.'
        }
      />

      {/* Appointment lifecycle — real, existing screen */}
      <FeatureCard
        title="Appointment status, reschedule & cancellation"
        description="Track status, reschedule to a new time, or cancel — all from your Appointments tab."
        onPress={() => router.push('/(tabs)/appointments')}
      />

      <FeatureCard
        title="Book again"
        description="Open a past appointment and tap Book Again to repeat it in one step."
        onPress={() => router.push('/(tabs)/appointments')}
      />

      <FeatureCard
        title="Verified reviews"
        description="Rating is only unlocked once your appointment is marked completed."
        onPress={() => router.push('/(tabs)/appointments')}
      />

      {/* Support */}
      <TouchableOpacity onPress={createSupportTicket} activeOpacity={0.8}>
        <FeatureCard
          title="Customer support"
          description="Create a support ticket connected to the admin support console."
          badge={`${ticketCount} tickets`}
        />
      </TouchableOpacity>

      {/* Notification centre — real, reads the same collection the booking flow writes to */}
      <TouchableOpacity onPress={() => setShowNotifications((v) => !v)} activeOpacity={0.8}>
        <FeatureCard
          title="Notification centre"
          description="Booking, reschedule, cancellation and offer updates."
          badge={`${unreadCount} unread`}
        />
      </TouchableOpacity>
      {showNotifications && (
        <View style={styles.expandedPanel}>
          {notifications.length === 0 ? (
            <Text style={styles.emptyText}>No notifications yet.</Text>
          ) : (
            notifications.map((n) => (
              <TouchableOpacity key={n.id} style={styles.listRow} onPress={() => markNotificationRead(n)} activeOpacity={0.7}>
                {!n.read && <View style={styles.unreadDot} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listRowTitle, n.read && { color: Colors.textLight }]}>
                    {n.content || 'Notification'}
                  </Text>
                  {!!n.metadata?.timestamp && (
                    <Text style={styles.listRowSub}>{new Date(n.metadata.timestamp).toLocaleString()}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      <FeatureCard
        title="Coupons and offers"
        description="Enter a coupon code on the booking screen — it's validated live against active offers, minimum spend and expiry."
        onPress={() => router.push('/(tabs)/services')}
      />

      <FeatureCard
        title="Advanced salon filters"
        description="Open now, distance, price, rating, category, kids, premium and home service."
        onPress={() => router.push('/(tabs)/index')}
      />
    </FeaturePage>
  );
}

const styles = StyleSheet.create({
  rewardsCard: {
    backgroundColor: Colors.primary,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  rewardsCardGold: {
    backgroundColor: '#8a6d00',
  },
  rewardsTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rewardsPoints: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
  },
  rewardsSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  goldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  goldBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7a5c00',
  },
  creditsText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 12,
    lineHeight: 17,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  referralLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
  referralCode: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
    marginTop: 2,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  rewardsHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 10,
    lineHeight: 15,
  },
  redeemRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  redeemInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  redeemButton: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redeemButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  expandedPanel: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 12,
    marginTop: -6,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textLight,
    padding: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  listRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  listRowSub: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
});
