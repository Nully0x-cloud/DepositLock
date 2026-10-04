"use client";

import { useProfileContext } from "@/providers/profile-provider";

/**
 * Read/write access to the local DepositLock profile.
 *
 * The profile carries no role — roles are tenancy-specific and derived from
 * tenancy relationships, never from this record.
 */
export function useProfile() {
  return useProfileContext();
}
