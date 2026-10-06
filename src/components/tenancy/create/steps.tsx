"use client";

import { Check, Copy, Info, UserRound } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert, SelectField, TextField } from "@/components/tenancy/create/fields";
import type { PropertyRecord } from "@/lib/db/models";
import { parseMoneyAmount } from "@/lib/money";
import {
  PROPERTY_TYPES,
  type PropertyFormErrors,
  type PropertyFormValues,
  type TenantFormErrors,
  type TenantFormValues,
  type TermsFormErrors,
  type TermsFormValues,
} from "@/lib/tenancy/create-form";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

function StepHeading({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="eyebrow text-moss">Step {index} of 4</p>
      <h2 className="mt-3 font-serif text-[1.75rem] leading-tight tracking-[-0.02em] text-ink">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
    </div>
  );
}

function StepNav({
  onBack,
  children,
}: {
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-line pt-6">
      {children}
      {onBack ? (
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
      ) : null}
      <ButtonLink href="/app/tenancies" variant="ghost">
        Cancel
      </ButtonLink>
    </div>
  );
}

function modeChoiceClass(checked: boolean) {
  return cn(
    "flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
    checked
      ? "border-forest bg-forest/8 text-forest"
      : "border-line bg-cream-raised text-ink hover:border-forest/40",
  );
}

function propertyChoiceClass(checked: boolean) {
  return cn(
    "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 transition-colors",
    checked
      ? "border-forest bg-forest/5"
      : "border-line bg-cream-raised hover:border-forest/40",
  );
}

function propertyLines(addressLine1: string, addressLine2?: string | null, tail?: string | null) {
  const first = addressLine2 ? `${addressLine1}, ${addressLine2}` : addressLine1;
  return { first, second: tail ?? "" };
}

function moneyLabel(raw: string): string {
  const parsed = parseMoneyAmount(raw);
  return parsed.ok ? formatCurrency(parsed.value) : raw;
}

/** Date-only ISO strings parse as UTC — anchor them in local time to display. */
function dateLabel(iso: string): string {
  return formatDate(new Date(`${iso}T00:00:00`));
}

