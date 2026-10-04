import type { Metadata } from "next";
import { CreateTenancyView } from "@/components/tenancy/create-tenancy-view";

export const metadata: Metadata = {
  title: "Create Tenancy",
};

export default function CreateTenancyPage() {
  return <CreateTenancyView />;
}
