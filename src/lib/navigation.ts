import { FilePlus2, LayoutGrid, UserRound, Files } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  section: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const APP_NAV: AppNavItem[] = [
  {
    href: "/app",
    label: "Overview",
    section: "Overview",
    icon: LayoutGrid,
    exact: true,
  },
  {
    href: "/app/tenancies",
    label: "My Tenancies",
    section: "My Tenancies",
    icon: Files,
  },
  {
    href: "/app/create",
    label: "Create Tenancy",
    section: "Create Tenancy",
    icon: FilePlus2,
  },
  {
    href: "/app/profile",
    label: "Profile",
    section: "Profile",
    icon: UserRound,
  },
];

export function sectionForPath(pathname: string): string {
  const match = [...APP_NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) =>
      item.exact ? pathname === item.href : pathname.startsWith(item.href),
  );

  if (!match) return pathname.startsWith("/app/tenancies") ? "Tenancy Record" : "Overview";
  return match.section;
}

export function isActivePath(item: AppNavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
