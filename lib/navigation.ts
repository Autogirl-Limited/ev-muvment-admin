import type { UserType } from "@/lib/api/types";

export type NavIcon =
  | "dashboard"
  | "profile"
  | "security"
  | "applications"
  | "transactions"
  | "checklists"
  | "fleet"
  | "configurations";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  /** Roles that see this item. Omit for every staff role. */
  roles?: readonly UserType[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * Sidebar navigation. Role gating here only hides links; the API is the source
 * of truth, so pages must still handle a 403 (see <AccessDenied />).
 * Admin-only entries (Users, Driver applications, Payments) will carry `roles: ["ADMIN"]` when those pages are built.
 */
export const NAVIGATION: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
      {
        label: "Transactions",
        href: "/dva-transactions",
        icon: "transactions",
        roles: ["ADMIN", "ACCOUNT_OFFICER", "RELATIONSHIP_OFFICER"],
      },
      {
        label: "Fleet vehicles",
        href: "/fleet-vehicles",
        icon: "fleet",
        roles: ["ADMIN", "ACCOUNT_OFFICER", "RELATIONSHIP_OFFICER"],
      },
      {
        label: "Daily checklists",
        href: "/daily-checklists",
        icon: "checklists",
        roles: ["ADMIN", "ACCOUNT_OFFICER", "RELATIONSHIP_OFFICER"],
      },
      {
        label: "Driver applications",
        href: "/admin/driver-applications",
        icon: "applications",
        roles: ["ADMIN"],
      },
    ],
  },
  {
    title: "Platform",
    items: [
      {
        label: "Configurations",
        href: "/configurations",
        icon: "configurations",
        roles: ["ADMIN", "ACCOUNT_OFFICER", "RELATIONSHIP_OFFICER"],
      },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Profile", href: "/settings/profile", icon: "profile" },
      { label: "Security", href: "/settings/security", icon: "security" },
    ],
  },
];

export function navigationFor(role: UserType): NavSection[] {
  return NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.roles || item.roles.includes(role),
    ),
  })).filter((section) => section.items.length > 0);
}

export const ROLE_LABELS: Record<UserType, string> = {
  ADMIN: "Admin",
  ACCOUNT_OFFICER: "Account Officer",
  RELATIONSHIP_OFFICER: "Relationship Officer",
  DRIVER: "Driver",
};
