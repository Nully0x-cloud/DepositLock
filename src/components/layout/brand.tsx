import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandProps = {
  className?: string;
  tone?: "default" | "onDark";
  href?: string;
  size?: "sm" | "md";
  onClick?: () => void;
};

export function Brand({
  className,
  tone = "default",
  href = "/",
  size = "md",
  onClick,
}: BrandProps) {
  const onDark = tone === "onDark";

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label="DepositLock home"
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-full",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-8 place-items-center rounded-[10px] transition-transform duration-200 group-hover:-translate-y-px",
          onDark ? "bg-cream text-forest" : "bg-forest text-cream",
        )}
      >
        <ShieldCheck className="size-[18px]" strokeWidth={2.1} />
      </span>
      <span
        className={cn(
          "font-semibold tracking-[-0.02em]",
          size === "sm" ? "text-[0.9375rem]" : "text-[1.0625rem]",
          onDark ? "text-cream" : "text-ink",
        )}
      >
        DepositLock
      </span>
    </Link>
  );
}
