"use client";

import { Check, Clock3, Copy, Mail, Send, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormAlert, TextField } from "@/components/tenancy/create/fields";
import { useTenancyInvitations } from "@/hooks/use-tenancy-invitations";
import type { IssuedInvitation } from "@/lib/db";
import { validateEmail } from "@/lib/profile/validation";
import { cn, formatDate } from "@/lib/utils";

function isExpired(expiresAt: string): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Landlord-side invitation management for a tenancy still waiting for its
 * tenant: copy the link, cancel it, or issue a fresh one (Phase 4).
 *
 * Renders nothing for anyone else — RLS would return no rows anyway, but the
 * panel only mounts for the landlord on `awaiting_tenant`/`draft` records.
 */
export function InvitationPanel({
  tenancyId,
  className,
}: {
  tenancyId: string;
  className?: string;
}) {
  const invitations = useTenancyInvitations(tenancyId);
  const headingId = useId();
  const emailId = useId();
  const walletId = useId();

  const [issued, setIssued] = useState<IssuedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [formErrors, setFormErrors] = useState<{
    email?: string;
    wallet?: string;
    form?: string;
  }>({});

  if (invitations.status === "hidden") return null;

  const pendingRecord = invitations.invitations.find(
    (invitation) =>
      invitation.status === "pending" && !isExpired(invitation.expiresAt),
  );
  const expiredPending = invitations.invitations.some(
    (invitation) =>
      invitation.status === "pending" && isExpired(invitation.expiresAt),
  );

  const activeToken = issued?.invitationToken ?? pendingRecord?.token ?? null;
  const activeId = issued?.invitationId ?? pendingRecord?.id ?? null;
  const invitePath = activeToken ? `/invite/${activeToken}` : "";

  function targetLabel(invitation: {
    email: string | null;
    walletAddress: string | null;
  }) {
    if (invitation.email && invitation.walletAddress) {
      return `${invitation.email} · ${invitation.walletAddress.slice(0, 4)}…${invitation.walletAddress.slice(-4)}`;
    }
    if (invitation.email) return invitation.email;
    if (invitation.walletAddress) return invitation.walletAddress;
    return "No target recorded";
  }

  const activeTarget = issued
    ? null
    : pendingRecord
      ? targetLabel(pendingRecord)
      : null;
  const activeExpires = issued ? null : pendingRecord?.expiresAt ?? null;

  async function copyLink() {
    if (!activeToken) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/invite/${activeToken}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function handleCancel() {
    if (!activeId) return;
    const ok = await invitations.cancel(activeId);
    if (ok) {
      setIssued(null);
      setCopied(false);
      setCancelled(true);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedWallet = wallet.trim();
    const errors: typeof formErrors = {};

    if (trimmedEmail) {
      const emailError = validateEmail(trimmedEmail);
      if (emailError) errors.email = emailError;
    }
    if (trimmedWallet && (trimmedWallet.length < 32 || trimmedWallet.length > 64)) {
      errors.wallet =
        "That wallet address doesn't look right — expect 32 to 64 characters.";
    }
    if (!trimmedEmail && !trimmedWallet) {
      errors.email = "Enter the tenant's email or wallet address.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    const result = await invitations.issue({
      email: trimmedEmail || null,
      wallet: trimmedWallet || null,
    });
    if (result) {
      setIssued(result);
      setEmail("");
      setWallet("");
      setCancelled(false);
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-3xl border border-line bg-parchment p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-lg bg-sand text-moss"
          >
            <Mail className="size-[18px]" strokeWidth={1.85} />
          </span>
          <div>
            <p className="eyebrow text-subtle">Invitation</p>
            <h2 id={headingId} className="mt-1 text-base font-semibold text-ink">
              Tenant invitation
            </h2>
          </div>
        </div>
        <Badge tone={activeToken ? "pending" : "neutral"}>
          {activeToken ? "Invitation pending" : "No active invitation"}
        </Badge>
      </div>

      {invitations.status === "loading" ? (
        <p
          aria-busy="true"
          className="mt-4 h-11 animate-pulse rounded-xl bg-sand"
        >
          <span className="sr-only">Loading invitations…</span>
        </p>
      ) : null}

      {invitations.status === "error" ? (
        <div className="mt-4">
          <FormAlert>{invitations.message}</FormAlert>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={invitations.retry}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {invitations.status === "ready" && invitations.actionError ? (
        <div className="mt-4">
          <FormAlert>{invitations.actionError}</FormAlert>
        </div>
      ) : null}

      {invitations.status === "ready" && cancelled && !activeToken ? (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl border border-protected/25 bg-protected-soft px-4 py-3 text-sm font-medium text-protected"
        >
          <Check aria-hidden className="size-4" strokeWidth={2.5} />
          Invitation cancelled. Send a new one below.
        </p>
      ) : null}

      {invitations.status === "ready" && activeToken ? (
        <div className="mt-4 rounded-2xl border border-line bg-cream-raised px-4 py-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-subtle">
            <Copy aria-hidden className="size-3.5" strokeWidth={2} />
            Invitation link
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              readOnly
              value={invitePath}
              aria-label="Invitation link"
              className="h-11 w-full min-w-0 truncate rounded-xl border border-line bg-cream px-3.5 font-mono text-xs text-ink focus:border-forest/50 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
              onFocus={(event) => event.target.select()}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={copyLink}
              className="shrink-0"
              disabled={invitations.busy}
            >
              {copied ? (
                <>
                  <Check aria-hidden className="size-4" strokeWidth={2.5} />
                  Copied
                </>
              ) : (
                <>
                  <Copy aria-hidden className="size-4" strokeWidth={1.9} />
                  Copy link
                </>
              )}
            </Button>
          </div>

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3.5 text-xs text-muted">
            {activeTarget ? (
              <div className="flex items-center gap-1.5">
                <dt className="text-subtle">Inviting</dt>
                <dd className="font-medium text-ink">{activeTarget}</dd>
              </div>
            ) : null}
            {activeExpires ? (
              <div className="flex items-center gap-1.5">
                <dt className="text-subtle">Expires</dt>
                <dd className="font-medium text-ink">
                  {formatDate(activeExpires)}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-4 border-t border-line pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={invitations.busy}
              className="border-dispute/35 text-dispute hover:border-dispute/60 hover:bg-dispute-soft"
            >
              <X aria-hidden className="size-4" strokeWidth={2} />
              {invitations.busy ? "Working…" : "Cancel invitation"}
            </Button>
          </div>
        </div>
      ) : null}

      {invitations.status === "ready" && !activeToken ? (
        <form onSubmit={handleSubmit} noValidate className="mt-4">
          <p className="text-sm leading-relaxed text-muted">
            No one is invited yet. Send an invitation link — your tenant
            accepts it with their own wallet.
          </p>

          {expiredPending ? (
            <p className="mt-2 text-xs text-subtle">
              The previous invitation expired. Issuing a new one replaces it.
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              id={emailId}
              label="Tenant email"
              type="email"
              value={email}
              onChange={setEmail}
              error={formErrors.email}
              placeholder="e.g. tenant@example.ie"
            />
            <TextField
              id={walletId}
              label="or wallet address (optional)"
              value={wallet}
              onChange={setWallet}
              error={formErrors.wallet}
              placeholder="Solana address"
              hint="An email, a wallet, or both."
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={invitations.busy}>
              <Send aria-hidden className="size-4" strokeWidth={1.9} />
              {invitations.busy ? "Sending…" : "Send invitation"}
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Clock3 aria-hidden className="size-3.5" strokeWidth={1.85} />
              The link expires automatically if it isn’t accepted.
            </p>
          </div>
        </form>
      ) : null}
    </section>
  );
}
