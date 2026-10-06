"use client";

import { Check, Info, UserRound, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Container } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { SignInPrompt } from "@/components/wallet/sign-in-prompt";
import {
  PropertyStep,
  ReviewStep,
  SuccessPanel,
  TenantStep,
  TenancyStep,
  type CreatedTenancyState,
} from "@/components/tenancy/create/steps";
import {
  createTenancyWithInvitation,
  displayMessage,
  getSupabaseBrowserClient,
  listPropertiesForViewer,
  type PropertyRecord,
} from "@/lib/db";
import {
  emptyPropertyForm,
  emptyTenantForm,
  emptyTermsForm,
  validatePropertyForm,
  validateTenantForm,
  validateTermsForm,
  type PropertyFormErrors,
  type TenantFormErrors,
  type TermsFormErrors,
} from "@/lib/tenancy/create-form";
import { useProfile } from "@/hooks/use-profile";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import { explorerClusterLabel } from "@/lib/solana/explorer";
import { cn, initialsOf } from "@/lib/utils";

const STAGES = [
  {
    key: "property",
    label: "Property",
    summary: "Address, property type and bedrooms",
  },
  {
    key: "tenancy",
    label: "Tenancy",
    summary: "Dates, rent and deposit amount",
  },
  {
    key: "tenant",
    label: "Tenant",
    summary: "Invitation contact details",
  },
  {
    key: "review",
    label: "Review",
    summary: "Confirm the terms and create the record",
  },
];

function PanelShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-3xl border px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:gap-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-dashed border-line bg-cream-raised px-5 py-5">
      <span
        aria-hidden
        className="size-2.5 animate-pulse rounded-full bg-forest"
      />
      <p className="text-sm text-muted">Checking your session…</p>
    </div>
  );
}

function ProfileRequiredPanel() {
  return (
    <PanelShell className="border-line bg-cream-raised">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-sand text-forest"
        >
          <UserRound className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">
            Complete your profile to continue
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
            Your name is what appears on the tenancy record. It takes a moment
            and only needs to be done once.
          </p>
        </div>
      </div>
      <div className="shrink-0">
        <ButtonLink href="/app/profile">Complete Profile</ButtonLink>
      </div>
    </PanelShell>
  );
}

