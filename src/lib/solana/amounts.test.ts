import { describe, expect, it } from "vitest";
import {
  depositAmountToBaseUnits,
  formatBaseUnits,
} from "./amounts";

describe("depositAmountToBaseUnits", () => {
  it("converts whole money to 6-decimal base units", () => {
    expect(depositAmountToBaseUnits(1200, 6)).toBe(BigInt("1200000000"));
    expect(depositAmountToBaseUnits(1800, 6)).toBe(BigInt("1800000000"));
  });

  it("keeps cent precision exactly", () => {
    expect(depositAmountToBaseUnits(1200.5, 6)).toBe(BigInt("1200500000"));
    expect(depositAmountToBaseUnits(0.01, 6)).toBe(BigInt("10000"));
    expect(depositAmountToBaseUnits(0.3, 6)).toBe(BigInt("300000"));
    expect(depositAmountToBaseUnits(19.99, 6)).toBe(BigInt("19990000"));
  });

  it("supports other decimals", () => {
    expect(depositAmountToBaseUnits(1200, 9)).toBe(BigInt("1200000000000"));
    expect(depositAmountToBaseUnits(1200, 2)).toBe(BigInt("120000"));
    expect(depositAmountToBaseUnits(1200, 0)).toBe(BigInt("1200"));
    expect(depositAmountToBaseUnits(1200, 1)).toBe(BigInt("12000"));
  });

  it("rejects unsupported decimals", () => {
    expect(() => depositAmountToBaseUnits(1, 19)).toThrow("Unsupported decimals");
    expect(() => depositAmountToBaseUnits(1, -1)).toThrow("Unsupported decimals");
  });

  it("rejects non-finite and negative amounts", () => {
    expect(() => depositAmountToBaseUnits(Number.NaN, 6)).toThrow();
    expect(() => depositAmountToBaseUnits(-1, 6)).toThrow("non-negative");
  });

  it("rejects amounts with more than two decimals", () => {
    expect(() => depositAmountToBaseUnits(10.999, 6)).toThrow("two decimal places");
  });

  it("rejects amounts too precise for low-decimal mints", () => {
    expect(() => depositAmountToBaseUnits(1200.5, 0)).toThrow("too precise");
  });
});

describe("formatBaseUnits", () => {
  it("formats whole and fractional amounts", () => {
    expect(formatBaseUnits(BigInt("1200000000"), 6)).toBe("1,200");
    expect(formatBaseUnits(BigInt("1200500000"), 6)).toBe("1,200.5");
    expect(formatBaseUnits(BigInt("19990000"), 6)).toBe("19.99");
    expect(formatBaseUnits(BigInt("1"), 6)).toBe("0.000001");
  });

  it("rounds up to whole cents when asked", () => {
    expect(
      formatBaseUnits(BigInt("342499999"), 6, { ceilToCents: true }),
    ).toBe("342.5");
    expect(
      formatBaseUnits(BigInt("342500000"), 6, { ceilToCents: true }),
    ).toBe("342.5");
    expect(formatBaseUnits(BigInt("0"), 6, { ceilToCents: true })).toBe("0");
  });

  it("handles zero-decimal mints", () => {
    expect(formatBaseUnits(BigInt("1200"), 0)).toBe("1,200");
  });

  it("rejects negative values", () => {
    expect(() => formatBaseUnits(BigInt("-1"), 6)).toThrow("negative");
  });
});
