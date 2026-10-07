import { describe, expect, it } from "vitest";
import type { NotificationRecord } from "@/lib/db/models";
import { notificationHref, notificationTimeLabel, notificationTitle } from "./presentation";

function notification(patch: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: "notification-1",
    profileId: "profile-1",
    tenancyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    type: "deposit_ready_to_fund",
    title: "Legacy untranslated type",
    body: "The deposit is ready.",
    readAt: null,
    createdAt: "2026-10-07T12:00:00.000Z",
    ...patch,
  };
}

describe("notification presentation", () => {
  it("uses human copy and routes deposit actions to funding", () => {
    const row = notification();
    expect(notificationTitle(row)).toBe("Deposit ready to fund");
    expect(notificationHref(row)).toBe("/app/tenancies/cccccccc-cccc-4ccc-8ccc-cccccccccccc#deposit");
  });

  it("routes settlement and evidence updates to the relevant record sections", () => {
    expect(notificationHref(notification({ type: "settlement_completed" }))).toContain("#settlement");
    expect(notificationHref(notification({ type: "evidence_added" }))).toContain("#evidence");
  });

  it("avoids constructing links from malformed tenancy ids", () => {
    expect(notificationHref(notification({ tenancyId: "https://evil.test" }))).toBe("/app/tenancies");
  });

  it("formats recent timestamps without exposing invalid date strings", () => {
    const now = Date.parse("2026-10-07T12:30:00.000Z");
    expect(notificationTimeLabel("2026-10-07T12:00:00.000Z", now)).toBe("30m ago");
    expect(notificationTimeLabel("bad timestamp", now)).toBe("Recently");
  });
});
