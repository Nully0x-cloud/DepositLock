import { cn, initialsOf } from "@/lib/utils";
import type { Party } from "@/types/tenancy";

type IdentityRowProps = {
  party: Party;
  align?: "start" | "center";
  size?: "sm" | "md";
  tone?: "default" | "onDark";
  showMeta?: boolean;
  className?: string;
};

export function IdentityRow({
  party,
  align = "start",
  size = "md",
  tone = "default",
  showMeta = true,
  className,
}: IdentityRowProps) {
  const onDark = tone === "onDark";
  const centered = align === "center";

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        centered && "flex-col text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-full font-semibold tracking-tight",
          size === "sm" ? "size-9 text-xs" : "size-11 text-sm",
          onDark ? "bg-cream/12 text-cream" : "bg-sand text-forest",
          onDark ? "border border-cream/20" : "border border-line",
        )}
      >
        {initialsOf(party.name)}
      </span>

      <div className={cn("min-w-0", centered && "flex flex-col items-center")}>
        <p
          className={cn(
            "truncate text-sm font-semibold",
            onDark ? "text-cream" : "text-ink",
          )}
        >
          {party.name}
        </p>
        <p
          className={cn(
            "text-xs",
            onDark ? "text-cream/60" : "text-muted",
          )}
        >
          {party.role === "tenant" ? "Tenant" : "Landlord"}
        </p>
        {showMeta ? (
          <p
            className={cn(
              "mt-0.5 truncate text-xs",
              onDark ? "text-cream/45" : "text-subtle",
            )}
          >
            {party.email}
          </p>
        ) : null}
      </div>
    </div>
  );
}
