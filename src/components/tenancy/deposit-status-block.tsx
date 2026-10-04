import { ShieldCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ProtectionRules } from "@/components/tenancy/protection-rules";
import type { TenancyStatus } from "@/types/tenancy";

type DepositStatusBlockProps = {
  amount: number;
  status: TenancyStatus;
  fundedAt?: string | null;
};

const statusCopy: Record<TenancyStatus, { label: string; note: string }> = {
  protected: {
    label: "Protected",
    note: "Neither party can move these funds independently.",
  },
  active: {
    label: "Protected",
    note: "Neither party can move these funds independently.",
  },
  pending: {
    label: "Awaiting funding",
    note: "The deposit is protected once funding is confirmed.",
  },
  closed: {
    label: "Released",
    note: "The agreed settlement has been executed and archived.",
  },
};

export function DepositStatusBlock({
  amount,
  status,
  fundedAt,
}: DepositStatusBlockProps) {
  const copy = statusCopy[status];

  return (
    <section
      aria-label="Protected deposit"
      className="overflow-hidden rounded-3xl border border-forest-deep/40 bg-forest text-cream"
    >
      <div className="grid gap-8 p-7 sm:p-9 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
        <div className="flex flex-col justify-center">
          <p className="eyebrow text-sage">Protected deposit</p>

          <p className="mt-5 font-serif text-[3.5rem] leading-none tracking-[-0.03em] sm:text-[4.25rem]">
            {formatCurrency(amount)}
          </p>

          <p className="mt-5 inline-flex w-fit items-center gap-2.5 rounded-full border border-cream/25 bg-cream/8 px-4 py-2 text-[0.8125rem] font-semibold uppercase tracking-[0.24em]">
            <ShieldCheck aria-hidden className="size-4 text-cream" strokeWidth={2.2} />
            {copy.label}
          </p>

          <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-cream/70">
            {copy.note}
          </p>

          {fundedAt ? (
            <p className="mt-4 text-xs text-cream/50">
              Funded on{" "}
              <time dateTime={fundedAt}>
                {new Date(fundedAt).toLocaleDateString("en-IE", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col justify-center">
          <p className="eyebrow mb-4 text-cream/50">Protection rules</p>
          <ProtectionRules tone="dark" />
        </div>
      </div>
    </section>
  );
}
