import { afterEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/lib/db/client-type";
import type { UserProfile } from "@/types/profile";
import {
  createSupabaseProfileRemoteStore,
  isProfileRemoteError,
  localProfileRemoteStore,
  ProfileRemoteError,
} from "./remote-store";
import { prefillFromCache } from "./profile-service";

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Sarah Byrne",
  email: "sarah.byrne@example.ie",
  walletAddress: "DEVWALLET-00000000000000000000SARAH00001",
  avatarUrl: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  ...overrides,
});

async function loadService(): Promise<typeof import("./profile-service")> {
  vi.resetModules();
  return import("./profile-service");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prefillFromCache (§26)", () => {
  it("seeds the create form when the cache belongs to the verified wallet", () => {
    const cached = profile();
    expect(prefillFromCache(cached, cached.walletAddress)).toEqual({
      fullName: "Sarah Byrne",
      email: "sarah.byrne@example.ie",
    });
  });

  it("refuses to prefill from someone else's cache", () => {
    const cached = profile();
    expect(prefillFromCache(cached, "DEVWALLET-00000000000000000000OTHER0001")).toBeNull();
  });

  it("refuses when either side is unknown", () => {
    expect(prefillFromCache(null, "DEVWALLET-00000000000000000000SARAH00001")).toBeNull();
    expect(prefillFromCache(profile(), null)).toBeNull();
    expect(prefillFromCache(profile({ walletAddress: null }), "DEVWALLET-00000000000000000000SARAH00001")).toBeNull();
  });
});

describe("resolveProfileRemoteStore", () => {
  it("falls back to the Phase 2 no-op store when unconfigured", async () => {
    const { resolveProfileRemoteStore: resolve } = await loadService();
    expect(resolve().mode).toBe("local");
  });

  it("uses Supabase once the public config is present", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_local");

    const { resolveProfileRemoteStore: resolve } = await loadService();
    expect(resolve().mode).toBe("supabase");
  });
});

describe("localProfileRemoteStore", () => {
  it("has no remote side at all", async () => {
    await expect(localProfileRemoteStore.load("user-id")).resolves.toBeNull();
    await expect(
      localProfileRemoteStore.create("user-id", { fullName: "A", email: "a@b.ie" }),
    ).rejects.toBeInstanceOf(ProfileRemoteError);
    await expect(
      localProfileRemoteStore.update("user-id", { fullName: "A", email: "a@b.ie" }),
    ).rejects.toBeInstanceOf(ProfileRemoteError);
  });
});

describe("createSupabaseProfileRemoteStore", () => {
  const ROW = {
    id: "11111111-1111-4111-8111-111111111111",
    wallet_address: "DEVWALLET-00000000000000000000SARAH00001",
    full_name: "Sarah Byrne",
    email: "sarah.byrne@example.ie",
    avatar_url: null,
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-01T10:00:00.000Z",
  };

  function fakeClient(response: {
    data: unknown;
    error?: { code?: string; message?: string } | null;
    onInsert?: (payload: Record<string, unknown>) => void;
  }) {
    const terminal = Promise.resolve({
      data: response.data,
      error: response.error ?? null,
    });
    const builder = {
      select: () => builder,
      eq: () => builder,
      insert: (payload: Record<string, unknown>) => {
        response.onInsert?.(payload);
        return builder;
      },
      update: () => builder,
      maybeSingle: () => terminal,
      then: (
        onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => terminal.then(onFulfilled, onRejected),
    };
    return { from: () => builder } as unknown as DbClient;
  }

  it("loads the profile keyed by the auth user id", async () => {
    const store = createSupabaseProfileRemoteStore(
      fakeClient({ data: ROW }),
    );
    const loaded = await store.load("11111111-1111-4111-8111-111111111111");
    expect(loaded).toMatchObject({ fullName: "Sarah Byrne" });
  });

  it("resolves null when the user has no profile row yet", async () => {
    const store = createSupabaseProfileRemoteStore(fakeClient({ data: null }));
    await expect(store.load("11111111-1111-4111-8111-111111111111")).resolves.toBeNull();
  });

  it("creates the row as auth.uid() and never sends a client-chosen wallet", async () => {
    let inserted: Record<string, unknown> | null = null;
    const store = createSupabaseProfileRemoteStore(
      fakeClient({
        data: [ROW],
        onInsert: (payload) => {
          inserted = payload;
        },
      }),
    );

    const created = await store.create("11111111-1111-4111-8111-111111111111", {
      fullName: "Sarah Byrne",
      email: "sarah.byrne@example.ie",
    });

    expect(created).toMatchObject({ id: "11111111-1111-4111-8111-111111111111" });
    expect(inserted).not.toBeNull();
    expect(inserted).toHaveProperty("id", "11111111-1111-4111-8111-111111111111");
    expect(inserted).not.toHaveProperty("wallet_address");
  });

  it("surfaces repository failures as render-safe ProfileRemoteErrors", async () => {
    const store = createSupabaseProfileRemoteStore(
      fakeClient({
        data: null,
        error: { code: "42501", message: "row-level security policy" },
      }),
    );

    await expect(
      store.load("11111111-1111-4111-8111-111111111111"),
    ).rejects.toSatisfy((cause: unknown) => isProfileRemoteError(cause));
  });
});
