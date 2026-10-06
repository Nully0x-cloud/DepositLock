/**
 * Integer math for on-chain token amounts.
 *
 * The program only accepts whole base units (`u64`) — never floats. Deposit
 * amounts are stored as `numeric(12, 2)` money, so the conversion goes
 * through decimal strings and `BigInt`; JavaScript floats never touch the
 * value that ends up in a transaction.
 */

const POW10: bigint[] = (() => {
  const table: bigint[] = [];
  let value = BigInt(1);
  for (let i = 0; i <= 18; i += 1) {
    table.push(value);
    value = value * BigInt(10);
  }
  return table;
})();

function powerOf10(exponent: number): bigint {
  const cached = POW10[exponent];
  if (cached === undefined) {
    throw new Error(`Unsupported decimals: ${exponent}`);
  }
  return cached;
}

/**
 * Converts a `numeric(12, 2)` deposit amount into mint base units.
 *
 * `1200` with 6 decimals → `1200000000n`. The value is parsed from the
 * decimal representation (two fraction digits at most), so the result is
 * exactly what the database stores — no floating-point rounding.
 */
export function depositAmountToBaseUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Deposit amount must be a non-negative number.");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`Unsupported decimals: ${decimals}`);
  }

  // Money arrives from `numeric(12, 2)` — its shortest decimal form has at
  // most two fraction digits. Anything else is a typo, silently rounded by
  // `toFixed`, and rejected instead.
  const text = amount.toString();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
    throw new Error("Deposit amount must have at most two decimal places.");
  }
  const [whole, fraction = ""] = text.split(".") as [string, string?];
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));

  if (decimals >= 2) {
    return cents * powerOf10(decimals - 2);
  }
  const divisor = powerOf10(2 - decimals);
  const units = cents / divisor;
  if (units * divisor !== cents) {
    throw new Error("Deposit amount is too precise for this mint.");
  }
  return units;
}

/**
 * Formats base units for display, rounding *up* to whole cents so the user
 * is never shown less than they actually need.
 */
export function formatBaseUnits(
  value: bigint,
  decimals: number,
  options: { ceilToCents?: boolean } = {},
): string {
  if (value < BigInt(0)) {
    throw new Error("Cannot format a negative amount.");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`Unsupported decimals: ${decimals}`);
  }

  let units = value;
  if (options.ceilToCents && decimals > 2) {
    const subCent = powerOf10(decimals - 2);
    const remainder = units % subCent;
    if (remainder !== BigInt(0)) {
      units = units - remainder + subCent;
    }
  }

  const scale = powerOf10(decimals);
  const whole = units / scale;
  const fraction = units % scale;

  const wholeText = new Intl.NumberFormat("en-IE").format(whole);
  if (decimals === 0 || fraction === BigInt(0)) {
    return wholeText;
  }

  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${wholeText}.${fractionText}`;
}

/** Short display name for the test token — never rendered as a real USDC. */
export const TEST_TOKEN_DISPLAY_SYMBOL = "test USDC";
