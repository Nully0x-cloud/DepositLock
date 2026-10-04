import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  tone?: "default" | "onDark";
  size?: "md" | "lg";
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  tone = "default",
  size = "md",
  className,
}: SectionHeadingProps) {
  const centered = align === "center";
  const onDark = tone === "onDark";

  return (
    <div
      className={cn(
        "max-w-2xl",
        centered && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            "eyebrow mb-4",
            onDark ? "text-sage" : "text-moss",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={cn(
          "font-serif font-normal tracking-[-0.015em] leading-[1.08]",
          size === "lg"
            ? "text-[2.25rem] sm:text-[2.75rem]"
            : "text-[1.875rem] sm:text-[2.25rem]",
          onDark ? "text-cream" : "text-ink",
        )}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "mt-4 text-base leading-relaxed sm:text-[1.0625rem]",
            onDark ? "text-cream/70" : "text-muted",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
