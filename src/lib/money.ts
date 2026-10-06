/**
 * Money as decimal strings.
 *
 * The database stores money as `numeric(12, 2)` and the application never
 * does arithmetic on it — this module only parses and validates what the
 * user typed so a bad amount is rejected *before* it reaches Postgres, with
 * copy the UI can render directly.
 */

/** `numeric(12, 2)` holds up to 10 integer digits plus 2 decimals. */
export const MAX_MONEY_AMOUNT = 9_999_999_999.99;

export type MoneyParseResult =
  | { ok: true; value: number; normalized: string }
  | { ok: false; error: string };

const DECIMAL_INPUT = /^\d+(\.\d+)?$/;
const TOO_MANY_DECIMALS = /^\d+\.\d{3,}$/;

export type ParseMoneyOptions = {
  /** Message when the amount must be greater than zero. */
  requiredMessage?: string;
  /** When true, `0` is accepted (e.g. monthly rent on a paid-up tenancy). */
  allowZero?: boolean;
};

/**
 * Parses a user-typed amount into a number safe to submit.
 *
 * Accepts plain integers and up to two decimals (`1200`, `1200.50`).
 * Commas, currency symbols and more than two decimals are rejected rather
 * than silently rewritten — a typo must never change the amount.
 */
export function parseMoneyAmount(
  raw: string,
  options: ParseMoneyOptions = {},
): MoneyParseResult {
  const value = raw.trim();

  if (!value) {
    return {
      ok: false,
      error: options.requiredMessage ?? "Enter an amount.",
    };
  }

  if (TOO_MANY_DECIMALS.test(value)) {
    return { ok: false, error: "Use up to two decimal places." };
  }

  if (!DECIMAL_INPUT.test(value)) {
    return { ok: false, error: "Enter an amount like 1200 or 1200.50." };
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed > MAX_MONEY_AMOUNT) {
    return { ok: false, error: "That amount is too large." };
  }

  if (parsed === 0 && !options.allowZero) {
    return {
      ok: false,
      error: options.requiredMessage ?? "Enter an amount greater than zero.",
    };
  }

  return { ok: true, value: parsed, normalized: value };
}
