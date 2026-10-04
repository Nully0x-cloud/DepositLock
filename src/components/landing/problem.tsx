import { Files, Scale, SearchCheck, Wallet } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionHeading } from "@/components/ui/section-heading";

const PROBLEMS = [
  {
    icon: Wallet,
    title: "One party holds the money",
    description:
      "Deposits are often controlled by a single party, so control becomes leverage.",
  },
  {
    icon: Files,
    title: "Evidence gets scattered",
    description:
      "Condition photos, messages and documents end up across phones and inboxes.",
  },
  {
    icon: SearchCheck,
    title: "Deductions are hard to verify",
    description:
      "Claims are made without a shared record of what the property looked like.",
  },
  {
    icon: Scale,
    title: "Settlement becomes a negotiation",
    description:
      "Move-out turns manual, slow and contentious for both sides.",
  },
];

export function Problem() {
  return (
    <section aria-label="The problem" className="border-b border-line bg-sand/70">
      <Container className="py-16 sm:py-20 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <SectionHeading
            eyebrow="The problem"
            title="Deposits rarely fail at the end. They fail from the start."
            description="When money, evidence and decisions live apart, every move-out becomes a conversation nobody can settle."
            className="lg:sticky lg:top-28 lg:self-start"
          />

          <ul className="grid gap-4 sm:grid-cols-2">
            {PROBLEMS.map(({ icon: Icon, title, description }) => (
              <li
                key={title}
                className="rounded-2xl border border-line bg-parchment p-6 transition-colors hover:border-forest/25"
              >
                <span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-xl bg-cream text-forest"
                >
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
