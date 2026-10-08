"use client";

import { Database } from "lucide-react";
import { isLocalSupabaseUrl, readSupabaseConfig } from "@/lib/db/client";
import { cn } from "@/lib/utils";

/**
 * Shows which Supabase project the app is reading.
 *
 * Local and hosted projects are completely separate identity universes:
 * the same Solana wallet gets a different auth user, profile, and tenancy
 * list on each. Surfacing the backend keeps a config switch from looking
 * like deleted data.
 */
export function BackendBadge({ className }: { className?: string }) {
  const config = readSupabaseConfig();
  if (!config) return null;
  const local = isLocalSupabaseUrl(config.url);

  return (
    <p
      title={local ? "Connected to the local Supabase stack" : "Connected to the hosted Supabase project"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-moss",
        className,
      )}
    >
      <Database aria-hidden className="size-3" strokeWidth={2} />
      {local ? "Local data" : "Hosted data"}
    </p>
  );
}
