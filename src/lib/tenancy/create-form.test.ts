import { describe, expect, it } from "vitest";
import {
  emptyPropertyForm,
  emptyTermsForm,
  emptyTenantForm,
  validatePropertyForm,
  validateTermsForm,
  validateTenantForm,
} from "./create-form";

describe("validatePropertyForm", () => {
  it("requires street, city and type for a new property", () => {
    const result = validatePropertyForm(emptyPropertyForm());
    expect(result.valid).toBe(false);
    expect(result.errors.addressLine1).toBe("Enter the street address.");
    expect(result.errors.city).toBe("Enter the city or town.");
    expect(result.errors.propertyType).toBe("Choose a property type.");
  });

  it("trims values and accepts a complete form", () => {
    const result = validatePropertyForm({
      ...emptyPropertyForm(),
      addressLine1: " 18 Camden Street ",
      city: " Dublin ",
      propertyType: "apartment",
      bedrooms: "2",
    });
    expect(result.valid).toBe(true);
    expect(result.values.addressLine1).toBe("18 Camden Street");
    expect(result.values.city).toBe("Dublin");
  });

  it("validates bedrooms as a whole number between 0 and 50", () => {
    expect(
      validatePropertyForm({
        ...emptyPropertyForm(),
        addressLine1: "18 Camden Street",
        city: "Dublin",
        propertyType: "apartment",
        bedrooms: "2.5",
      }).errors.bedrooms,
    ).toBe("Bedrooms must be a whole number between 0 and 50.");

    expect(
      validatePropertyForm({
        ...emptyPropertyForm(),
        addressLine1: "18 Camden Street",
        city: "Dublin",
        propertyType: "apartment",
        bedrooms: "99",
      }).errors.bedrooms,
    ).toBe("Bedrooms must be a whole number between 0 and 50.");
  });

  it("only requires a selection when an existing property is used", () => {
    const missing = validatePropertyForm({
      ...emptyPropertyForm(),
      mode: "existing",
    });
    expect(missing.valid).toBe(false);
    expect(missing.errors.existingPropertyId).toBe(
      "Choose a property to continue.",
    );

    const chosen = validatePropertyForm({
      ...emptyPropertyForm(),
      mode: "existing",
      existingPropertyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(chosen.valid).toBe(true);
  });
});

describe("validateTermsForm", () => {
  it("requires a start date, rent and deposit", () => {
    const result = validateTermsForm(emptyTermsForm());
    expect(result.valid).toBe(false);
    expect(result.errors.startDate).toBe("Choose the tenancy start date.");
    expect(result.errors.monthlyRent).toBe("Enter the monthly rent.");
    expect(result.errors.deposit).toBe("Enter the deposit amount.");
  });

  it("accepts an open-ended tenancy", () => {
    const result = validateTermsForm({
      startDate: "2026-11-01",
      endDate: "",
      monthlyRent: "1450",
      deposit: "1450",
    });
    expect(result.valid).toBe(true);
    expect(result.values.endDate).toBeNull();
    expect(result.values.monthlyRent).toBe(1450);
    expect(result.values.deposit).toBe(1450);
  });

  it("requires the end date to be after the start date", () => {
    const result = validateTermsForm({
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      monthlyRent: "1450",
      deposit: "1450",
    });
    expect(result.errors.endDate).toBe(
      "The end date must be after the start date.",
    );
  });

  it("rejects impossible calendar dates", () => {
    const result = validateTermsForm({
      startDate: "2026-02-30",
      endDate: "",
      monthlyRent: "1450",
      deposit: "1450",
    });
    expect(result.errors.startDate).toBe("Choose the tenancy start date.");
  });

  it("rejects a zero deposit but allows zero rent", () => {
    const result = validateTermsForm({
      startDate: "2026-11-01",
      endDate: "",
      monthlyRent: "0",
      deposit: "0",
    });
    expect(result.errors.deposit).toBe("Enter the deposit amount.");
    expect(result.errors.monthlyRent).toBeUndefined();
  });
});

describe("validateTenantForm", () => {
  it("requires a valid email address", () => {
    const result = validateTenantForm(emptyTenantForm());
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBe("Enter your email address.");

    const invalid = validateTenantForm({ email: "not-an-email", wallet: "" });
    expect(invalid.errors.email).toBe("Enter a valid email address.");
  });

  it("lowercases the email and allows an empty wallet", () => {
    const result = validateTenantForm({
      email: "Aoife.Kelly@Example.ie",
      wallet: "",
    });
    expect(result.valid).toBe(true);
    expect(result.values.email).toBe("aoife.kelly@example.ie");
    expect(result.values.wallet).toBeNull();
  });

  it("validates the wallet length when provided", () => {
    const result = validateTenantForm({
      email: "aoife.kelly@example.ie",
      wallet: "too-short",
    });
    expect(result.errors.wallet).toBe(
      "That wallet address doesn't look right — expect 32 to 64 characters.",
    );
  });

  it("blocks inviting yourself", () => {
    const viewer = {
      email: "sarah.byrne@example.ie",
      walletAddress: "DEVWALLET-00000000000000000000SARAH00001",
    };

    expect(
      validateTenantForm({ email: "Sarah.Byrne@example.ie", wallet: "" }, viewer)
        .errors.email,
    ).toBe("You cannot invite yourself to a tenancy.");

    expect(
      validateTenantForm(
        {
          email: "aoife.kelly@example.ie",
          wallet: "DEVWALLET-00000000000000000000SARAH00001",
        },
        viewer,
      ).errors.wallet,
    ).toBe("You cannot invite yourself to a tenancy.");
  });
});
