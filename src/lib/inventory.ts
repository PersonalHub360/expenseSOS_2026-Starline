export const unitTypes = ["plot", "flat", "unit"] as const;
export const unitStatuses = ["available", "reserved", "sold", "cancelled"] as const;
export const sizeUnits = ["sqft", "katha", "decimal"] as const;

export type UnitType = (typeof unitTypes)[number];
export type UnitStatus = (typeof unitStatuses)[number];
export type SizeUnit = (typeof sizeUnits)[number];

export type InventoryProject = {
  id: string;
  name: string;
  location: string;
  createdAt: string;
};

/**
 * A unit always belongs to one project.
 * Booking, buyer, and sale stay on the unit as labels until those modules
 * exist. The id fields are reserved for those future records.
 */
export type PropertyUnit = {
  id: string;
  projectId: string;
  number: string;
  type: UnitType;
  size: number;
  sizeUnit: SizeUnit;
  location: string;
  price: number;
  status: UnitStatus;
  bookingId: string | null;
  buyerId: string | null;
  saleId: string | null;
  bookingLabel: string;
  buyerLabel: string;
  saleLabel: string;
  updatedAt: string;
};

export type InventoryStore = {
  projects: InventoryProject[];
  units: PropertyUnit[];
};

export type UnitInput = {
  projectId: string;
  number: string;
  type: UnitType;
  size: number;
  sizeUnit: SizeUnit;
  location: string;
  price: number;
  status: UnitStatus;
  bookingLabel: string;
  buyerLabel: string;
  saleLabel: string;
};

export type ProjectInput = {
  name: string;
  location: string;
};

const storageKey = "starline.inventory.v1";

export const typeLabels: Record<UnitType, string> = {
  plot: "Plot",
  flat: "Flat",
  unit: "Unit",
};

export const statusLabels: Record<UnitStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  cancelled: "Cancelled",
};

export function emptyStore(): InventoryStore {
  return { projects: [], units: [] };
}

export function loadInventory(): InventoryStore {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as InventoryStore;
    if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.units)) {
      return emptyStore();
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

export function saveInventory(store: InventoryStore) {
  localStorage.setItem(storageKey, JSON.stringify(store));
}

export function formatPrice(price: number) {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(price)}`;
}

export function formatSize(size: number, unit: SizeUnit) {
  return `${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(size)} ${unit}`;
}

export function relationsForStatus(input: UnitInput) {
  if (input.status === "available") {
    return { bookingId: null, buyerId: null, saleId: null, bookingLabel: "", buyerLabel: "", saleLabel: "" };
  }

  const bookingLabel = input.bookingLabel.trim();
  const buyerLabel = input.buyerLabel.trim();
  const saleLabel = input.status === "reserved" ? "" : input.saleLabel.trim();

  return {
    bookingId: null,
    buyerId: null,
    saleId: null,
    bookingLabel,
    buyerLabel,
    saleLabel,
  };
}

export function validateProject(input: ProjectInput, projects: InventoryProject[], ignoreId?: string) {
  const errors: Partial<Record<keyof ProjectInput, string>> = {};
  const name = input.name.trim();
  if (!name) errors.name = "Enter a project name.";
  else if (
    projects.some(
      (project) => project.id !== ignoreId && project.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = "A project with this name already exists.";
  }
  if (!input.location.trim()) errors.location = "Enter the project location.";
  return errors;
}

export function validateUnit(input: UnitInput, units: PropertyUnit[], ignoreId?: string) {
  const errors: Partial<Record<keyof UnitInput, string>> = {};
  if (!input.projectId) errors.projectId = "Choose a project.";

  const number = input.number.trim();
  if (!number) errors.number = "Enter the unit number.";
  else if (
    units.some(
      (unit) =>
        unit.id !== ignoreId &&
        unit.projectId === input.projectId &&
        unit.number.trim().toLowerCase() === number.toLowerCase(),
    )
  ) {
    errors.number = "This unit number is already used in the project.";
  }

  if (!unitTypes.includes(input.type)) errors.type = "Choose plot, flat, or unit.";
  if (!Number.isFinite(input.size) || input.size <= 0) errors.size = "Enter a size greater than 0.";
  if (!input.location.trim()) errors.location = "Enter the location.";
  if (!Number.isFinite(input.price) || input.price <= 0) errors.price = "Enter a price greater than 0.";

  if (input.status === "reserved" || input.status === "sold") {
    if (!input.bookingLabel.trim()) errors.bookingLabel = "Add the booking this unit is tied to.";
    if (!input.buyerLabel.trim()) errors.buyerLabel = "Add the buyer this unit is tied to.";
  }
  if (input.status === "sold" && !input.saleLabel.trim()) {
    errors.saleLabel = "Add the sale this unit is tied to.";
  }

  return errors;
}

export function countByStatus(units: PropertyUnit[], status: UnitStatus) {
  return units.filter((unit) => unit.status === status).length;
}
