export type RetentionFeatureFlags = {
  crmReengagement: boolean;
  favourites: boolean;
  waitlist: boolean;
  postAppointmentReviewNudge: boolean;
};

// Safe default: every new capability is off until explicitly enabled.
export const DEFAULT_RETENTION_FEATURE_FLAGS: RetentionFeatureFlags = {
  crmReengagement: false,
  favourites: false,
  waitlist: false,
  postAppointmentReviewNudge: false,
};
