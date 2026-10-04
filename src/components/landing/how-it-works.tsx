import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionHeading } from "@/components/ui/section-heading";

const STEPS = [
  {
    title: "Create tenancy",
    description: "Property, tenant, landlord and terms are recorded together.",
  },
  {
    title: "Tenant funds deposit",
    description: "The deposit is paid into a neutral tenancy record.",
  },
  {
    title: "Deposit becomes protected",
    description: "Neither party can move the funds on their own.",
  },
  {
    title: "Record move-in condition",
    description: "Photographs and notes are timestamped at handover.",
  },
  {
    title: "Review deductions at move-out",
    description: "Every proposed deduction is checked against the record.",
  },
  {
    title: "Release agreed settlement",
    description: "Both sides agree, and the settlement is executed.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-label="How it works" className="border-b border-line bg-cream">
      <Container className="py-16 sm:py-20 lg:py-24">
        <SectionHeading
          eyebrow="How it works"
          title="Six steps from agreement to settlement."
          description="One record carries the property, the people, the money and the evidence — start to finish."
          align="center"
          className="mx-auto"
        />

        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="relative flex flex-col rounded-2xl border border-line bg-parchment p-5"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-8 place-items-center rounded-full bg-forest text-[0.75rem] font-semibold text-cream">
                  {index + 1}
                </span>
                {index < STEPS.length - 1 ? (
                  <ArrowRight
                    aria-hidden
                    className="size-4 text-line lg:hidden"
                    strokeWidth={1.75}
                  />
                ) : null}
              </div>

              <h3 className="mt-5 text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em] text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
