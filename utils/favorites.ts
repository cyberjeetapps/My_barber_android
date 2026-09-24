import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/config/firebase';

// One doc per (user, type, targetId) using a deterministic ID, so
// toggling favorite twice is naturally idempotent — no duplicate
// favorites, no need for a query-then-write race.

export type FavoriteType = 'shop' | 'barber';

export type FavoriteRecord = {
  id: string;
  userId: string;
  type: FavoriteType;
  targetId: string;
  label: string;
  subLabel?: string;
  shopId?: string;
  createdAt: any;
};

const favoriteDocId = (userId: string, type: FavoriteType, targetId: string) =>
  `${userId}_${type}_${targetId}`;

export async function isFavorited(userId: string, type: FavoriteType, targetId: string) {
  const snap = await getDocs(
    query(collection(db, 'favorites'), where('userId', '==', userId), where('type', '==', type), where('targetId', '==', targetId))
  );
  return !snap.empty;
}

export async function toggleFavorite(params: {
  userId: string;
  type: FavoriteType;
  targetId: string;
  label: string;
  subLabel?: string;
  shopId?: string;
  currentlyFavorited: boolean;
}) {
  const { userId, type, targetId, label, subLabel, shopId, currentlyFavorited } = params;
  const ref = doc(db, 'favorites', favoriteDocId(userId, type, targetId));
  if (currentlyFavorited) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, {
    userId,
    type,
    targetId,
    label,
    subLabel: subLabel || '',
    shopId: shopId || targetId,
    createdAt: new Date().toISOString(),
  });
  return true;
}

export async function listFavorites(userId: string, type?: FavoriteType): Promise<FavoriteRecord[]> {
  const constraints = [where('userId', '==', userId)];
  if (type) constraints.push(where('type', '==', type));
  const snap = await getDocs(query(collection(db, 'favorites'), ...constraints));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function removeFavorite(favoriteId: string) {
  await deleteDoc(doc(db, 'favorites', favoriteId));
}
