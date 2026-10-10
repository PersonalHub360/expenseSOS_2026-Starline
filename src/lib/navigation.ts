import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  Building2,
  CircleDollarSign,
  Landmark,
  LayoutDashboard,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  UserCog,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

export type ModuleStatus = "foundation" | "coming-soon" | "live";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  status: ModuleStatus;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * A module stays "coming-soon" until that phase ships working screens.
 * Do not mark a route live early.
 */
export const navigation: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/",
        label: "Dashboard",
        description: "Sales, collections, dues, costs, cash, and approvals from live records.",
        icon: LayoutDashboard,
        status: "live",
      },
    ],
  },
  {
    label: "Portfolio",
    items: [
      {
        href: "/projects",
        label: "Projects",
        description: "Project records, budget against actual cost, and linked work.",
        icon: Building2,
        status: "live",
      },
      {
        href: "/properties",
        label: "Properties/Units",
        description: "Plots, flats, and units under each project.",
        icon: Landmark,
        status: "live",
      },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        href: "/buyers",
        label: "Buyers",
        description: "Buyer profiles, contact details, and linked sales.",
        icon: Users,
        status: "live",
      },
      {
        href: "/sales",
        label: "Sales",
        description: "Bookings, sale price, discount, and installment schedules.",
        icon: ShoppingBag,
        status: "live",
      },
      {
        href: "/payments",
        label: "Payments",
        description: "Receipts, collections, refunds, and outstanding balances.",
        icon: Wallet,
        status: "live",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        href: "/expenses",
        label: "Expenses",
        description: "Project and operating expenses, receipts, and approvals.",
        icon: Receipt,
        status: "live",
      },
      {
        href: "/investments",
        label: "Investments",
        description: "Investor capital, expected return, and outstanding balances.",
        icon: CircleDollarSign,
        status: "live",
      },
      {
        href: "/accounts",
        label: "Cash & bank",
        description: "Accounts, deposits, withdrawals, transfers, and balances.",
        icon: Banknote,
        status: "live",
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/employees",
        label: "Employees/Salary",
        description: "Staff profiles, salary slips, and the monthly payroll summary.",
        icon: UserRound,
        status: "live",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/purchases",
        label: "Purchase Management",
        description: "Land, materials, construction, and the account that pays.",
        icon: ShoppingCart,
        status: "live",
      },
      {
        href: "/reports",
        label: "Reports",
        description: "Sales, dues, costs, salary, cash flow, and profit and loss.",
        icon: BarChart3,
        status: "live",
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        href: "/users",
        label: "Users",
        description: "Workspace accounts and access.",
        icon: UserCog,
        status: "live",
      },
      {
        href: "/settings",
        label: "Settings",
        description: "Company profile and workspace preferences.",
        icon: Settings,
        status: "coming-soon",
      },
    ],
  },
];

export type FlatNavItem = NavItem & { group: string };

export function flattenNavigation(): FlatNavItem[] {
  return navigation.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.label })),
  );
}

export function findNavItem(path: string): FlatNavItem | undefined {
  return flattenNavigation().find((item) => item.href === path);
}
