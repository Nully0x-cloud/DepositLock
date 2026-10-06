"use client";

import { Clock3, ShieldCheck, UserRound, Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/layout/container";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/tenancy/create/fields";
import { SignInPrompt } from "@/components/wallet/sign-in-prompt";
import { useProfile } from "@/hooks/use-profile";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  acceptInvitation,
  declineInvitation,
  displayMessage,
  getSupabaseBrowserClient,
  isSupabaseConfigured,
  resolveInvitation,
  type InvitationPreview,
} from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

type View =
  | { phase: "loading" }
  | { phase: "invalid" }
  | { phase: "error"; message: string }
  | { phase: "preview"; preview: InvitationPreview };

const TERMINAL_COPY: Record<
  string,
  { title: string; description: string }
> = {
  expired: {
    title: "This invitation has expired",
    description:
      "Links are short-lived on purpose. Ask your landlord to send you a fresh one.",
  },
  cancelled: {
    title: "This invitation was cancelled",
    description:
      "Your landlord withdrew it. If the tenancy is still on, ask them to invite you again.",
  },
  declined: {
    title: "This invitation was declined",
    description:
      "It has already been answered as a decline. If that was a mistake, ask your landlord for a new link.",
  },
  accepted: {
    title: "This invitation has already been accepted",
    description:
      "The tenant has joined the tenancy. Sign in to DepositLock to view the record.",
  },
};

function LoadingBlock({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4 animate-pulse">
      <div className="h-6 w-48 rounded bg-sand" />
      <div className="h-40 rounded-3xl bg-cream-raised" />
      <div className="h-11 w-64 rounded-xl bg-sand" />
      <p className="sr-only">{label}</p>
    </div>
  );
}

function StatusCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-parchment p-6 sm:p-8">
      <span
        aria-hidden
        className="grid size-11 place-items-center rounded-full bg-sand text-forest"
      >
        <ShieldCheck className="size-5" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 font-serif text-[1.75rem] leading-tight tracking-[-0.02em] text-ink">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}

/**
 * The public invitation page (Phase 4). Resolves the token without a
 * session — the preview never exposes e-mail addresses or the tenancy id —
 * then gates accept/decline behind sign-in and a completed profile, because
 * matching an invitation to a person is done from their profile.
 */
