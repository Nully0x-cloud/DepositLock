"use client";

import { Check, Info, Wallet } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import { useAuth } from "@/providers/auth-provider";
import type { ProfileFormErrors, ProfileFormValues } from "@/types/profile";
import { cn } from "@/lib/utils";

type ProfileFormProps = {
  mode: "create" | "edit";
  onCancel?: () => void;
  onSaved?: () => void;
  className?: string;
};

const EMPTY_VALUES: ProfileFormValues = { fullName: "", email: "" };

export function ProfileForm({
  mode,
  onCancel,
  onSaved,
  className,
}: ProfileFormProps) {
  const { profile, walletAddress, prefill, createProfile, updateProfile } = useProfile();
  const { configured: authConfigured } = useAuth();
  const { connected, shortAddress, connecting } = useWalletIdentity();

  const nameId = useId();
  const emailId = useId();
  const walletId = useId();

  const [values, setValues] = useState<ProfileFormValues>(() => {
    if (mode === "edit" && profile) {
      return { fullName: profile.fullName, email: profile.email };
    }
    // Create: seed from the local cache only when it belongs to the wallet
    // being verified (§26). The seed is a convenience, never authority.
    return prefill ?? EMPTY_VALUES;
  });
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Values are seeded from the profile/prefill when the form mounts; the
  // store already resolves them synchronously, so no effect is needed.

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

  function setField(field: keyof ProfileFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "create" && !walletAddress) {
      setErrors({ walletAddress: "Connect a wallet before creating a profile." });
      return;
    }

    setBusy(true);
    try {
      const result =
        mode === "create" ? await createProfile(values) : await updateProfile(values);

      if (!result.ok) {
        setErrors(result.errors);
        setSaved(false);
        return;
      }

      setErrors({});
      setSaved(true);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = (hasError?: string) =>
    cn(
      "mt-2 h-11 w-full rounded-xl border bg-cream-raised px-3.5 text-sm text-ink placeholder:text-subtle/70 transition-colors focus:border-forest/50 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40",
      hasError ? "border-dispute/60" : "border-line",
    );

  return (
    <form onSubmit={handleSubmit} noValidate className={className}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor={nameId}
            className="block text-xs font-semibold uppercase tracking-[0.1em] text-subtle"
          >
            Full name
          </label>
          <input
            id={nameId}
            type="text"
            autoComplete="name"
            value={values.fullName}
            onChange={(event) => setField("fullName", event.target.value)}
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? `${nameId}-error` : undefined}
            placeholder="e.g. Sarah Byrne"
            className={fieldClass(errors.fullName)}
          />
          {errors.fullName ? (
            <p id={`${nameId}-error`} role="alert" className="mt-1.5 text-xs text-dispute">
              {errors.fullName}
            </p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor={emailId}
            className="block text-xs font-semibold uppercase tracking-[0.1em] text-subtle"
          >
            Email address
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => setField("email", event.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${emailId}-error` : undefined}
            placeholder="e.g. sarah.byrne@example.ie"
            className={fieldClass(errors.email)}
          />
          {errors.email ? (
            <p id={`${emailId}-error`} role="alert" className="mt-1.5 text-xs text-dispute">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor={walletId}
            className="block text-xs font-semibold uppercase tracking-[0.1em] text-subtle"
          >
            Wallet
          </label>
          <div
            id={walletId}
            className={cn(
              "mt-2 flex h-11 w-full items-center gap-2 rounded-xl border border-line bg-sand/60 px-3.5",
              errors.walletAddress ? "border-dispute/60" : "",
            )}
          >
            <Wallet aria-hidden className="size-4 shrink-0 text-moss" strokeWidth={1.9} />
            <span
              className={cn(
                "truncate font-mono text-sm",
                connected ? "text-ink" : "text-subtle",
              )}
            >
              {connected && shortAddress ? shortAddress : "Not connected"}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Taken from your connected wallet. {mode === "edit"
              ? "To change it, connect a different wallet."
              : "It cannot be typed in manually."}
          </p>
          {errors.walletAddress ? (
            <p role="alert" className="mt-1.5 text-xs text-dispute">
              {errors.walletAddress}
            </p>
          ) : null}
        </div>
      </div>

      {errors.form ? (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-xl border border-dispute/40 bg-dispute-soft px-4 py-3 text-sm text-dispute"
        >
          {errors.form}
        </p>
      ) : null}

      {saved ? (
        <p
          role="status"
          className="mt-5 flex items-center gap-2 rounded-xl border border-protected/25 bg-protected-soft px-4 py-3 text-sm font-medium text-protected"
        >
          <Check aria-hidden className="size-4" strokeWidth={2.5} />
          Profile saved.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={connecting || busy}>
          {busy
            ? "Saving…"
            : mode === "create"
              ? "Create Profile"
              : "Save changes"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>

      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {authConfigured
          ? "Your profile belongs to your verified wallet and appears on every tenancy you join."
          : "Your profile is stored in this browser for now and moves with your tenancy records later."}
      </p>
    </form>
  );
}
