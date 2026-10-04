import { describe, expect, it } from "vitest";
import type { UserProfile } from "@/types/profile";
import {
  createProfileRepository,
  parseProfile,
  PROFILE_STORAGE_KEY,
  type StorageLike,
} from "@/lib/profile/storage";

function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const PROFILE: UserProfile = {
  id: "profile_1",
  fullName: "Sarah Byrne",
  email: "sarah@example.ie",
  walletAddress: "7VxQmF2pL9sTnR4kW1jH6cB3dY8uA5eZqX0gN4Kp2",
  avatarUrl: null,
  createdAt: "2026-10-04T10:00:00.000Z",
  updatedAt: "2026-10-04T10:00:00.000Z",
};

describe("parseProfile", () => {
  it("reads a valid record", () => {
    expect(parseProfile(JSON.stringify(PROFILE))).toEqual(PROFILE);
  });

  it("returns null for nothing, broken JSON, or the wrong shape", () => {
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile("{oops")).toBeNull();
    expect(parseProfile(JSON.stringify({ id: "x" }))).toBeNull();
    expect(
      parseProfile(
        JSON.stringify({ ...PROFILE, walletAddress: undefined }),
      ),
    ).toBeNull();
    expect(parseProfile(JSON.stringify([PROFILE]))).toBeNull();
  });
});

describe("createProfileRepository", () => {
  it("round-trips a profile through its storage key", () => {
    const storage = fakeStorage();
    const repository = createProfileRepository(storage);

    expect(repository.read()).toBeNull();

    repository.write(PROFILE);
    expect(storage.map.has(PROFILE_STORAGE_KEY)).toBe(true);
    expect(repository.read()).toEqual(PROFILE);

    repository.clear();
    expect(repository.read()).toBeNull();
  });

  it("returns null instead of throwing on corrupt data", () => {
    const storage = fakeStorage();
    storage.map.set(PROFILE_STORAGE_KEY, "not json");
    expect(createProfileRepository(storage).read()).toBeNull();
  });

  it("survives a storage layer that throws entirely", () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const repository = createProfileRepository(hostile);

    expect(repository.read()).toBeNull();
    expect(() => repository.write(PROFILE)).not.toThrow();
    expect(() => repository.clear()).not.toThrow();
  });
});
