import { describe, expect, it } from "vitest";
import { fromResult } from "./from-result";

const queryOf = <T>(value: T) => Promise.resolve({ data: value, error: null });

const failing = (error: { code?: string | null; message?: string | null }) =>
  Promise.resolve({ data: null, error });

describe("fromResult", () => {
  it("unwraps a successful payload", async () => {
    const result = await fromResult(queryOf([{ id: "1" }]));
    expect(result).toEqual({ ok: true, data: [{ id: "1" }] });
  });

  it("maps a driver error through the shared mapping", async () => {
    const result = await fromResult(failing({ code: "42501", message: "nope" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("permission_denied");
  });

  it("keeps a legitimate null", async () => {
    const result = await fromResult(queryOf(null), { allowNull: true });
    expect(result).toEqual({ ok: true, data: null });
  });

  it("treats an unexpected null as not_found by default", async () => {
    const result = await fromResult(queryOf(null));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("not_found");
  });

  it("treats an empty array as not_found when asked", async () => {
    const result = await fromResult(queryOf([]), { emptyAsMissing: true });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("not_found");
  });

  it("keeps an empty array when it is a valid answer", async () => {
    const result = await fromResult(queryOf([]));
    expect(result).toEqual({ ok: true, data: [] });
  });
});
