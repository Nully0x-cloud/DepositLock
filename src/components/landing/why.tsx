import { Blocks, Eye, FileCheck2, Scale, Waypoints } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionHeading } from "@/components/ui/section-heading";

const REASONS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Scale,
    title: "Neutral control",
    description:
      "Funds sit outside either party’s reach until the record says otherwise.",
  },
  {
    icon: Eye,
    title: "Clear evidence",
    description:
      "Condition, dates and documents are captured once and stay attached.",
  },
  {
    icon: FileCheck2,
    title: "Transparent decisions",
    description:
      "Every proposed deduction is visible, reviewable and dated.",
  },
  {
    icon: Waypoints,
    title: "Programmable settlement",
    description:
      "Agreed outcomes execute against rules, not reminders and phone calls.",
  },
  {
    icon: Blocks,
    title: "Verifiable record",
    description:
      "The full tenancy history can be checked by either side at any time.",
  },
];

export function WhyDepositLock() {
  return (
    <section id="why" aria-label="Why DepositLock" className="border-b border-line bg-cream">
      <Container className="py-16 sm:py-20 lg:py-24">
        <SectionHeading
          eyebrow="Why DepositLock"
          title="A record both sides can rely on."
          description="Built to behave like financial infrastructure — calm, verifiable and hard to argue with."
          align="center"
          className="mx-auto"
        />

        <ul className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {REASONS.map(({ icon: Icon, title, description }, index) => (
            <li
              key={title}
              className="flex flex-col bg-parchment p-6 sm:p-7 last:sm:col-span-2"
            >
              <div className="flex items-center justify-between">
                <span
                  aria-hidden
                  className="grid size-9 place-items-center rounded-lg bg-cream text-forest"
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="font-mono text-xs text-subtle">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-5 text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {description}
              </p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
