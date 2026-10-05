"use client";

import {
  Check,
  Copy,
  ExternalLink,
  LogOut,
  Pencil,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Container } from "@/components/layout/container";
import { ProfileForm } from "@/components/profile/profile-form";
import { ConnectToContinue } from "@/components/wallet/connect-to-continue";
import { useAuthenticatedProfile } from "@/hooks/use-authenticated-profile";
import { useSiwsWallet } from "@/hooks/use-siws-wallet";
import { useTenancies } from "@/hooks/use-tenancies";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import { useAuth } from "@/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { explorerAddressUrl, explorerClusterLabel } from "@/lib/solana/explorer";
import { cn, initialsOf } from "@/lib/utils";

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-subtle">
        {label}
      </span>
      <p
        className={cn(
          "mt-2 min-h-11 rounded-xl border border-line-soft bg-cream-raised px-3.5 py-3 text-sm text-ink",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Ownership proof (§42): one tap, calm copy, explicit "no funds move".
 * Only rendered for a connected wallet with no session.
 */
function VerifyCard() {
  const { signing, error, signInWithWallet, clearError } = useAuth();
  const wallet = useWalletIdentity();
  const solanaWallet = useSiwsWallet();

  return (
    <Card padding="lg">
      <div className="flex items-center gap-3 border-b border-line-soft pb-5">
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center rounded-full bg-cream-raised text-forest"
        >
          <ShieldCheck className="size-6" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">
            Verify wallet ownership
          </h2>
          <p className="text-sm text-muted">
            Linked to {wallet.shortAddress} on {wallet.walletName}
          </p>
        </div>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-muted">
        Sign this message to continue — no funds will move and no transaction
        is created. Your signature proves you own this wallet and opens your
        DepositLock records.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-dispute/40 bg-dispute-soft px-4 py-3 text-sm text-dispute"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <Button
          onClick={() => {
            clearError();
            if (solanaWallet) void signInWithWallet(solanaWallet);
          }}
          disabled={signing || !solanaWallet}
          className="w-full"
        >
          <ShieldCheck aria-hidden className="size-4" strokeWidth={1.9} />
          {signing ? "Check your wallet…" : "Verify Wallet"}
        </Button>
      </div>
    </Card>
  );
}

function ProfileSkeleton() {
  return (
    <Card padding="lg" aria-busy="true" className="animate-pulse">
      <div className="flex items-center gap-4">
        <div className="size-14 rounded-full bg-sand" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-40 rounded bg-sand" />
          <div className="h-4 w-56 rounded bg-sand" />
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="h-16 rounded-xl bg-cream-raised" />
        <div className="h-16 rounded-xl bg-cream-raised" />
        <div className="h-16 rounded-xl bg-cream-raised" />
        <div className="h-16 rounded-xl bg-cream-raised" />
      </div>
      <p className="sr-only">Loading your profile…</p>
    </Card>
  );
}

function WalletCard() {
  const wallet = useWalletIdentity();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!wallet.connected) {
    return (
      <Card padding="lg">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-lg bg-cream text-forest"
          >
            <Wallet className="size-[18px]" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">Wallet</h2>
            <p className="text-xs text-muted">Not connected</p>
          </div>
          <span aria-hidden className="ml-auto size-2 rounded-full bg-pending" />
        </div>

        <p className="mt-5 text-sm leading-relaxed text-muted">
          Connect the wallet you will use to approve protected deposit
          transactions. You can browse your records without one.
        </p>

        <div className="mt-6">
          <Button
            className="w-full"
            onClick={wallet.connect}
            disabled={wallet.connecting}
          >
            <Wallet aria-hidden className="size-4" strokeWidth={1.9} />
            {wallet.connecting ? "Connecting…" : "Connect Wallet"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-lg bg-cream text-forest"
        >
          <Wallet className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">
            {wallet.walletName ?? "Wallet"}
          </h2>
          <p className="text-xs text-muted">Connected on {explorerClusterLabel()}</p>
        </div>
        <span
          aria-hidden
          className="ml-auto size-2 rounded-full bg-protected"
          title="Connected"
        />
      </div>

      <div className="mt-5 rounded-xl border border-line bg-cream-raised p-3.5">
        <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-subtle">
          Address
        </span>
        <p className="mt-1 break-all font-mono text-[0.8125rem] leading-relaxed text-ink">
          {wallet.address}
        </p>
      </div>

      <div className="mt-4 grid gap-2.5">
        <button
          type="button"
          onClick={async () => {
            if (!wallet.address) return;
            try {
              await navigator.clipboard.writeText(wallet.address);
              setCopied(true);
            } catch {
              // Clipboard denied — the Explorer link still exposes the address.
            }
          }}
          className="flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-cream-raised text-sm font-medium text-ink transition-colors hover:border-forest/40"
        >
          {copied ? (
            <Check aria-hidden className="size-4 text-protected" strokeWidth={2.5} />
          ) : (
            <Copy aria-hidden className="size-4" strokeWidth={1.9} />
          )}
          {copied ? "Address copied" : "Copy address"}
        </button>

        <div className="grid grid-cols-2 gap-2.5">
          <a
            href={explorerAddressUrl(wallet.address ?? "")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-cream-raised text-sm font-medium text-ink transition-colors hover:border-forest/40"
          >
            <ExternalLink aria-hidden className="size-4" strokeWidth={1.9} />
            Explorer
          </a>
          <button
            type="button"
            onClick={wallet.disconnect}
            className="flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-cream-raised text-sm font-medium text-dispute transition-colors hover:border-dispute/40 hover:bg-dispute-soft"
          >
            Disconnect
          </button>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Your wallet is used to verify your identity and approve protected
        deposit transactions. Addresses link to {explorerClusterLabel()}.
      </p>
    </Card>
  );
}

function RolesCard({
  tenancyAddresses,
}: {
  tenancyAddresses: { id: string; address: string; role: string }[];
}) {
  return (
    <Card padding="lg">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-lg bg-cream text-forest"
        >
          <ShieldCheck className="size-[18px]" strokeWidth={1.75} />
        </span>
        <h2 className="text-base font-semibold text-ink">
          One profile, different roles
        </h2>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted">
        Your DepositLock profile is shared across every tenancy you take part
        in. Roles belong to the tenancy, not to you — you can be a tenant on
        one record and a landlord on the next.
      </p>

      {tenancyAddresses.length > 0 ? (
        <ul className="mt-5 space-y-2.5">
          {tenancyAddresses.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-cream-raised px-3.5 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {row.address}
                </span>
              </span>
              <Badge tone={row.role === "Tenant" ? "neutral" : "protected"}>
                {row.role}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-line bg-cream-raised px-4 py-4 text-xs leading-relaxed text-muted">
          Roles will appear here as you join tenancies. Nothing is assigned
          from your profile alone.
        </p>
      )}
    </Card>
  );
}

function HistoryCard({
  memberSince,
  tenancyCount,
}: {
  memberSince: string;
  tenancyCount: number;
}) {
  return (
    <Card padding="lg">
      <h2 className="text-base font-semibold text-ink">Record history</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Member since</dt>
          <dd className="font-medium text-ink">{memberSince}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Tenancies</dt>
          <dd className="font-medium text-ink">{tenancyCount}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Disputes</dt>
          <dd className="font-medium text-ink">None</dd>
        </div>
      </dl>
    </Card>
  );
}

export function ProfileView() {
  const {
    profile,
    loading,
    syncStatus,
    syncError,
    reloadProfile,
    authenticated,
    status: authStatus,
  } = useAuthenticatedProfile();
  const { signOut } = useAuth();
  const wallet = useWalletIdentity();
  const tenanciesState = useTenancies();
  const [editing, setEditing] = useState(false);

  const hasProfile = Boolean(profile);
  const connected = wallet.connected;

  const memberSince = profile
    ? new Date(profile.createdAt).toLocaleDateString("en-IE", {
        month: "long",
        year: "numeric",
      })
    : "—";

  const roleRows =
    tenanciesState.status === "ready" && profile
      ? tenanciesState.tenancies
          .map((tenancy) => ({
            id: tenancy.id,
            address: `${tenancy.address}, ${tenancy.locality}`,
            isTenant: tenancy.tenant.name === profile.fullName,
            isLandlord: tenancy.landlord.name === profile.fullName,
          }))
          .filter((row) => row.isTenant || row.isLandlord)
          .map((row) => ({
            id: row.id,
            address: row.address,
            role: row.isTenant ? "Tenant" : "Landlord",
          }))
      : [];

  const tenancyCount = roleRows.length;

  return (
    <Container className="space-y-8 py-10 sm:py-12">
      <PageHeader
        title="Profile"
        description="Your identity as it appears on every tenancy record you take part in."
      />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          {loading ? <ProfileSkeleton /> : null}

          {!loading && syncStatus === "error" ? (
            <Card padding="lg">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-9 place-items-center rounded-lg bg-dispute-soft text-dispute"
                >
                  <TriangleAlert className="size-[18px]" strokeWidth={1.75} />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-ink">
                    We couldn&apos;t load your profile
                  </h2>
                  <p className="text-sm text-muted">{syncError}</p>
                </div>
              </div>
              <div className="mt-5">
                <Button variant="outline" onClick={reloadProfile}>
                  <RefreshCw aria-hidden className="size-4" strokeWidth={1.9} />
                  Try again
                </Button>
              </div>
            </Card>
          ) : null}

          {!loading && syncStatus !== "error" && authStatus === "unauthenticated" && connected ? (
            <VerifyCard />
          ) : null}

          {!loading &&
          syncStatus !== "error" &&
          authenticated &&
          !hasProfile &&
          connected ? (
            <Card padding="lg">
              <div className="flex items-center gap-3 border-b border-line-soft pb-5">
                <span
                  aria-hidden
                  className="grid size-14 shrink-0 place-items-center rounded-full bg-cream-raised text-forest"
                >
                  <UserRound className="size-6" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-ink">
                    Create your profile
                  </h2>
                  <p className="text-sm text-muted">
                    Your verified wallet becomes the owner of this profile.
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <ProfileForm mode="create" />
              </div>
            </Card>
          ) : null}

          {!loading && syncStatus !== "error" && !hasProfile && !connected ? (
            <ConnectToContinue
              title="Connect your wallet to continue"
              description="Your DepositLock profile is created once and reused across every tenancy you join. Connect a wallet to start it."
            />
          ) : null}

          {!loading && hasProfile && !editing ? (
            <Card padding="lg">
              <div className="flex items-start justify-between gap-4 border-b border-line-soft pb-6">
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    aria-hidden
                    className="grid size-14 shrink-0 place-items-center rounded-full bg-forest text-lg font-semibold text-cream"
                  >
                    {initialsOf(profile!.fullName)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-ink">
                      {profile!.fullName}
                    </h2>
                    <p className="truncate text-sm text-muted">
                      {profile!.email}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">Member since {memberSince}</Badge>
                      <Badge tone={syncStatus === "ready" ? "protected" : "neutral"}>
                        {syncStatus === "ready" ? "Verified wallet" : "Profile"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil aria-hidden className="size-4" strokeWidth={1.9} />
                    <span className="hidden sm:inline">Edit profile</span>
                  </Button>
                  {authenticated ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void signOut()}
                      title="Sign out of DepositLock — your wallet stays connected"
                    >
                      <LogOut aria-hidden className="size-4" strokeWidth={1.9} />
                      <span className="hidden sm:inline">Sign out</span>
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" value={profile!.fullName} />
                <Field label="Email address" value={profile!.email} />
                <Field
                  label="Wallet"
                  value={profile!.walletAddress ?? "Not linked"}
                  mono
                />
                <Field label="Member since" value={memberSince} />
              </div>
            </Card>
          ) : null}

          {!loading && hasProfile && editing ? (
            <Card padding="lg">
              <div className="border-b border-line-soft pb-5">
                <h2 className="text-lg font-semibold text-ink">Edit profile</h2>
                <p className="text-sm text-muted">
                  Name and email only — your wallet stays read-only here.
                </p>
              </div>
              <div className="mt-6">
                <ProfileForm mode="edit" onCancel={() => setEditing(false)} />
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <WalletCard />
          {profile ? (
            <RolesCard tenancyAddresses={roleRows} />
          ) : null}
          <HistoryCard memberSince={memberSince} tenancyCount={tenancyCount} />
        </div>
      </div>
    </Container>
  );
}
