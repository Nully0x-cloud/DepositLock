"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getTenancyById,
  getPropertyById,
  isRepositoryError,
  listActivityByTenancy,
  listEvidenceByTenancy,
  listSharedProfiles,
  listTenancyParticipants,
  getSupabaseBrowserClient,
} from "@/lib/db";
import { getTenancyById as getMockTenancyById } from "@/data/tenancies";
import { toPartyDirectory, toTenancy } from "@/lib/tenancy/view-model";
import { useProfileContext } from "@/providers/profile-provider";
import type { Tenancy } from "@/types/tenancy";
import { useRequireAuth } from "./use-require-auth";

export type TenancyRecordResult =
  | { status: "loading" }
  | { status: "unauthenticated" }
  /**
   * The record is invisible to this session: either it does not exist or
   * RLS filtered it out. Deliberately indistinguishable — the UI must not
   * confirm the existence of somebody else's tenancy (§29).
   */
  | { status: "unavailable" }
  | { status: "error"; message: string; retry(): void }
  /** `refresh()` re-reads the record — used after a deposit action lands. */
  | { status: "ready"; tenancy: Tenancy; refresh(): void };

type RecordState = {
  key: string | null;
  tenancy: Tenancy | null;
  unavailable: boolean;
  error: string | null;
};

const GENERIC_ERROR = "We couldn't load this tenancy record. Please try again.";

function errorCopy(cause: unknown): string {
  if (isRepositoryError(cause)) return cause.message;
  return GENERIC_ERROR;
}

/** One tenancy record for the signed-in participant, fully assembled. */
export function useTenancyRecord(id: string): TenancyRecordResult {
  const { ready, authenticated, configured, userId } = useRequireAuth();
  const { profile } = useProfileContext();

  const [token, setToken] = useState(0);
  const [state, setState] = useState<RecordState>({
    key: null,
    tenancy: null,
    unavailable: false,
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

        const tenancyResult = await getTenancyById(client, id);
        if (!tenancyResult.ok) {
          if (tenancyResult.error.code === "not_found") {
            if (!cancelled) {
              setState({ key, tenancy: null, unavailable: true, error: null });
            }
            return;
          }
          throw tenancyResult.error;
        }
        const tenancy = tenancyResult.data;

        const [propertyResult, participantsResult, evidenceResult, activityResult, sharedResult] =
          await Promise.all([
            getPropertyById(client, tenancy.propertyId),
            listTenancyParticipants(client, id),
            listEvidenceByTenancy(client, id),
            listActivityByTenancy(client, id),
            listSharedProfiles(client),
          ]);

        if (!participantsResult.ok) throw participantsResult.error;
        if (!evidenceResult.ok) throw evidenceResult.error;
        if (!activityResult.ok) throw activityResult.error;
        if (!sharedResult.ok) throw sharedResult.error;

        const mapped = toTenancy({
          tenancy,
          property: propertyResult.ok ? propertyResult.data : null,
          participants: participantsResult.data,
          directory: toPartyDirectory(sharedResult.data),
          viewer: { id: userId, email: viewerEmail },
          evidence: evidenceResult.data,
          activity: activityResult.data,
        });

        if (!cancelled) {
          setState({ key, tenancy: mapped, unavailable: false, error: null });
        }
      } catch (cause) {
        if (!cancelled) {
          setState({ key, tenancy: null, unavailable: false, error: errorCopy(cause) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticated, configured, id, ready, token, userId, viewerEmail]);

  const key = configured && ready && authenticated && userId ? `${userId}:${token}` : null;
  const retry = useMemo(() => () => setToken((value) => value + 1), []);

  if (!configured) {
    const mock = getMockTenancyById(id);
    return mock
      ? { status: "ready", tenancy: mock, refresh: retry }
      : { status: "unavailable" };
  }
  if (!ready) return { status: "loading" };
  if (!authenticated) return { status: "unauthenticated" };

  if (state.key === key) {
    if (state.unavailable) return { status: "unavailable" };
    if (state.error) return { status: "error", message: state.error, retry };
    if (state.tenancy) return { status: "ready", tenancy: state.tenancy, refresh: retry };
  }

  return { status: "loading" };
}
