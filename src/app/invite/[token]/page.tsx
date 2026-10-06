import type { Metadata } from "next";
import { InviteView } from "@/components/invite/invite-view";

export const metadata: Metadata = {
  title: "Tenancy invitation",
  description: "Review and respond to a DepositLock tenancy invitation.",
};

type Params = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Params) {
  const { token } = await params;
  return <InviteView token={token} />;
}
