import type { UserProfile } from "@/types/profile";

export type VisibleProfileInput = {
  /** Raw in-memory snapshot from the profile store. */
  snapshot: UserProfile | null;
  /** False when no Supabase project is configured (Phase 2 local mode). */
  configured: boolean;
  /** True only with a live Supabase Auth session. */
  authenticated: boolean;
  /** `auth.uid()` for the current session, or null. */
  userId: string | null;
  /** The user id the snapshot was last synced for, or null. */
  syncedFor: string | null;
};

/**
 * Decides which profile the UI may render.
 *
 * The store snapshot is asynchronous: after a sign-in, wallet switch, or
 * session restore it still holds the *previous* identity until the remote
 * row for the current `auth.uid()` finishes loading. Rendering it
 * meanwhile would show one wallet's name, tenancy context, and prefill
 * state under another wallet's session — including a brief flash of user
 * A's profile (and A's tenancy-derived email) after user B signs in.
 *
 * When a backend is configured the snapshot is therefore only visible
 * once it has been synced for exactly the current user. Without a backend
 * there is no remote authority, so the local snapshot passes through.
 */
export function selectVisibleProfile(input: VisibleProfileInput): UserProfile | null {
  if (!input.configured) return input.snapshot;
  if (!input.authenticated || !input.userId) return null;
  if (input.syncedFor !== input.userId) return null;
  return input.snapshot;
}
