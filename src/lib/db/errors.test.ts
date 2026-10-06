import { describe, expect, it } from "vitest";
import {
  displayMessage,
  isRepositoryError,
  mapRepositoryError,
  repositoryError,
} from "./errors";

const postgrest = (code: string, message = "boom") => ({ code, message });

describe("mapRepositoryError", () => {
  it("treats a missing row as not_found", () => {
    expect(mapRepositoryError(postgrest("PGRST116", "No rows")).code).toBe(
      "not_found",
    );
  });

  it("treats a plain '0 rows' message as not_found", () => {
    expect(mapRepositoryError({ message: "0 rows" }).code).toBe("not_found");
  });

  it("maps SQLSTATE 42501 to permission_denied", () => {
    expect(mapRepositoryError(postgrest("42501")).code).toBe(
      "permission_denied",
    );
  });

  it("maps PostgREST 301 to permission_denied", () => {
    expect(mapRepositoryError(postgrest("PGRST301")).code).toBe(
      "permission_denied",
    );
  });

  it("recognises an RLS rejection by message alone", () => {
    const error = mapRepositoryError({
      message: "new row violates row-level security policy",
    });
    expect(error.code).toBe("permission_denied");
  });

  it("maps a unique violation to conflict", () => {
    expect(mapRepositoryError(postgrest("23505")).code).toBe("conflict");
  });

  it("maps every other integrity error to validation", () => {
    expect(mapRepositoryError(postgrest("23514")).code).toBe("validation");
    expect(mapRepositoryError(postgrest("23503")).code).toBe("validation");
  });

  it("maps a missing table or column to validation", () => {
    expect(mapRepositoryError(postgrest("42P01")).code).toBe("validation");
    expect(mapRepositoryError(postgrest("42703")).code).toBe("validation");
  });

  it("falls back to unknown for anything else", () => {
    expect(mapRepositoryError(postgrest("57014")).code).toBe("unknown");
    expect(mapRepositoryError("boom").code).toBe("unknown");
    expect(mapRepositoryError(null).code).toBe("unknown");
    expect(mapRepositoryError(new Error("boom")).code).toBe("unknown");
  });

  it("maps our own RPC 'not found' raise to not_found", () => {
    const mapped = mapRepositoryError(
      postgrest("P0002", "This invitation link is not valid"),
    );
    expect(mapped.code).toBe("not_found");
    expect(mapped.detail).toBe("This invitation link is not valid");
  });

  it("keeps safe copy on every result and the raw detail out of it", () => {
    const mapped = mapRepositoryError(postgrest("23514", "check failed"));
    expect(mapped.message).toBe(
      "Those details are not valid for this record.",
    );
    expect(mapped.detail).toBe("check failed");
    expect(mapped.message).not.toContain("check failed");
  });
});

describe("repositoryError", () => {
  it("builds an error with the shared copy for its code", () => {
    expect(repositoryError("conflict", "duplicate wallet")).toEqual({
      code: "conflict",
      message: "That record conflicts with an existing one.",
      detail: "duplicate wallet",
    });
  });

  it("omits detail when none is given", () => {
    expect(repositoryError("unknown")).toEqual({
      code: "unknown",
      message: "Something went wrong. Please try again.",
      detail: undefined,
    });
  });
});

describe("isRepositoryError", () => {
  it("accepts repository errors", () => {
    expect(isRepositoryError(repositoryError("not_found"))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isRepositoryError(null)).toBe(false);
    expect(isRepositoryError({})).toBe(false);
    expect(isRepositoryError({ code: 42, message: "x" })).toBe(false);
    expect(isRepositoryError(new Error("boom"))).toBe(false);
  });
});

describe("displayMessage", () => {
  it("shows an authored RPC message instead of the generic copy", () => {
    const error = mapRepositoryError(
      postgrest("23514", "This invitation has expired. Ask the landlord to send a new one."),
    );
    expect(displayMessage(error)).toBe(
      "This invitation has expired. Ask the landlord to send a new one.",
    );
  });

  it("hides engine output behind the stable copy", () => {
    const constraint = mapRepositoryError(
      postgrest("23514", 'new row violates check constraint "tenancies_deposit_positive"'),
    );
    expect(displayMessage(constraint)).toBe(
      "Those details are not valid for this record.",
    );

    const rls = mapRepositoryError(
      postgrest("42501", "new row violates row-level security policy for table \"tenancies\""),
    );
    expect(displayMessage(rls)).toBe(
      "You do not have access to that record.",
    );
  });

  it("falls back to the generic copy when there is no detail", () => {
    expect(displayMessage(repositoryError("unknown"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
