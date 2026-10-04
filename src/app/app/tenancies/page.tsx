import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/app/page-header";
import { TenancyExplorer } from "@/components/app/tenancy-explorer";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "My Tenancies",
};

export default function TenanciesPage() {
  return (
    <Container className="space-y-8 py-10 sm:py-12">
      <PageHeader
        title="My Tenancies"
        description="Every tenancy you are part of, with its protected deposit, evidence and lifecycle in one record."
        actions={
          <ButtonLink href="/app/create">Create Tenancy</ButtonLink>
        }
      />

      <TenancyExplorer />
    </Container>
  );
}
