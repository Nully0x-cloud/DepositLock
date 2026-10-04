import { AppShell } from "@/components/layout/app-shell";
import { ProfileProvider } from "@/providers/profile-provider";
import { SolanaProvider } from "@/providers/solana-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider>
      <ProfileProvider>
        <AppShell>{children}</AppShell>
      </ProfileProvider>
    </SolanaProvider>
  );
}
