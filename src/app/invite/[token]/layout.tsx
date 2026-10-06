import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { AuthProvider } from "@/providers/auth-provider";
import { AuthWalletSync } from "@/providers/auth-wallet-sync";
import { ProfileProvider } from "@/providers/profile-provider";
import { SolanaProvider } from "@/providers/solana-provider";

/**
 * The public /invite/<token> page runs outside /app, so it brings its own
 * provider stack — the root layout ships none (§11 session boundaries).
 */
export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SolanaProvider>
      <AuthProvider>
        <ProfileProvider>
          <AuthWalletSync />
          <SiteHeader />
          <main id="main-content">{children}</main>
          <SiteFooter />
        </ProfileProvider>
      </AuthProvider>
    </SolanaProvider>
  );
}
