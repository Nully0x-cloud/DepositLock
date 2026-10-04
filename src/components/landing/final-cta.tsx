import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/layout/container";

export function FinalCta() {
  return (
    <section aria-label="Get started" className="bg-forest-deep text-cream">
      <Container className="py-20 text-center sm:py-24 lg:py-28">
        <p className="eyebrow text-sage">Start a tenancy</p>

        <h2 className="mx-auto mt-6 max-w-3xl font-serif text-[2.125rem] leading-[1.08] tracking-[-0.025em] sm:text-[2.75rem] lg:text-[3.125rem]">
          A better way to protect the money between move-in and move-out.
        </h2>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-cream/70">
          Set up the property, the people and the deposit in one record — then
          let the rules do the arguing.
        </p>

        <div className="mt-9 flex justify-center">
          <ButtonLink href="/app/create" variant="onDark" size="lg" className="px-9">
            Create a Tenancy
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