export function PropertyStep({
  values,
  errors,
  properties,
  onChange,
  onContinue,
}: {
  values: PropertyFormValues;
  errors: PropertyFormErrors;
  properties: PropertyRecord[];
  onChange: (patch: Partial<PropertyFormValues>) => void;
  onContinue: () => void;
}) {
  const addressId = useId();
  const address2Id = useId();
  const cityId = useId();
  const countyId = useId();
  const postalId = useId();
  const typeId = useId();
  const bedroomsId = useId();

  return (
    <div>
      <StepHeading
        index={1}
        title="Property"
        description="Where the tenancy lives. Reuse a property you already manage, or add a new one now."
      />

      {properties.length > 0 ? (
        <fieldset className="mt-6">
          <legend className="text-xs font-semibold uppercase tracking-[0.1em] text-subtle">
            Start from
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className={modeChoiceClass(values.mode === "new")}>
              <input
                type="radio"
                name="property-mode"
                className="size-4 accent-forest"
                checked={values.mode === "new"}
                onChange={() => onChange({ mode: "new", existingPropertyId: null })}
              />
              Add a new property
            </label>
            <label className={modeChoiceClass(values.mode === "existing")}>
              <input
                type="radio"
                name="property-mode"
                className="size-4 accent-forest"
                checked={values.mode === "existing"}
                onChange={() => onChange({ mode: "existing" })}
              />
              Use an existing property
            </label>
          </div>
        </fieldset>
      ) : null}

      {values.mode === "existing" ? (
        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-[0.1em] text-subtle">
            Choose a property
          </legend>
          <div className="mt-2 grid gap-3">
            {properties.map((property) => {
              const lines = propertyLines(
                property.addressLine1,
                property.addressLine2,
                [property.city, property.postalCode].filter(Boolean).join(" "),
              );
              return (
                <label
                  key={property.id}
                  className={propertyChoiceClass(
                    values.existingPropertyId === property.id,
                  )}
                >
                  <input
                    type="radio"
                    name="existing-property"
                    className="mt-1 size-4 accent-forest"
                    checked={values.existingPropertyId === property.id}
                    onChange={() => onChange({ existingPropertyId: property.id })}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">
                      {lines.first}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {lines.second}
                      {lines.second ? " · " : ""}
                      {property.propertyType}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {errors.existingPropertyId ? (
            <p role="alert" className="mt-2 text-xs text-dispute">
              {errors.existingPropertyId}
            </p>
          ) : null}
        </fieldset>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <TextField
            className="sm:col-span-2"
            id={addressId}
            label="Street address"
            value={values.addressLine1}
            onChange={(value) => onChange({ addressLine1: value })}
            error={errors.addressLine1}
            placeholder="e.g. 18 Camden Street"
          />
          <TextField
            className="sm:col-span-2"
            id={address2Id}
            label="Address line 2 (optional)"
            value={values.addressLine2}
            onChange={(value) => onChange({ addressLine2: value })}
            placeholder="e.g. Flat 2"
          />
          <TextField
            id={cityId}
            label="City or town"
            value={values.city}
            onChange={(value) => onChange({ city: value })}
            error={errors.city}
            placeholder="e.g. Dublin"
          />
          <TextField
            id={countyId}
            label="County (optional)"
            value={values.county}
            onChange={(value) => onChange({ county: value })}
            placeholder="e.g. Dublin"
          />
          <TextField
            id={postalId}
            label="Eircode (optional)"
            value={values.postalCode}
            onChange={(value) => onChange({ postalCode: value })}
            placeholder="e.g. D02 XY34"
          />
          <SelectField
            id={typeId}
            label="Property type"
            value={values.propertyType}
            onChange={(value) =>
              onChange({ propertyType: value as PropertyFormValues["propertyType"] })
            }
            options={PROPERTY_TYPES}
            placeholder="Choose a type"
            error={errors.propertyType}
          />
          <TextField
            id={bedroomsId}
            label="Bedrooms (optional)"
            value={values.bedrooms}
            onChange={(value) => onChange({ bedrooms: value })}
            error={errors.bedrooms}
            inputMode="numeric"
            placeholder="e.g. 2"
          />
        </div>
      )}

      <StepNav>
        <Button type="button" onClick={onContinue}>
          Continue
        </Button>
      </StepNav>
    </div>
  );
}

export function TenancyStep({
  values,
  errors,
  onChange,
  onBack,
  onContinue,
}: {
  values: TermsFormValues;
  errors: TermsFormErrors;
  onChange: (patch: Partial<TermsFormValues>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const startId = useId();
  const endId = useId();
  const rentId = useId();
  const depositId = useId();

  return (
    <div>
      <StepHeading
        index={2}
        title="Tenancy"
        description="The dates, the rent and the deposit amount the record will enforce."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <TextField
          id={startId}
          label="Start date"
          type="date"
          value={values.startDate}
          onChange={(value) => onChange({ startDate: value })}
          error={errors.startDate}
        />
        <TextField
          id={endId}
          label="End date (optional)"
          type="date"
          value={values.endDate}
          onChange={(value) => onChange({ endDate: value })}
          error={errors.endDate}
          hint="Leave blank for a rolling tenancy."
        />
        <TextField
          id={rentId}
          label="Monthly rent (EUR)"
          inputMode="decimal"
          value={values.monthlyRent}
          onChange={(value) => onChange({ monthlyRent: value })}
          error={errors.monthlyRent}
          placeholder="e.g. 1800.00"
          hint="As agreed with the tenant, in euro."
        />
        <TextField
          id={depositId}
          label="Deposit amount (EUR)"
          inputMode="decimal"
          value={values.deposit}
          onChange={(value) => onChange({ deposit: value })}
          error={errors.deposit}
          placeholder="e.g. 1800.00"
          hint="The amount you will protect."
        />
      </div>

      <StepNav onBack={onBack}>
        <Button type="button" onClick={onContinue}>
          Continue
        </Button>
      </StepNav>
    </div>
  );
}

export function TenantStep({
  values,
  errors,
  onChange,
  onBack,
  onContinue,
}: {
  values: TenantFormValues;
  errors: TenantFormErrors;
  onChange: (patch: Partial<TenantFormValues>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const emailId = useId();
  const walletId = useId();

  return (
    <div>
      <StepHeading
        index={3}
        title="Tenant"
        description="Invite the person taking on the tenancy. They accept with their own wallet — nothing is signed for them."
      />

      <div className="mt-6 grid gap-4">
        <TextField
          id={emailId}
          label="Tenant email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(value) => onChange({ email: value })}
          error={errors.email}
          placeholder="e.g. tenant@example.ie"
          hint="Used to match them when they open the invitation."
        />
        <TextField
          id={walletId}
          label="Tenant wallet (optional)"
          value={values.wallet}
          onChange={(value) => onChange({ wallet: value })}
          error={errors.wallet}
          placeholder="Solana address"
          hint="If you provide it, accepting requires this exact wallet."
        />
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-line bg-cream-raised px-4 py-3.5">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-moss" strokeWidth={1.85} />
        <p className="text-sm leading-relaxed text-muted">
          After review, a one-time invitation link is created. Share it with
          your tenant — they sign in with their wallet and accept. The tenancy
          stays <span className="font-medium text-ink">awaiting tenant</span>{" "}
          until they do.
        </p>
      </div>

      <StepNav onBack={onBack}>
        <Button type="button" onClick={onContinue}>
          Continue
        </Button>
      </StepNav>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-cream-raised px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-subtle">
          {title}
        </h3>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-semibold text-forest hover:underline"
          >
            Edit
          </button>
        ) : null}
      </div>
      <div className="mt-3 space-y-2.5">{children}</div>
    </section>
  );
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </p>
  );
}

export function ReviewStep({
  property,
  terms,
  tenant,
  properties,
  submitting,
  submitError,
  canSubmit,
  notice,
  onEdit,
  onBack,
  onSubmit,
}: {
  property: PropertyFormValues;
  terms: TermsFormValues;
  tenant: TenantFormValues;
  properties: PropertyRecord[];
  submitting: boolean;
  submitError: string | null;
  canSubmit: boolean;
  notice?: string | null;
  onEdit: (step: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const chosen =
    property.mode === "existing"
      ? properties.find((candidate) => candidate.id === property.existingPropertyId)
      : undefined;

  const address = chosen
    ? propertyLines(
        chosen.addressLine1,
        chosen.addressLine2,
        [chosen.city, chosen.postalCode].filter(Boolean).join(" "),
      )
    : propertyLines(property.addressLine1, property.addressLine2, property.city);

  const addressTail = chosen
    ? chosen.propertyType
    : [property.postalCode, property.propertyType]
        .filter(Boolean)
        .join(" · ");

  return (
    <div>
      <StepHeading
        index={4}
        title="Review"
        description="Confirm the terms, then create the record and its invitation in one step."
      />

      <div className="mt-6 grid gap-4">
        <ReviewSection title="Property" onEdit={() => onEdit(0)}>
          <p className="text-sm font-semibold text-ink">{address.first}</p>
          <p className="text-sm text-muted">
            {[address.second, addressTail].filter(Boolean).join(" · ")}
          </p>
        </ReviewSection>

        <ReviewSection title="Tenancy" onEdit={() => onEdit(1)}>
          <ReviewRow label="Start date" value={dateLabel(terms.startDate)} />
          <ReviewRow
            label="End date"
            value={terms.endDate ? dateLabel(terms.endDate) : "No fixed end date"}
          />
          <ReviewRow
            label="Monthly rent"
            value={moneyLabel(terms.monthlyRent)}
          />
          <ReviewRow label="Deposit" value={moneyLabel(terms.deposit)} />
        </ReviewSection>

        <ReviewSection title="Tenant" onEdit={() => onEdit(2)}>
          <ReviewRow label="Email" value={tenant.email} />
          <ReviewRow
            label="Wallet"
            value={
              tenant.wallet ? (
                <span className="max-w-full truncate font-mono text-[0.8125rem]">
                  {tenant.wallet}
                </span>
              ) : (
                "Matched by email"
              )
            }
          />
        </ReviewSection>
      </div>

      {submitError ? (
        <div className="mt-5">
          <FormAlert>{submitError}</FormAlert>
        </div>
      ) : null}

      {notice ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-sand/60 px-4 py-3 text-sm text-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.85} />
          <p>{notice}</p>
        </div>
      ) : null}

      <StepNav onBack={onBack}>
        <Button type="button" onClick={onSubmit} disabled={submitting || !canSubmit}>
          {submitting ? "Creating…" : "Create tenancy"}
        </Button>
      </StepNav>
    </div>
  );
}

export type CreatedTenancyState = {
  tenancyId: string;
  inviteUrl: string;
  address: string;
};

export function SuccessPanel({ created }: { created: CreatedTenancyState }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-3xl border border-protected/30 bg-protected-soft p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-cream"
        >
          <Check className="size-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p className="eyebrow text-moss">Tenancy created</p>
          <h2 className="mt-2 font-serif text-[1.6rem] leading-tight tracking-[-0.02em] text-ink">
            {created.address}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            The record is now{" "}
            <span className="font-medium text-ink">awaiting tenant</span>. Share
            the invitation link below — your tenant accepts it with their own
            wallet, and the deposit flow begins once they do.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-protected/25 bg-cream px-4 py-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-subtle">
          <UserRound aria-hidden className="size-3.5" strokeWidth={2} />
          Invitation link
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            readOnly
            value={created.inviteUrl}
            aria-label="Invitation link"
            className="h-11 w-full min-w-0 truncate rounded-xl border border-line bg-cream-raised px-3.5 font-mono text-xs text-ink focus:border-forest/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
            onFocus={(event) => event.target.select()}
          />
          <Button type="button" variant="secondary" onClick={copyLink} className="shrink-0">
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
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Treat it like a key: anyone holding it can open the invitation. You
          can cancel and re-issue it from the tenancy record at any time.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ButtonLink href={`/app/tenancies/${created.tenancyId}`}>
          Open tenancy record
        </ButtonLink>
        <ButtonLink href="/app/tenancies" variant="ghost">
          Back to tenancies
        </ButtonLink>
      </div>
    </section>
  );
}
