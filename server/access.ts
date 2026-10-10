export const modules = [
  "dashboard",
  "projects",
  "properties",
  "buyers",
  "sales",
  "payments",
  "expenses",
  "investments",
  "accounts",
  "employees",
  "vendors",
  "reports",
  "users",
  "settings",
] as const;

export type AppModule = (typeof modules)[number];
export type PermissionAction = "view" | "add" | "edit" | "delete";

export type PermissionFlags = {
  module: string;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const full = { canView: true, canAdd: true, canEdit: true, canDelete: true };
const viewOnly = { canView: true, canAdd: false, canEdit: false, canDelete: false };
const none = { canView: false, canAdd: false, canEdit: false, canDelete: false };

function matrix(fill: typeof full, overrides: Partial<Record<AppModule, Partial<typeof full>>> = {}) {
  return modules.map((module) => ({ module, ...fill, ...overrides[module] }));
}

export const roleCatalog = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Full access to every module.",
    permissions: matrix(full),
  },
  {
    key: "admin",
    name: "Admin",
    description: "Full access except deleting user accounts.",
    permissions: matrix(full, { users: { ...full, canDelete: false } }),
  },
  {
    key: "manager",
    name: "Manager",
    description: "Runs projects, inventory, and sales. Cannot manage users.",
    permissions: matrix(viewOnly, {
      projects: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      properties: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      buyers: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      sales: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      payments: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      expenses: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      vendors: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      investments: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      accounts: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      employees: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      users: none,
    }),
  },
  {
    key: "accountant",
    name: "Accountant",
    description: "Works with payments, expenses, investments, and reports.",
    permissions: matrix(viewOnly, {
      payments: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      expenses: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      vendors: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      investments: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      accounts: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      employees: { canView: true, canAdd: true, canEdit: true, canDelete: false },
      reports: { canView: true, canAdd: false, canEdit: false, canDelete: false },
      users: none,
    }),
  },
  {
    key: "editor",
    name: "Editor",
    description: "Creates and edits records, without delete or user admin.",
    permissions: matrix(
      { canView: true, canAdd: true, canEdit: true, canDelete: false },
      { users: none, settings: viewOnly },
    ),
  },
  {
    key: "viewer",
    name: "Viewer",
    description: "Read-only access. Cannot open user administration.",
    permissions: matrix(viewOnly, { users: none }),
  },
  {
    key: "approver",
    name: "Approver",
    description: "Reviews payments and expenses.",
    permissions: matrix(viewOnly, {
      payments: { canView: true, canAdd: false, canEdit: true, canDelete: false },
      expenses: { canView: true, canAdd: false, canEdit: true, canDelete: false },
      vendors: { canView: true, canAdd: false, canEdit: true, canDelete: false },
      users: none,
    }),
  },
] as const;

export function allows(permission: PermissionFlags | undefined, action: PermissionAction) {
  if (!permission) return false;
  if (action === "view") return permission.canView;
  if (action === "add") return permission.canAdd;
  if (action === "edit") return permission.canEdit;
  return permission.canDelete;
}
