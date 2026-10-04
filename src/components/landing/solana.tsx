import { Container } from "@/components/layout/container";

export function SolanaSection() {
  return (
    <section
      aria-label="Solana"
      className="border-b border-line bg-sand/70"
    >
      <Container className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl rounded-3xl border border-line bg-parchment px-7 py-10 text-center sm:px-12 sm:py-12">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-cream px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-moss">
            <span aria-hidden className="size-1.5 rounded-full bg-forest" />
            Powered by Solana
          </p>

          <h2 className="mt-6 font-serif text-[1.875rem] leading-tight tracking-[-0.02em] text-ink sm:text-[2.375rem]">
            Protected by programmable settlement.
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-[0.9375rem] leading-relaxed text-muted sm:text-base">
            Solana lets the financial rules be enforced without either party
            directly controlling the deposit. The blockchain stays underneath —
            you interact with a plain, readable tenancy record.
          </p>

          <div className="mx-auto mt-9 grid max-w-md gap-3 text-left sm:grid-cols-3">
            {["Rules enforced", "No single control", "Checkable history"].map(
              (item) => (
                <p
                  key={item}
                  className="rounded-xl border border-line bg-cream px-3 py-3 text-center text-[0.8125rem] font-medium text-ink"
                >
                  {item}
                </p>
              ),
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
