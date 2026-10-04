import { describe, expect, it, vi } from "vitest";
import type { ProfileRepository } from "@/lib/profile/storage";
import { createProfileStore } from "@/lib/profile/profile-store";

const WALLET = "7VxQmF2pL9sTnR4kW1jH6cB3dY8uA5eZqX0gN4Kp2";
const OTHER_WALLET = "9AbCdEfGh1234567890ijKLmNopQrStUvWxYz1234";

function memoryRepository() {
  let stored: ReturnType<ProfileRepository["read"]> = null;
  const repo: ProfileRepository = {
    read: () => stored,
    write: (profile) => {
      stored = profile;
    },
    clear: () => {
      stored = null;
    },
  };
  return { repo, peek: () => stored };
}

const VALID = { fullName: "Sarah Byrne", email: "sarah@example.ie" };

describe("createProfileStore", () => {
  it("starts empty and reports no snapshot on the server", () => {
    const store = createProfileStore(memoryRepository().repo);

    expect(store.getSnapshot()).toBeNull();
    expect(store.getServerSnapshot()).toBeNull();
  });

  it("creates a profile only when the form is valid", () => {
    const memory = memoryRepository();
    const store = createProfileStore(memory.repo);

    const bad = store.create({ fullName: "", email: "nope" }, WALLET);
    expect(bad.ok).toBe(false);
    expect(memory.peek()).toBeNull();
    expect(store.getSnapshot()).toBeNull();

    const good = store.create(VALID, WALLET);
    expect(good.ok).toBe(true);
    expect(store.getSnapshot()).toMatchObject({
      fullName: "Sarah Byrne",
      email: "sarah@example.ie",
      walletAddress: WALLET,
    });
    expect(memory.peek()).toEqual(store.getSnapshot());
  });

  it("never stores a role on the profile", () => {
    const store = createProfileStore(memoryRepository().repo);
    store.create(VALID, WALLET);

    const profile = store.getSnapshot();
    expect(profile).not.toBeNull();
    expect(Object.keys(profile as object)).not.toContain("role");
  });

  it("updates name and email while preserving id, wallet and history", () => {
    const store = createProfileStore(memoryRepository().repo);
    store.create(VALID, WALLET);

    const before = store.getSnapshot()!;

    const result = store.update({
      fullName: "Sarah N. Byrne",
      email: "s.n.byrne@example.ie",
    });

    expect(result.ok).toBe(true);
    const after = store.getSnapshot()!;
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.walletAddress).toBe(WALLET);
    expect(after.fullName).toBe("Sarah N. Byrne");
    expect(after.email).toBe("s.n.byrne@example.ie");
  });

  it("rejects an update that fails validation", () => {
    const store = createProfileStore(memoryRepository().repo);
    store.create(VALID, WALLET);
    const before = store.getSnapshot();

    const result = store.update({ fullName: "", email: "bad" });

    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toEqual(before);
  });

  it("refuses to update when there is no profile yet", () => {
    const store = createProfileStore(memoryRepository().repo);
    const result = store.update(VALID);

    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toBeNull();
  });

  it("rebinds the wallet without touching other fields", () => {
    const store = createProfileStore(memoryRepository().repo);
    store.create(VALID, WALLET);
    const before = store.getSnapshot()!;

    store.syncWallet(OTHER_WALLET);
    const after = store.getSnapshot()!;

    expect(after.walletAddress).toBe(OTHER_WALLET);
    expect(after.fullName).toBe(before.fullName);
    expect(after.email).toBe(before.email);
    expect(after.id).toBe(before.id);
  });

  it("does nothing when the wallet is unchanged or there is no profile", () => {
    const memory = memoryRepository();
    const store = createProfileStore(memory.repo);

    store.syncWallet(WALLET);
    expect(store.getSnapshot()).toBeNull();

    store.create(VALID, WALLET);
    const before = store.getSnapshot();
    store.syncWallet(WALLET);
    expect(store.getSnapshot()).toBe(before);
  });

  it("clears the profile from memory and storage", () => {
    const memory = memoryRepository();
    const store = createProfileStore(memory.repo);

    store.create(VALID, WALLET);
    store.clear();

    expect(store.getSnapshot()).toBeNull();
    expect(memory.peek()).toBeNull();
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const store = createProfileStore(memoryRepository().repo);
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    store.create(VALID, WALLET);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.update({ fullName: "Sarah Byrne", email: "sarah@example.ie" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
