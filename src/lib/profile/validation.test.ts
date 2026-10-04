import { describe, expect, it } from "vitest";
import {
  FULL_NAME_MAX_LENGTH,
  FULL_NAME_MIN_LENGTH,
  validateEmail,
  validateFullName,
  validateProfileForm,
} from "@/lib/profile/validation";

describe("validateFullName", () => {
  it("accepts a normal name", () => {
    expect(validateFullName("Sarah Byrne")).toBeUndefined();
  });

  it("trims before checking length", () => {
    expect(validateFullName("  ab  ")).toBeUndefined();
    expect(validateFullName("   ")).toBe("Enter your full name.");
  });

  it("rejects a name shorter than the minimum", () => {
    expect(validateFullName("a")).toBe(
      `Enter at least ${FULL_NAME_MIN_LENGTH} characters.`,
    );
  });

  it("rejects a name longer than the maximum", () => {
    expect(validateFullName("x".repeat(FULL_NAME_MAX_LENGTH + 1))).toBe(
      `Keep your name under ${FULL_NAME_MAX_LENGTH} characters.`,
    );
  });
});

describe("validateEmail", () => {
  it("accepts common addresses", () => {
    expect(validateEmail("sarah.byrne@example.ie")).toBeUndefined();
    expect(validateEmail("s+tag@sub.domain.io")).toBeUndefined();
  });

  it("rejects missing or malformed addresses", () => {
    expect(validateEmail("")).toBe("Enter your email address.");
    expect(validateEmail("   ")).toBe("Enter your email address.");
    expect(validateEmail("sarah")).toBe("Enter a valid email address.");
    expect(validateEmail("sarah@ie")).toBe("Enter a valid email address.");
    expect(validateEmail("sarah byrne@example.ie")).toBe(
      "Enter a valid email address.",
    );
  });
});

describe("validateProfileForm", () => {
  it("returns trimmed values when valid", () => {
    const result = validateProfileForm({
      fullName: "  Sarah Byrne  ",
      email: "  sarah@example.ie ",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({
      fullName: "Sarah Byrne",
      email: "sarah@example.ie",
    });
  });

  it("reports both problems at once", () => {
    const result = validateProfileForm({ fullName: "", email: "nope" });

    expect(result.valid).toBe(false);
    expect(result.errors.fullName).toBe("Enter your full name.");
    expect(result.errors.email).toBe("Enter a valid email address.");
  });

  it("never reports a wallet problem — the form does not collect one", () => {
    const result = validateProfileForm({ fullName: "", email: "" });
    expect(result.errors.walletAddress).toBeUndefined();
  });
});
