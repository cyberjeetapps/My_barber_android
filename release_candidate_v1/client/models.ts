export type FavouriteTargetType = 'shop' | 'barber';

export type Favourite = {
  userId: string;
  targetType: FavouriteTargetType;
  targetId: string;
  createdAt: unknown;
};

export type WaitlistStatus =
  | 'waiting'
  | 'offered'
  | 'accepted'
  | 'expired'
  | 'cancelled';

export type WaitlistEntry = {
  userId: string;
  shopId: string;
  serviceId: string;
  requestedStart: unknown;
  requestedEnd: unknown;
  partySize: number;
  status: WaitlistStatus;
  createdAt: unknown;
};

export type ReengagementRequest = {
  customerId: string;
  shopId: string;
  templateId: 'COMEBACK_10' | 'COMEBACK_FLAT_100' | 'WE_MISS_YOU';
  expiresInDays: 3 | 7 | 14;
};
