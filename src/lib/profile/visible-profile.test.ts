import { describe, expect, it } from "vitest";
import { selectVisibleProfile } from "./visible-profile";
import type { UserProfile } from "@/types/profile";

const SNAPSHOT: UserProfile = {
  id: "user-a",
  fullName: "Wallet A User",
  email: "a@example.ie",
  walletAddress: "WalletA",
  createdAt: "2026-10-07T19:13:50.000Z",
  updatedAt: "2026-10-07T19:13:50.000Z",
};

describe("selectVisibleProfile", () => {
  it("passes the local snapshot through when no backend is configured", () => {
    expect(
      selectVisibleProfile({
        snapshot: SNAPSHOT,
        configured: false,
        authenticated: false,
        userId: null,
        syncedFor: null,
      }),
    ).toBe(SNAPSHOT);
  });

  it("hides the snapshot while the session is still resolving", () => {
    expect(
      selectVisibleProfile({
        snapshot: SNAPSHOT,
        configured: true,
        authenticated: true,
        userId: "user-a",
        syncedFor: null,
      }),
    ).toBeNull();
  });

  it("hides wallet A's snapshot once wallet B is signed in", () => {
    expect(
      selectVisibleProfile({
        snapshot: SNAPSHOT,
        configured: true,
        authenticated: true,
        userId: "user-b",
        syncedFor: "user-a",
      }),
    ).toBeNull();
  });

  it("shows the snapshot once it is synced for the current user", () => {
    expect(
      selectVisibleProfile({
        snapshot: SNAPSHOT,
        configured: true,
        authenticated: true,
        userId: "user-a",
        syncedFor: "user-a",
      }),
    ).toBe(SNAPSHOT);
  });

  it("shows the create-form state (null) for a signed-in user with no row yet", () => {
    expect(
      selectVisibleProfile({
        snapshot: null,
        configured: true,
        authenticated: true,
        userId: "user-a",
        syncedFor: "user-a",
      }),
    ).toBeNull();
  });

  it("hides everything once the session ends", () => {
    expect(
      selectVisibleProfile({
        snapshot: SNAPSHOT,
        configured: true,
        authenticated: false,
        userId: null,
        syncedFor: "user-a",
      }),
    ).toBeNull();
  });
});
