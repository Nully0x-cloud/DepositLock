import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Container } from "@/components/layout/container";

const FOOTER_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#tenants", label: "For Tenants" },
  { href: "/#landlords", label: "For Landlords" },
  { href: "/#why", label: "Why DepositLock" },
  { href: "/app", label: "Sign In" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-cream">
      <Container>
        <div className="flex flex-col gap-8 py-10 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3">
            <Brand size="sm" />
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              Rental deposits held in a neutral record neither party controls
              alone.
            </p>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {FOOTER_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-line py-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} DepositLock. Phase 1 preview.</p>
          <p className="tracking-[0.08em] uppercase">
            Protected by programmable settlement
          </p>
        </div>
      </Container>
    </footer>
  );
}
