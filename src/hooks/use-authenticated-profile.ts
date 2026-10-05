"use client";

import { useProfileContext } from "@/providers/profile-provider";
import { useRequireAuth, type AuthGate } from "./use-require-auth";

export type AuthenticatedProfile = AuthGate & {
  /**
   * Profile of the signed-in user. Without Supabase configured this falls
   * back to the Phase 2 local profile; otherwise it is null until the remote
   * row has been adopted (or the session ends).
   */
  profile: ReturnType<typeof useProfileContext>["profile"];
  /** True while Auth is handshaking or the remote profile is loading. */
  loading: boolean;
  /** Remote sync state (`idle` when no backend is configured). */
  syncStatus: ReturnType<typeof useProfileContext>["syncStatus"];
  syncError: string | null;
  reloadProfile(): void;
};

/**
 * The profile that belongs to the current session, plus everything a view
 * needs to distinguish loading / signed-out / error / ready (spec §11).
 */
export function useAuthenticatedProfile(): AuthenticatedProfile {
  const auth = useRequireAuth();
  const { profile, syncStatus, syncError, reloadProfile } = useProfileContext();

  const visible = auth.configured
    ? auth.authenticated
      ? profile
      : null
    : profile;

  return {
    ...auth,
    profile: visible,
    loading: !auth.ready || syncStatus === "loading",
    syncStatus,
    syncError,
    reloadProfile,
  };
}
