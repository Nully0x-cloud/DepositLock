"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getSupabaseBrowserClient,
  isRepositoryError,
  listSharedProfiles,
  listTenancySummaries,
  listVisibleParticipants,
} from "@/lib/db";
import { toPartyDirectory, toTenancy } from "@/lib/tenancy/view-model";
import { useProfileContext } from "@/providers/profile-provider";
import type { Tenancy } from "@/types/tenancy";
import { useRequireAuth } from "./use-require-auth";

export type TenanciesResult =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string; retry(): void }
  | { status: "ready"; tenancies: Tenancy[] };

type DataState = {
  key: string | null;
  tenancies: Tenancy[];
  error: string | null;
};

const GENERIC_ERROR = "We couldn't load your tenancies. Please try again.";

function errorCopy(cause: unknown): string {
  if (isRepositoryError(cause)) return cause.message;
  return GENERIC_ERROR;
}

/**
 * The signed-in user's tenancies, mapped to UI view models.
 *
 * States are explicit (§28): `loading` while Auth answers or rows load,
 * `unauthenticated` when there is no session yet, `error` with a retry for
 * failures, and `ready` with the list. Without Supabase configured this
   * returns a clear configuration error instead of substituting mock records.
 */
export function useTenancies(): TenanciesResult {
  const { ready, authenticated, configured, userId } = useRequireAuth();
  const { profile } = useProfileContext();

  const [token, setToken] = useState(0);
  const [state, setState] = useState<DataState>({
    key: null,
    tenancies: [],
    error: null,
  });

  const viewerEmail = profile?.email ?? null;

  useEffect(() => {
    if (!configured || !ready || !authenticated || !userId) return;

    const key = `${userId}:${token}`;
    let cancelled = false;

    void (async () => {
      try {
        const client = getSupabaseBrowserClient();
        if (!client) throw new Error(GENERIC_ERROR);

        const [summaries, participants, shared] = await Promise.all([
          listTenancySummaries(client),
          listVisibleParticipants(client),
          listSharedProfiles(client),
        ]);
        if (!summaries.ok) throw summaries.error;
        if (!participants.ok) throw participants.error;
        if (!shared.ok) throw shared.error;

        const directory = toPartyDirectory(shared.data);
        const viewer = { id: userId, email: viewerEmail };

        const tenancies = summaries.data.map((summary) =>
          toTenancy({
            tenancy: summary,
            property: summary.property,
            participants: participants.data.filter(
              (row) => row.tenancyId === summary.id,
            ),
            directory,
            viewer,
          }),
        );

        if (!cancelled) setState({ key, tenancies, error: null });
      } catch (cause) {
        if (!cancelled) {
          setState({ key, tenancies: [], error: errorCopy(cause) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticated, configured, ready, token, userId, viewerEmail]);

  const key = configured && ready && authenticated && userId ? `${userId}:${token}` : null;
  const retry = useMemo(() => () => setToken((value) => value + 1), []);

  if (!configured) return { status: "error", message: "DepositLock is not connected to its Supabase project. Configure the required public environment variables and retry.", retry };
  if (!ready) return { status: "loading" };
  if (!authenticated) return { status: "unauthenticated" };

  if (state.key === key) {
    if (state.error) return { status: "error", message: state.error, retry };
    return { status: "ready", tenancies: state.tenancies };
  }

  return { status: "loading" };
}
