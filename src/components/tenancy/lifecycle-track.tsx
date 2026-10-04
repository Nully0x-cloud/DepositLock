import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIFECYCLE, LIFECYCLE_ORDER } from "@/data/tenancies";
import type { LifecycleStage } from "@/types/tenancy";

type LifecycleTrackProps = {
  stage: LifecycleStage;
  tone?: "light" | "dark";
  showDescription?: boolean;
  className?: string;
};

export function LifecycleTrack({
  stage,
  tone = "light",
  showDescription = true,
  className,
}: LifecycleTrackProps) {
  const currentIndex = LIFECYCLE_ORDER.indexOf(stage);
  const onDark = tone === "dark";

  return (
    <div className={cn("w-full", className)}>
      <ol
        aria-label="Deposit lifecycle"
        className="hidden md:grid md:grid-cols-6"
      >
        {LIFECYCLE.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isUpcoming = index > currentIndex;
          const showConnector = index < LIFECYCLE.length - 1;

          return (
            <li key={step.key} className="relative min-w-0 pr-3">
              {showConnector ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-4 top-[15px] h-px w-[calc(100%-1rem)]",
                    index < currentIndex
                      ? onDark
                        ? "bg-cream/55"
                        : "bg-sage"
                      : onDark
                        ? "bg-cream/20"
                        : "bg-line",
                  )}
                />
              ) : null}

              <span
                aria-hidden
                className={cn(
                  "relative z-10 grid size-8 place-items-center rounded-full border text-[0.6875rem] font-semibold",
                  isComplete &&
                    (onDark
                      ? "border-cream bg-cream text-forest"
                      : "border-forest bg-forest text-cream"),
                  isCurrent &&
                    (onDark
                      ? "border-cream bg-forest text-cream shadow-[0_0_0_4px_rgba(245,242,234,0.18)]"
                      : "border-forest bg-cream text-forest shadow-[0_0_0_4px_rgba(23,61,45,0.12)]"),
                  isUpcoming &&
                    (onDark
                      ? "border-cream/30 bg-transparent text-cream/45"
                      : "border-line bg-cream text-subtle"),
                )}
              >
                {isComplete ? (
                  <Check className="size-4" strokeWidth={2.5} />
                ) : (
                  index + 1
                )}
              </span>

              <p
                className={cn(
                  "mt-3 text-[0.8125rem] font-semibold leading-snug",
                  isUpcoming
                    ? onDark
                      ? "text-cream/50"
                      : "text-subtle"
                    : onDark
                      ? "text-cream"
                      : "text-ink",
                )}
              >
                {step.label}
              </p>
              {showDescription ? (
                <p
                  className={cn(
                    "mt-1 pr-2 text-xs leading-relaxed",
                    onDark ? "text-cream/55" : "text-muted",
                  )}
                >
                  {step.description}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <ol aria-label="Deposit lifecycle" className="md:hidden">
        {LIFECYCLE.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isUpcoming = index > currentIndex;
          const isLast = index === LIFECYCLE.length - 1;

          return (
            <li key={step.key} className="relative flex gap-4 pb-5 last:pb-0">
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px",
                    index < currentIndex
                      ? onDark
                        ? "bg-cream/55"
                        : "bg-sage"
                      : onDark
                        ? "bg-cream/20"
                        : "bg-line",
                  )}
                />
              ) : null}

              <span
                aria-hidden
                className={cn(
                  "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border text-[0.6875rem] font-semibold",
                  isComplete &&
                    (onDark
                      ? "border-cream bg-cream text-forest"
                      : "border-forest bg-forest text-cream"),
                  isCurrent &&
                    (onDark
                      ? "border-cream bg-forest text-cream"
                      : "border-forest bg-cream text-forest"),
                  isUpcoming &&
                    (onDark
                      ? "border-cream/30 bg-transparent text-cream/45"
                      : "border-line bg-cream text-subtle"),
                )}
              >
                {isComplete ? (
                  <Check className="size-4" strokeWidth={2.5} />
                ) : (
                  index + 1
                )}
              </span>

              <div className="min-w-0 pt-1">
                <p
                  className={cn(
                    "text-sm font-semibold leading-snug",
                    isUpcoming
                      ? onDark
                        ? "text-cream/50"
                        : "text-subtle"
                      : onDark
                        ? "text-cream"
                        : "text-ink",
                  )}
                >
                  {step.label}
                </p>
                {showDescription ? (
                  <p
                    className={cn(
                      "mt-0.5 text-xs leading-relaxed",
                      onDark ? "text-cream/55" : "text-muted",
                    )}
                  >
                    {step.description}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
