import { ShieldCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ProtectionRules } from "@/components/tenancy/protection-rules";
import { tenancyStatusPresentation } from "@/lib/tenancy/status-presentation";

type DepositStatusBlockProps = {
  amount: number;
  status: string;
  settlementToken: string | null;
  fundedAt?: string | null;
};

export function DepositStatusBlock({
  amount,
  status,
  settlementToken,
  fundedAt,
}: DepositStatusBlockProps) {
  const presentation = tenancyStatusPresentation(status);
  const protectedState = ["protected", "move_out_review", "deduction_proposed", "settlement_pending"].includes(status);
  const disputed = status === "disputed";
  const closed = status === "closed";

  return (
    <section
      id="deposit"
      aria-label="Protected deposit"
      className="overflow-hidden rounded-3xl border border-forest-deep/40 bg-forest text-cream"
    >
      <div className="grid gap-8 p-7 sm:p-9 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
        <div className="flex flex-col justify-center">
          <p className="eyebrow text-sage">{closed ? "Original deposit" : "Deposit"}</p>

          <p className="mt-5 font-serif text-[3.5rem] leading-none tracking-[-0.03em] sm:text-[4.25rem]">
            {formatCurrency(amount)}
          </p>

          <p className="mt-5 inline-flex w-fit items-center gap-2.5 rounded-full border border-cream/25 bg-cream/8 px-4 py-2 text-[0.8125rem] font-semibold uppercase tracking-[0.24em]">
            <ShieldCheck aria-hidden className="size-4 text-cream" strokeWidth={2.2} />
            {disputed ? "Protected — under dispute" : presentation.label}
          </p>

          <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed text-cream/70">
            {presentation.description}
          </p>

          <dl className="mt-5 grid gap-3 border-t border-cream/15 pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-cream/50">Settlement token</dt>
              <dd className="mt-1 font-medium text-cream">{settlementToken ?? "USDC"} · Devnet test token</dd>
            </div>
            <div>
              <dt className="text-xs text-cream/50">{fundedAt ? "Protected since" : "Funding"}</dt>
              <dd className="mt-1 font-medium text-cream">
                {fundedAt ? new Date(fundedAt).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" }) : "Not funded yet"}
              </dd>
            </div>
          </dl>
          {protectedState || disputed || closed ? (
            <p className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-cream/70">
              <ShieldCheck aria-hidden className="size-4 text-sage" />
              {closed ? "Settlement verified on Solana" : "Protected on Solana"}
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
