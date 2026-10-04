import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Hero } from "@/components/landing/hero";
import { Problem } from "@/components/landing/problem";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Audiences } from "@/components/landing/audiences";
import { Lifecycle } from "@/components/landing/lifecycle";
import { WhyDepositLock } from "@/components/landing/why";
import { SolanaSection } from "@/components/landing/solana";
import { FinalCta } from "@/components/landing/final-cta";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <Problem />
        <HowItWorks />
        <Audiences />
        <Lifecycle />
        <WhyDepositLock />
        <SolanaSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
