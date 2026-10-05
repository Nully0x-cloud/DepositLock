import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { TenancyRecord } from "@/components/tenancy/tenancy-record";

export const metadata: Metadata = {
  title: "Tenancy record",
  description: "A protected deposit record shared between its two parties.",
};

type Params = { params: Promise<{ id: string }> };

/**
 * Phase 3B: records are read from Supabase under RLS at request time, so
 * there is no static id list to pre-render — the client container resolves
 * loading / sign-in / unavailable / error states instead.
 */
export default async function TenancyRecordPage({ params }: Params) {
  const { id } = await params;

  return (
    <Container className="space-y-6 py-8 sm:py-10">
      <TenancyRecord id={id} />
    </Container>
  );
}
