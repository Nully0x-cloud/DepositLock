type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}

const currencyFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return dateFormatter.format(date);
}

export function formatShortDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return shortDateFormatter.format(date);
}

export function formatDateRange(
  start: string | Date,
  end: string | Date | null,
): string {
  if (!end) return `${formatShortDate(start)} - Ongoing`;
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
