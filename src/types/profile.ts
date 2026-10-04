/**
 * A DepositLock user profile.
 *
 * Deliberately carries no role: roles in DepositLock are tenancy-specific
 * (a user can be a tenant in one tenancy and a landlord in another) and are
 * derived from tenancy relationships, never from this record.
 *
 * Shaped so the local repository can be swapped for Supabase without
 * touching any consumer.
 */
export type UserProfile = {
  id: string;
  fullName: string;
  email: string;
  walletAddress: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What the create/edit form collects from the user. */
export type ProfileFormValues = {
  fullName: string;
  email: string;
};

export type ProfileFormErrors = {
  fullName?: string;
  email?: string;
  walletAddress?: string;
};

export type ProfileValidationResult = {
  valid: boolean;
  errors: ProfileFormErrors;
  /** Trimmed, normalised values — only meaningful when `valid` is true. */
  values: ProfileFormValues;
};
