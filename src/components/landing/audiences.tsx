import { KeyRound, Landmark } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/utils";

type Audience = {
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
  description: string;
  points: string[];
};

const AUDIENCES: Audience[] = [
  {
    id: "tenants",
    label: "For tenants",
    icon: KeyRound,
    title: "Know exactly where your deposit sits.",
    description:
      "The record shows the money, the rules and every decision — in one place you can check yourself.",
    points: [
      "Know where the deposit is",
      "See every proposed deduction",
      "Challenge unsupported deductions",
      "Receive agreed settlement automatically",
    ],
  },
  {
    id: "landlords",
    label: "For landlords",
    icon: Landmark,
    title: "Prove the deposit is secured.",
    description:
      "Document condition up front, propose only legitimate deductions, and keep a settlement record that stands on its own.",
    points: [
      "Prove the deposit is secured",
      "Document property condition",
      "Propose legitimate deductions",
      "Create a clear settlement record",
    ],
  },
];

function AudienceCard({ audience }: { audience: Audience }) {
  const Icon = audience.icon;

  return (
    <div
      id={audience.id}
      className="flex flex-col rounded-3xl border border-line bg-parchment p-7 sm:p-8"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-xl bg-forest text-cream"
        >
          <Icon className="size-5" strokeWidth={1.85} />
        </span>
        <p className="eyebrow text-moss">{audience.label}</p>
      </div>

      <h3 className="mt-6 font-serif text-[1.75rem] leading-tight tracking-[-0.02em] text-ink sm:text-[2rem]">
        {audience.title}
      </h3>

      <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
        {audience.description}
      </p>

      <ul className="mt-7 grid gap-3 border-t border-line-soft pt-6">
        {audience.points.map((point) => (
          <li key={point} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-protected-soft text-protected"
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            <span className="text-[0.9375rem] leading-snug text-ink">
              {point}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Audiences() {
  return (
    <section
      aria-label="For tenants and landlords"
      className="border-b border-line bg-sand/70"
    >
      <Container className="py-16 sm:py-20 lg:py-24">
        <SectionHeading
          eyebrow="Two sides, one record"
          title="Neither party is the problem. The missing shared record is."
          description="DepositLock gives both sides the same view of the money, the condition and the decisions."
          align="center"
          className="mx-auto"
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-2 lg:gap-6">
          {AUDIENCES.map((audience) => (
            <AudienceCard key={audience.id} audience={audience} />
          ))}
        </div>

        <p
          className={cn(
            "mt-8 text-center text-sm text-muted",
          )}
        >
          Both sides see the same record. Both sides act on the same evidence.
        </p>
      </Container>
    </section>
  );
}
