import { afterEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/lib/db/client-type";
import type { UserProfile } from "@/types/profile";
import { localProfileRemoteStore, createSupabaseProfileRemoteStore } from "./remote-store";
import { reconcileProfile } from "./profile-service";

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

describe("reconcileProfile", () => {
  it("keeps local state when the remote has nothing", () => {
    const local = profile();
    expect(reconcileProfile(local, null)).toBeNull();
  });

  it("adopts the remote profile when there is no local one", () => {
    const remote = profile();
    expect(reconcileProfile(null, remote)).toBe(remote);
  });

  it("keeps the local profile when it is newer", () => {
    const local = profile({ updatedAt: "2026-10-02T10:00:00.000Z" });
    const remote = profile({ updatedAt: "2026-10-01T10:00:00.000Z" });
    expect(reconcileProfile(local, remote)).toBeNull();
  });

  it("adopts the remote profile when it is newer", () => {
    const local = profile({ updatedAt: "2026-10-01T10:00:00.000Z" });
    const remote = profile({ updatedAt: "2026-10-02T10:00:00.000Z" });
    expect(reconcileProfile(local, remote)).toBe(remote);
  });

  it("never overwrites on an identical timestamp", () => {
    const local = profile();
    const remote = profile({ fullName: "Sarah B." });
    expect(reconcileProfile(local, remote)).toBeNull();
  });
});

describe("resolveProfileRemoteStore", () => {
  it("falls back to the Phase 2 no-op store when unconfigured", async () => {
    const { resolveProfileRemoteStore } = await loadService();
    expect(resolveProfileRemoteStore().mode).toBe("local");
  });

  it("uses Supabase once the public config is present", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_local");

    const { resolveProfileRemoteStore } = await loadService();
    expect(resolveProfileRemoteStore().mode).toBe("supabase");
  });
});

describe("localProfileRemoteStore", () => {
  it("has no remote side at all", async () => {
    await expect(localProfileRemoteStore.load("wallet")).resolves.toBeNull();
    await expect(localProfileRemoteStore.push(profile())).resolves.toBeUndefined();
  });
});

describe("createSupabaseProfileRemoteStore", () => {
  const explodingClient = {
    from() {
      throw new Error("the client must not be touched");
    },
  } as unknown as DbClient;

  it("loads nothing without a wallet to bind to", async () => {
    const store = createSupabaseProfileRemoteStore(explodingClient);
    await expect(store.load(null)).resolves.toBeNull();
  });

  it("skips the push when the profile has no wallet", async () => {
    const store = createSupabaseProfileRemoteStore(explodingClient);
    const walletLess = profile({ walletAddress: null });
    await expect(store.push(walletLess)).resolves.toBeUndefined();
  });
});
