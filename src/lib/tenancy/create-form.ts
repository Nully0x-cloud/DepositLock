import { parseMoneyAmount } from "@/lib/money";
import { validateEmail } from "@/lib/profile/validation";

/**
 * Pure validation for the create-tenancy wizard.
 *
 * One validator per step, each returning trimmed/normalised values alongside
 * field errors. The rules mirror the database checks (lengths, ranges, the
 * `numeric(12, 2)` money shape) so the review step can submit exactly what
 * the user saw — the server-side RPCs re-validate everything regardless.
 */

export const PROPERTY_TYPES = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "studio", label: "Studio" },
  { value: "shared_accommodation", label: "Shared accommodation" },
  { value: "other", label: "Other" },
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number]["value"];

export type PropertyFormValues = {
  mode: "new" | "existing";
  existingPropertyId: string | null;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  postalCode: string;
  propertyType: PropertyType | "";
  bedrooms: string;
};

export type TermsFormValues = {
  startDate: string;
  endDate: string;
  monthlyRent: string;
  deposit: string;
};

export type TenantFormValues = {
  email: string;
  wallet: string;
};

export type PropertyFormErrors = Partial<
  Record<keyof PropertyFormValues, string>
>;
export type TermsFormErrors = Partial<Record<keyof TermsFormValues, string>>;
export type TenantFormErrors = Partial<Record<keyof TenantFormValues, string>>;

export type PropertyFormResult = {
  valid: boolean;
  errors: PropertyFormErrors;
  values: PropertyFormValues;
};

export type TermsFormResult = {
  valid: boolean;
  errors: TermsFormErrors;
  values: {
    startDate: string;
    endDate: string | null;
    monthlyRent: number;
    deposit: number;
  };
};

export type TenantFormResult = {
  valid: boolean;
  errors: TenantFormErrors;
  values: { email: string; wallet: string | null };
};

export function emptyPropertyForm(): PropertyFormValues {
  return {
    mode: "new",
    existingPropertyId: null,
    addressLine1: "",
    addressLine2: "",
    city: "",
    county: "",
    postalCode: "",
    propertyType: "",
    bedrooms: "",
  };
}

export function emptyTermsForm(): TermsFormValues {
  return { startDate: "", endDate: "", monthlyRent: "", deposit: "" };
}

export function emptyTenantForm(): TenantFormValues {
  return { email: "", wallet: "" };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validatePropertyForm(
  input: PropertyFormValues,
): PropertyFormResult {
  const errors: PropertyFormErrors = {};
  const values: PropertyFormValues = {
    ...input,
    addressLine1: input.addressLine1.trim(),
    addressLine2: input.addressLine2.trim(),
    city: input.city.trim(),
    county: input.county.trim(),
    postalCode: input.postalCode.trim(),
  };

  if (values.mode === "existing") {
    if (!values.existingPropertyId) {
      errors.existingPropertyId = "Choose a property to continue.";
    }
    return { valid: Object.keys(errors).length === 0, errors, values };
  }

  if (!values.addressLine1) {
    errors.addressLine1 = "Enter the street address.";
  } else if (values.addressLine1.length > 200) {
    errors.addressLine1 = "Keep the address under 200 characters.";
  }

  if (!values.city) {
    errors.city = "Enter the city or town.";
  } else if (values.city.length > 100) {
    errors.city = "Keep the city under 100 characters.";
  }

  if (!values.propertyType) {
    errors.propertyType = "Choose a property type.";
  }

  if (values.bedrooms.trim()) {
    const bedrooms = Number(values.bedrooms.trim());
    if (
      !Number.isInteger(bedrooms) ||
      bedrooms < 0 ||
      bedrooms > 50
    ) {
      errors.bedrooms = "Bedrooms must be a whole number between 0 and 50.";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, values };
}

export function validateTermsForm(input: TermsFormValues): TermsFormResult {
  const errors: TermsFormErrors = {};
  const startDate = input.startDate.trim();
  const endDate = input.endDate.trim();

  if (!startDate || !isCalendarDate(startDate)) {
    errors.startDate = "Choose the tenancy start date.";
  }

  if (endDate) {
    if (!isCalendarDate(endDate)) {
      errors.endDate = "Choose a valid end date, or leave it open-ended.";
    } else if (startDate && isCalendarDate(startDate) && endDate <= startDate) {
      errors.endDate = "The end date must be after the start date.";
    }
  }

  const rent = parseMoneyAmount(input.monthlyRent, {
    allowZero: true,
    requiredMessage: "Enter the monthly rent.",
  });
  if (!rent.ok) errors.monthlyRent = rent.error;

  const deposit = parseMoneyAmount(input.deposit, {
    requiredMessage: "Enter the deposit amount.",
  });
  if (!deposit.ok) errors.deposit = deposit.error;

  const valid = Object.keys(errors).length === 0;

  return {
    valid,
    errors,
    values: {
      startDate,
      endDate: endDate || null,
      monthlyRent: rent.ok ? rent.value : 0,
      deposit: deposit.ok ? deposit.value : 0,
    },
  };
}

export type TenantViewer = {
  email: string | null;
  walletAddress: string | null;
} | null;

export function validateTenantForm(
  input: TenantFormValues,
  viewer: TenantViewer = null,
): TenantFormResult {
  const errors: TenantFormErrors = {};
  const email = input.email.trim();
  const wallet = input.wallet.trim();

  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;

  if (wallet && (wallet.length < 32 || wallet.length > 64)) {
    errors.wallet =
      "That wallet address doesn't look right — expect 32 to 64 characters.";
  }

  if (viewer) {
    const lowerEmail = email.toLowerCase();
    if (viewer.email && lowerEmail && lowerEmail === viewer.email.toLowerCase()) {
      errors.email = "You cannot invite yourself to a tenancy.";
    }
    if (
      viewer.walletAddress &&
      wallet &&
      wallet === viewer.walletAddress
    ) {
      errors.wallet = "You cannot invite yourself to a tenancy.";
    }
  }

  const valid = Object.keys(errors).length === 0;

  return {
    valid,
    errors,
    values: {
      email: email.toLowerCase(),
      wallet: wallet || null,
    },
  };
}
