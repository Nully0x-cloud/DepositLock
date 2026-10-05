import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/providers/auth-provider";
import { AuthWalletSync } from "@/providers/auth-wallet-sync";
import { ProfileProvider } from "@/providers/profile-provider";
import { SolanaProvider } from "@/providers/solana-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider>
      <AuthProvider>
        <ProfileProvider>
          <AuthWalletSync />
          <AppShell>{children}</AppShell>
        </ProfileProvider>
      </AuthProvider>
    </SolanaProvider>
  );
}