export function InviteView({ token }: { token: string }) {
  const router = useRouter();
  const gate = useRequireAuth();
  const { profile } = useProfile();

  const [view, setView] = useState<View>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const settle = (next: View) => {
        if (!cancelled) setView(next);
      };

      if (!TOKEN_PATTERN.test(token) || !isSupabaseConfigured()) {
        settle({ phase: "invalid" });
        return;
      }
      const client = getSupabaseBrowserClient();
      if (!client) {
        settle({ phase: "invalid" });
        return;
      }

      const result = await resolveInvitation(client, token);
      if (cancelled) return;
      if (!result.ok) {
        settle(
          result.error.code === "not_found"
            ? { phase: "invalid" }
            : { phase: "error", message: displayMessage(result.error) },
        );
        return;
      }
      settle({ phase: "preview", preview: result.data });
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept() {
    setBusy(true);
    setActionError(null);
    try {
      const client = getSupabaseBrowserClient();
      if (!client) {
        setActionError("The database connection isn't available. Try again.");
        return;
      }
      const result = await acceptInvitation(client, token);
      if (!result.ok) {
        setActionError(displayMessage(result.error));
        return;
      }
      router.push(`/app/tenancies/${result.data.tenancyId}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    setBusy(true);
    setActionError(null);
    try {
      const client = getSupabaseBrowserClient();
      if (!client) {
        setActionError("The database connection isn't available. Try again.");
        return;
      }
      const result = await declineInvitation(client, token);
      if (!result.ok) {
        setActionError(displayMessage(result.error));
        return;
      }
      setDeclined(true);
    } finally {
      setBusy(false);
    }
  }

  if (view.phase === "loading") {
    return (
      <Container size="narrow" className="py-10 sm:py-14">
        <LoadingBlock label="Checking your invitation…" />
      </Container>
    );
  }

  if (view.phase === "invalid") {
    return (
      <Container size="narrow" className="py-10 sm:py-14">
        <StatusCard
          title="This invitation link isn't valid"
          description="It may have been replaced, mistyped or already used. Ask your landlord for a new invitation link, or open DepositLock to see your tenancies."
        >
          <ButtonLink href="/app/tenancies">Open my tenancies</ButtonLink>
        </StatusCard>
      </Container>
    );
  }

  if (view.phase === "error") {
    return (
      <Container size="narrow" className="py-10 sm:py-14">
        <StatusCard
          title="We couldn't open this invitation"
          description={view.message}
        >
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </StatusCard>
      </Container>
    );
  }

  const { preview } = view;
  const address = [
    preview.property.addressLine1,
    preview.property.city,
    preview.property.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
  const bedroomLine =
    preview.property.bedrooms && preview.property.bedrooms > 0
      ? `${preview.property.bedrooms} bed`
      : null;

  if (declined) {
    return (
      <Container size="narrow" className="py-10 sm:py-14">
        <StatusCard
          title="Invitation declined"
          description="Nothing has changed on the tenancy — it stays with your landlord, waiting for someone. If you declined by mistake, ask them to send a new invitation."
        >
          <ButtonLink href="/app/tenancies" variant="outline">
            Open my tenancies
          </ButtonLink>
        </StatusCard>
      </Container>
    );
  }

  if (preview.invitationStatus !== "pending") {
    const copy =
      TERMINAL_COPY[preview.invitationStatus] ?? TERMINAL_COPY.accepted;
    return (
      <Container size="narrow" className="py-10 sm:py-14">
        <StatusCard title={copy.title} description={copy.description}>
          <ButtonLink
            href={preview.invitationStatus === "accepted" ? "/app/tenancies" : "/"}
            variant={preview.invitationStatus === "accepted" ? "primary" : "outline"}
          >
            {preview.invitationStatus === "accepted"
              ? "Open DepositLock"
              : "Back to DepositLock"}
          </ButtonLink>
        </StatusCard>
      </Container>
    );
  }

  return (
    <Container size="narrow" className="space-y-6 py-10 sm:py-14">
      <section className="rounded-3xl border border-line bg-parchment p-6 sm:p-8">
        <p className="eyebrow text-moss">Tenancy invitation</p>
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <UserRound aria-hidden className="size-4" strokeWidth={1.85} />
          {preview.landlordName} invited you
        </p>
        <h1 className="mt-3 font-serif text-[1.85rem] leading-tight tracking-[-0.02em] text-ink sm:text-[2.25rem]">
          {address}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {[preview.property.propertyType, bedroomLine]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <dl className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          <div className="bg-cream-raised px-4 py-4">
            <dt className="eyebrow text-subtle">Starts</dt>
            <dd className="mt-1.5 text-sm font-medium text-ink">
              {formatDate(preview.terms.startDate)}
            </dd>
          </div>
          <div className="bg-cream-raised px-4 py-4">
            <dt className="eyebrow text-subtle">Monthly rent</dt>
            <dd className="mt-1.5 text-sm font-medium text-ink">
              {formatCurrency(preview.terms.monthlyRent)}
            </dd>
          </div>
          <div className="bg-cream-raised px-4 py-4">
            <dt className="eyebrow text-subtle">Deposit</dt>
            <dd className="mt-1.5 text-sm font-medium text-ink">
              {formatCurrency(preview.terms.deposit)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs leading-relaxed text-subtle">
          {preview.terms.endDate
            ? `Term: ${formatDate(preview.terms.startDate)} – ${formatDate(preview.terms.endDate)}`
            : "Rolling tenancy — no fixed end date"}
          {" · "}
          Expires {formatDate(preview.expiresAt)}
        </p>
      </section>

      {gate.status === "loading" ? (
        <LoadingBlock label="Checking your session…" />
      ) : !gate.authenticated ? (
        <SignInPrompt
          title="Sign in to respond"
          description="Verify your wallet to accept or decline. No funds will move."
        />
      ) : !profile ? (
        <section className="rounded-3xl border border-line bg-cream-raised p-6">
          <h2 className="text-base font-semibold text-ink">
            Complete your profile to continue
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Your name and email are how this invitation is matched to you. It
            takes a moment and only needs to be done once.
          </p>
          <div className="mt-4">
            <ButtonLink href="/app/profile">Complete Profile</ButtonLink>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-protected/30 bg-protected-soft p-6 sm:p-7">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck aria-hidden className="size-4 text-forest" strokeWidth={2} />
            Accept this invitation?
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Accepting adds you as the tenant on this record and moves the
            tenancy to{" "}
            <span className="font-medium text-ink">awaiting deposit</span>. You
            will be able to review terms and evidence before any funds move —
            nothing is signed today.
          </p>

          {actionError ? (
            <div className="mt-4">
              <FormAlert>{actionError}</FormAlert>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={handleAccept} disabled={busy}>
              {busy ? "Working…" : "Accept invitation"}
            </Button>
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={busy}
              className="border-dispute/35 text-dispute hover:border-dispute/60 hover:bg-dispute-soft"
            >
              <X aria-hidden className="size-4" strokeWidth={2} />
              Decline
            </Button>
          </div>

          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <Wallet aria-hidden className="size-3.5" strokeWidth={1.85} />
            Signed in as {profile.fullName}
          </p>
        </section>
      )}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Clock3 aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        This link is a bearer key while it is pending — anyone holding it can
        respond as the invited tenant. Don&apos;t share it.
      </p>
    </Container>
  );
}
