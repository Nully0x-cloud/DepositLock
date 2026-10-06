"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cancelTenancyInvitation,
  createTenancyInvitation,
  displayMessage,
  getSupabaseBrowserClient,
  isRepositoryError,
  listInvitationsForTenancy,
  type InvitationRecord,
  type IssuedInvitation,
} from "@/lib/db";
import { useRequireAuth } from "./use-require-auth";

const GENERIC_ERROR = "We couldn't load the invitations. Please try again.";

function errorCopy(cause: unknown): string {
  if (isRepositoryError(cause)) return cause.message;
  return GENERIC_ERROR;
}

export type TenancyInvitationsResult = {
  status: "hidden" | "loading" | "error" | "ready";
  invitations: InvitationRecord[];
  message: string | null;
  actionError: string | null;
  busy: boolean;
  retry(): void;
  issue(input: {
    email?: string | null;
    wallet?: string | null;
  }): Promise<IssuedInvitation | null>;
  cancel(invitationId: string): Promise<boolean>;
};

/**
 * Invitations of one tenancy for the landlord view (Phase 4).
 *
 * Hidden without Supabase or a session; loads under RLS (everyone else just
 * gets an empty list). Issuing and cancelling re-run the RPCs, which
 * re-validate tenancy state on every call — the panel never writes the table
 * directly.
 */
export function useTenancyInvitations(
  tenancyId: string,
): TenancyInvitationsResult {
  const { ready, authenticated, configured, userId } = useRequireAuth();

  const [loadToken, setLoadToken] = useState(0);
  const [state, setState] = useState<{
    key: string | null;
    invitations: InvitationRecord[];
    error: string | null;
  }>({ key: null, invitations: [], error: null });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured || !ready || !authenticated || !userId) return;

    const key = `${userId}:${tenancyId}:${loadToken}`;
    let cancelled = false;

    void (async () => {
      try {
        const client = getSupabaseBrowserClient();
        if (!client) throw new Error(GENERIC_ERROR);
        const result = await listInvitationsForTenancy(client, tenancyId);
        if (!result.ok) throw result.error;
        if (!cancelled) {
          setState({ key, invitations: result.data, error: null });
        }
      } catch (cause) {
        if (!cancelled) {
          setState({ key: null, invitations: [], error: errorCopy(cause) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, ready, authenticated, userId, tenancyId, loadToken]);

  const reload = useCallback(() => {
    setActionError(null);
    setLoadToken((value) => value + 1);
  }, []);

  const issue = useCallback(
    async (input: { email?: string | null; wallet?: string | null }) => {
      setBusy(true);
      setActionError(null);
      try {
        const client = getSupabaseBrowserClient();
        if (!client) {
          setActionError(GENERIC_ERROR);
          return null;
        }
        const result = await createTenancyInvitation(client, {
          tenancyId,
          email: input.email ?? null,
          wallet: input.wallet ?? null,
        });
        if (!result.ok) {
          setActionError(displayMessage(result.error));
          return null;
        }
        setLoadToken((value) => value + 1);
        return result.data;
      } finally {
        setBusy(false);
      }
    },
    [tenancyId],
  );

  const cancel = useCallback(async (invitationId: string) => {
    setBusy(true);
    setActionError(null);
    try {
      const client = getSupabaseBrowserClient();
      if (!client) {
        setActionError(GENERIC_ERROR);
        return false;
      }
      const result = await cancelTenancyInvitation(client, invitationId);
      if (!result.ok) {
        setActionError(displayMessage(result.error));
        return false;
      }
      setLoadToken((value) => value + 1);
      return true;
    } finally {
      setBusy(false);
    }
  }, []);

  const base = {
    invitations: state.invitations,
    message: state.error,
    actionError,
    busy,
    retry: reload,
    issue,
    cancel,
  };

  if (!configured) return { status: "hidden", ...base };
  if (!ready) return { status: "loading", ...base };
  if (!authenticated || !userId) return { status: "hidden", ...base };

  const key = `${userId}:${tenancyId}:${loadToken}`;
  if (state.key !== key) return { status: "loading", ...base };
  if (state.error) return { status: "error", ...base };

  return { status: "ready", ...base };
}
