import { Container } from "@/components/layout/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { LifecycleTrack } from "@/components/tenancy/lifecycle-track";

export function Lifecycle() {
  return (
    <section
      id="lifecycle"
      aria-label="Deposit lifecycle"
      className="border-b border-forest-deep/30 bg-forest text-cream"
    >
      <Container className="py-16 sm:py-20 lg:py-24">
        <SectionHeading
          eyebrow="Deposit lifecycle"
          title="One record, from agreement to release."
          description="Every tenancy moves through the same six stages. The record is the product — property, people, money, evidence and decisions stay connected."
          tone="onDark"
          align="center"
          className="mx-auto"
        />

        <div className="mt-14 rounded-3xl border border-cream/12 bg-cream/6 p-6 sm:p-8 lg:p-10">
          <LifecycleTrack stage="active" tone="dark" />
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-cream/60">
          This lifecycle is the recurring shape of every tenancy you will see
          inside DepositLock.
        </p>
      </Container>
    </section>
  );
}