function CreatingAsStrip({ fullName }: { fullName: string }) {
  const wallet = useWalletIdentity();

  return (
    <PanelShell className="border-protected/30 bg-protected-soft">
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-sm font-semibold text-cream"
        >
          {initialsOf(fullName)}
        </span>
        <div className="min-w-0">
          <p className="eyebrow text-moss">Creating as</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-base font-semibold text-ink">{fullName}</span>
            {wallet.connected && wallet.shortAddress ? (
              <span className="font-mono text-[0.8125rem] text-muted">
                {wallet.shortAddress}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted">
            {wallet.connected && wallet.walletName
              ? `${wallet.walletName} on ${explorerClusterLabel()}`
              : "Signed in to DepositLock"}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-protected/30 bg-cream px-3 py-2 text-xs font-medium text-protected">
        <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
        Ready to create
      </div>
    </PanelShell>
  );
}

export function CreateTenancyView() {
  const gate = useRequireAuth();
  const { profile } = useProfile();

  const [step, setStep] = useState(0);
  const [propertyForm, setPropertyForm] = useState(emptyPropertyForm);
  const [termsForm, setTermsForm] = useState(emptyTermsForm);
  const [tenantForm, setTenantForm] = useState(emptyTenantForm);
  const [propertyErrors, setPropertyErrors] = useState<PropertyFormErrors>({});
  const [termsErrors, setTermsErrors] = useState<TermsFormErrors>({});
  const [tenantErrors, setTenantErrors] = useState<TenantFormErrors>({});
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTenancyState | null>(null);
  const propertiesRequested = useRef(false);

  const viewer = profile
    ? { email: profile.email, walletAddress: gate.walletAddress }
    : null;

  useEffect(() => {
    if (!gate.configured || !gate.authenticated || propertiesRequested.current) {
      return;
    }
    propertiesRequested.current = true;
    void (async () => {
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const result = await listPropertiesForViewer(client);
      if (!result.ok) return;
      setProperties(
        result.data.filter(
          (property) => property.createdByProfileId === gate.userId,
        ),
      );
    })();
  }, [gate.configured, gate.authenticated, gate.userId]);

  function handlePropertyContinue() {
    const result = validatePropertyForm(propertyForm);
    setPropertyErrors(result.errors);
    if (result.valid) setStep(1);
  }

  function handleTermsContinue() {
    const result = validateTermsForm(termsForm);
    setTermsErrors(result.errors);
    if (result.valid) {
      setTermsForm({
        startDate: result.values.startDate,
        endDate: result.values.endDate ?? "",
        monthlyRent: termsForm.monthlyRent,
        deposit: termsForm.deposit,
      });
      setStep(2);
    }
  }

  function handleTenantContinue() {
    const result = validateTenantForm(tenantForm, viewer);
    setTenantErrors(result.errors);
    if (result.valid) {
      setTenantForm({
        email: result.values.email,
        wallet: result.values.wallet ?? "",
      });
      setStep(3);
    }
  }

  async function handleSubmit() {
    setSubmitError(null);

    const propertyResult = validatePropertyForm(propertyForm);
    const termsResult = validateTermsForm(termsForm);
    const tenantResult = validateTenantForm(tenantForm, viewer);
    setPropertyErrors(propertyResult.errors);
    setTermsErrors(termsResult.errors);
    setTenantErrors(tenantResult.errors);

    if (!propertyResult.valid) {
      setStep(0);
      return;
    }
    if (!termsResult.valid) {
      setStep(1);
      return;
    }
    if (!tenantResult.valid) {
      setStep(2);
      return;
    }

    if (!gate.configured) {
      setSubmitError(
        "Supabase isn't configured in this environment — connect a project to create a real tenancy.",
      );
      return;
    }

    const client = getSupabaseBrowserClient();
    if (!client) {
      setSubmitError("The database connection isn't available. Try again.");
      return;
    }

    const propertyValues = propertyResult.values;
    const chosenProperty =
      propertyValues.mode === "existing"
        ? properties.find(
            (candidate) => candidate.id === propertyValues.existingPropertyId,
          )
        : undefined;

    setSubmitting(true);
    try {
      const result = await createTenancyWithInvitation(client, {
          startDate: termsResult.values.startDate,
          endDate: termsResult.values.endDate,
          monthlyRent: termsResult.values.monthlyRent,
          deposit: termsResult.values.deposit,
          tenantEmail: tenantResult.values.email,
          tenantWallet: tenantResult.values.wallet,
          ...(propertyValues.mode === "existing"
            ? { propertyId: propertyValues.existingPropertyId }
            : {
                property: {
                  addressLine1: propertyValues.addressLine1,
                  addressLine2: propertyValues.addressLine2 || null,
                  city: propertyValues.city,
                  county: propertyValues.county || null,
                  postalCode: propertyValues.postalCode || null,
                  propertyType: propertyValues.propertyType,
                  bedrooms: propertyValues.bedrooms.trim()
                    ? Number(propertyValues.bedrooms.trim())
                    : null,
                },
              }),
        },
      );

      if (!result.ok) {
        setSubmitError(displayMessage(result.error));
        return;
      }

      const addressLabel = chosenProperty
        ? chosenProperty.addressLine1
        : [propertyValues.addressLine1, propertyValues.city]
            .filter(Boolean)
            .join(", ");

      setCreated({
        tenancyId: result.data.tenancyId,
        inviteUrl: `${window.location.origin}/invite/${result.data.invitationToken}`,
        address: addressLabel,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const activeIndex = step;
  const ready = !gate.configured || (gate.authenticated && Boolean(profile));
  const gated = gate.configured && !ready;

  return (
    <Container className="space-y-8 py-10 sm:py-12">
      <PageHeader
        title="Create Tenancy"
        description="A four-step flow that turns a property, two people and a deposit into one protected record."
      />

      {gated ? (
        gate.status === "loading" ? (
          <LoadingPanel />
        ) : !gate.authenticated ? (
          <SignInPrompt
            title="Sign in to create a tenancy"
            description="Verify your wallet to continue. No funds will move."
          />
        ) : (
          <ProfileRequiredPanel />
        )
      ) : (
        <>
          {gate.configured && profile ? (
            <CreatingAsStrip fullName={profile.fullName} />
          ) : null}

          {created ? (
            <SuccessPanel created={created} />
          ) : (
            <section
              aria-label="Tenancy creation progress"
              className="overflow-hidden rounded-3xl border border-line bg-parchment"
            >
              <ol className="grid gap-px border-b border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
                {STAGES.map((stage, index) => {
                  const isComplete = index < activeIndex;
                  const isActive = index === activeIndex;

                  return (
                    <li
                      key={stage.key}
                      aria-current={isActive ? "step" : undefined}
                      className="flex items-start gap-3 bg-parchment px-5 py-5"
                    >
                      <span
                        aria-hidden
                        className={
                          isComplete
                            ? "grid size-7 shrink-0 place-items-center rounded-full bg-forest text-cream"
                            : isActive
                              ? "grid size-7 shrink-0 place-items-center rounded-full bg-forest text-[0.75rem] font-semibold text-cream"
                              : "grid size-7 shrink-0 place-items-center rounded-full border border-line bg-cream text-[0.75rem] font-semibold text-subtle"
                        }
                      >
                        {isComplete ? (
                          <Check className="size-3.5" strokeWidth={3} />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={
                            isActive || isComplete
                              ? "block text-sm font-semibold text-ink"
                              : "block text-sm font-medium text-subtle"
                          }
                        >
                          {stage.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                          {stage.summary}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>

              <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
                <div>
                  {step === 0 ? (
                    <PropertyStep
                      values={propertyForm}
                      errors={propertyErrors}
                      properties={properties}
                      onChange={(patch) =>
                        setPropertyForm((current) => ({ ...current, ...patch }))
                      }
                      onContinue={handlePropertyContinue}
                    />
                  ) : null}

                  {step === 1 ? (
                    <TenancyStep
                      values={termsForm}
                      errors={termsErrors}
                      onChange={(patch) =>
                        setTermsForm((current) => ({ ...current, ...patch }))
                      }
                      onBack={() => setStep(0)}
                      onContinue={handleTermsContinue}
                    />
                  ) : null}

                  {step === 2 ? (
                    <TenantStep
                      values={tenantForm}
                      errors={tenantErrors}
                      onChange={(patch) =>
                        setTenantForm((current) => ({ ...current, ...patch }))
                      }
                      onBack={() => setStep(1)}
                      onContinue={handleTenantContinue}
                    />
                  ) : null}

                  {step === 3 ? (
                    <ReviewStep
                      property={propertyForm}
                      terms={termsForm}
                      tenant={tenantForm}
                      properties={properties}
                      submitting={submitting}
                      submitError={submitError}
                      canSubmit={gate.configured}
                      notice={
                        gate.configured
                          ? null
                          : "Supabase isn't configured in this environment — the wizard works, but creating a real tenancy needs a connected project."
                      }
                      onEdit={(target) => setStep(target)}
                      onBack={() => setStep(2)}
                      onSubmit={() => void handleSubmit()}
                    />
                  ) : null}
                </div>

                <aside className="rounded-2xl border border-line bg-cream-raised p-6">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="grid size-9 place-items-center rounded-lg bg-sand text-moss"
                    >
                      <Info className="size-[18px]" strokeWidth={1.85} />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-ink">
                        How creation works
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        Each step validates before you continue. On review, the
                        tenancy and its invitation are created in one
                        transaction — no deposit moves in this flow.
                      </p>
                    </div>
                  </div>

                  <ul className="mt-6 space-y-3 border-t border-line pt-5">
                    {STAGES.map((stage, index) => (
                      <li key={stage.key} className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className="mt-1 size-1.5 shrink-0 rounded-full bg-line"
                        />
                        <span
                          className={
                            index === activeIndex
                              ? "text-sm font-medium text-ink"
                              : "text-sm text-muted"
                          }
                        >
                          {stage.label}
                          <span className="block text-xs text-subtle">
                            {stage.summary}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-xs leading-relaxed text-muted">
                    <Wallet aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    Nothing is signed until your tenant accepts the invitation.
                  </p>
                </aside>
              </div>
            </section>
          )}
        </>
      )}
    </Container>
  );
}
