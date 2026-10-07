import { describe, expect, it } from "vitest";
import { tenancyStatusPresentation } from "./status-presentation";

describe("tenancy status presentation", () => {
  it.each([
    ["awaiting_tenant", "Awaiting tenant", "pending"],
    ["awaiting_deposit", "Awaiting deposit", "pending"],
    ["protected", "Protected", "protected"],
    ["move_out_review", "Move-out review", "protected"],
    ["deduction_proposed", "Deduction proposed", "pending"],
    ["settlement_pending", "Settlement pending", "pending"],
    ["disputed", "Under dispute", "dispute"],
    ["closed", "Closed", "closed"],
    ["cancelled", "Cancelled", "neutral"],
  ])("maps %s to shared copy and style", (status, label, tone) => {
    expect(tenancyStatusPresentation(status)).toMatchObject({ label, tone });
  });

  it("uses a safe fallback for unknown future statuses", () => {
    expect(tenancyStatusPresentation("unexpected").label).toBe("Status unavailable");
  });
});
