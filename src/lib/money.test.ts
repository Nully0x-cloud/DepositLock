import { describe, expect, it } from "vitest";
import { MAX_MONEY_AMOUNT, parseMoneyAmount } from "./money";

describe("parseMoneyAmount", () => {
  it("parses plain integers", () => {
    expect(parseMoneyAmount("1200")).toEqual({
      ok: true,
      value: 1200,
      normalized: "1200",
    });
  });

  it("parses up to two decimals", () => {
    const result = parseMoneyAmount(" 1200.50 ");
    expect(result).toEqual({ ok: true, value: 1200.5, normalized: "1200.50" });
  });

  it("parses zero when zero is allowed", () => {
    const result = parseMoneyAmount("0", { allowZero: true });
    expect(result.ok).toBe(true);
  });

  it("rejects zero when zero is not allowed", () => {
    const result = parseMoneyAmount("0");
    expect(result).toEqual({
      ok: false,
      error: "Enter an amount greater than zero.",
    });
  });

  it("uses the required message for empty input", () => {
    const result = parseMoneyAmount("   ", { requiredMessage: "Enter the rent." });
    expect(result).toEqual({ ok: false, error: "Enter the rent." });
  });

  it("rejects more than two decimal places", () => {
    expect(parseMoneyAmount("10.999")).toEqual({
      ok: false,
      error: "Use up to two decimal places.",
    });
  });

  it("rejects thousands separators and symbols", () => {
    expect(parseMoneyAmount("1,200")).toEqual({
      ok: false,
      error: "Enter an amount like 1200 or 1200.50.",
    });
    expect(parseMoneyAmount("€1200")).toEqual({
      ok: false,
      error: "Enter an amount like 1200 or 1200.50.",
    });
  });

  it("rejects negative and non-numeric input", () => {
    expect(parseMoneyAmount("-500").ok).toBe(false);
    expect(parseMoneyAmount("twelve hundred").ok).toBe(false);
  });

  it("rejects amounts beyond numeric(12, 2)", () => {
    expect(parseMoneyAmount(String(MAX_MONEY_AMOUNT + 1))).toEqual({
      ok: false,
      error: "That amount is too large.",
    });
    expect(parseMoneyAmount("9999999999.99").ok).toBe(true);
  });
});
