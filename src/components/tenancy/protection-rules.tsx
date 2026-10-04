import { Handshake, Landmark, UserRoundCheck } from "lucide-react";
import { PROTECTION_RULES } from "@/data/tenancies";
import { cn } from "@/lib/utils";
import type { ProtectionRule } from "@/types/tenancy";

const icons: Record<string, typeof Handshake> = {
  "no-tenant-withdrawal": UserRoundCheck,
  "no-landlord-withdrawal": Landmark,
  "agreement-settlement": Handshake,
};

type ProtectionRulesProps = {
  rules?: ProtectionRule[];
  tone?: "light" | "dark";
  layout?: "list" | "row";
  className?: string;
};

export function ProtectionRules({
  rules = PROTECTION_RULES,
  tone = "light",
  layout = "list",
  className,
}: ProtectionRulesProps) {
  const onDark = tone === "dark";

  return (
    <ul
      className={cn(
        layout === "row"
          ? "grid gap-3 sm:grid-cols-3"
          : "grid gap-3",
        className,
      )}
    >
      {rules.map((rule) => {
        const Icon = icons[rule.id] ?? Handshake;

        return (
          <li
            key={rule.id}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3.5",
              onDark
                ? "border-cream/15 bg-cream/6"
                : "border-line bg-cream-raised",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                onDark ? "bg-cream/12 text-cream" : "bg-sand text-moss",
              )}
            >
              <Icon className="size-[15px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-[0.8125rem] font-semibold leading-snug",
                  onDark ? "text-cream" : "text-ink",
                )}
              >
                {rule.label}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-xs leading-relaxed",
                  onDark ? "text-cream/60" : "text-muted",
                )}
              >
                {rule.detail}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
