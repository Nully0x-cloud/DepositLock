import type {
  ProfileFormErrors,
  ProfileFormValues,
  ProfileValidationResult,
} from "@/types/profile";

export const FULL_NAME_MIN_LENGTH = 2;
export const FULL_NAME_MAX_LENGTH = 80;

/**
 * Deliberately permissive: one `@`, no spaces, a dot in the domain.
 * Enough to catch typos without rejecting legitimate addresses.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateFullName(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return "Enter your full name.";
  if (value.length < FULL_NAME_MIN_LENGTH) {
    return `Enter at least ${FULL_NAME_MIN_LENGTH} characters.`;
  }
  if (value.length > FULL_NAME_MAX_LENGTH) {
    return `Keep your name under ${FULL_NAME_MAX_LENGTH} characters.`;
  }
  return undefined;
}

export function validateEmail(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(value)) return "Enter a valid email address.";
  return undefined;
}

export function validateProfileForm(
  input: ProfileFormValues,
): ProfileValidationResult {
  const errors: ProfileFormErrors = {};
  const fullNameError = validateFullName(input.fullName);
  const emailError = validateEmail(input.email);

  if (fullNameError) errors.fullName = fullNameError;
  if (emailError) errors.email = emailError;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    values: {
      fullName: input.fullName.trim(),
      email: input.email.trim(),
    },
  };
}
