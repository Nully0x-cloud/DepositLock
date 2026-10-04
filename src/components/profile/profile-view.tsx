"use client";

import {
  Check,
  Copy,
  ExternalLink,
  Pencil,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Container } from "@/components/layout/container";
import { ProfileForm } from "@/components/profile/profile-form";
import { ConnectToContinue } from "@/components/wallet/connect-to-continue";
import { useProfile } from "@/hooks/use-profile";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TENANCIES } from "@/data/tenancies";
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

function RolesCard({ profileName }: { profileName: string }) {
  const rows = TENANCIES.filter(
    (tenancy) =>
      tenancy.tenant.name === profileName ||
      tenancy.landlord.name === profileName,
  ).map((tenancy) => ({
    id: tenancy.id,
    address: `${tenancy.address}, ${tenancy.locality}`,
    role: tenancy.tenant.name === profileName ? "Tenant" : "Landlord",
  }));

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

      {rows.length > 0 ? (
        <ul className="mt-5 space-y-2.5">
          {rows.map((row) => (
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
  const { profile } = useProfile();
  const wallet = useWalletIdentity();
  const [editing, setEditing] = useState(false);

  const hasProfile = Boolean(profile);

  const memberSince = profile
    ? new Date(profile.createdAt).toLocaleDateString("en-IE", {
        month: "long",
        year: "numeric",
      })
    : "—";

  const tenancyCount = profile
    ? TENANCIES.filter(
        (tenancy) =>
          tenancy.tenant.name === profile.fullName ||
          tenancy.landlord.name === profile.fullName,
      ).length
    : 0;

  return (
    <Container className="space-y-8 py-10 sm:py-12">
      <PageHeader
        title="Profile"
        description="Your identity as it appears on every tenancy record you take part in."
      />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          {!hasProfile && wallet.connected ? (
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
                    Linked to {wallet.shortAddress} on {wallet.walletName}
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <ProfileForm mode="create" />
              </div>
            </Card>
          ) : null}

          {!hasProfile && !wallet.connected ? (
            <ConnectToContinue
              title="Connect your wallet to continue"
              description="Your DepositLock profile is created once and reused across every tenancy you join. Connect a wallet to start it."
            />
          ) : null}

          {hasProfile && !editing ? (
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
                      <Badge tone="protected">Local profile</Badge>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil aria-hidden className="size-4" strokeWidth={1.9} />
                  <span className="hidden sm:inline">Edit profile</span>
                </Button>
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

          {hasProfile && editing ? (
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
            <RolesCard profileName={profile.fullName} />
          ) : null}
          <HistoryCard memberSince={memberSince} tenancyCount={tenancyCount} />
        </div>
      </div>
    </Container>
  );
}
