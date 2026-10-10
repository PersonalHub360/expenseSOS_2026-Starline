import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  loadInventory,
  relationsForStatus,
  saveInventory,
  type InventoryProject,
  type InventoryStore,
  type ProjectInput,
  type PropertyUnit,
  type UnitInput,
} from "@/lib/inventory";

type InventoryContextValue = {
  projects: InventoryProject[];
  units: PropertyUnit[];
  addProject: (input: ProjectInput) => InventoryProject;
  addUnit: (input: UnitInput) => PropertyUnit;
  updateUnit: (id: string, input: UnitInput) => void;
  deleteUnit: (id: string) => void;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

function createId() {
  return crypto.randomUUID();
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<InventoryStore>(() => loadInventory());

  useEffect(() => {
    saveInventory(store);
  }, [store]);

  const value = useMemo<InventoryContextValue>(() => {
    const addProject = (input: ProjectInput) => {
      const project: InventoryProject = {
        id: createId(),
        name: input.name.trim(),
        location: input.location.trim(),
        createdAt: new Date().toISOString(),
      };
      setStore((current) => ({ ...current, projects: [project, ...current.projects] }));
      return project;
    };

    const toUnit = (id: string, input: UnitInput, updatedAt: string): PropertyUnit => ({
      id,
      projectId: input.projectId,
      number: input.number.trim(),
      type: input.type,
      size: input.size,
      sizeUnit: input.sizeUnit,
      location: input.location.trim(),
      price: input.price,
      status: input.status,
      updatedAt,
      ...relationsForStatus(input),
    });

    return {
      projects: store.projects,
      units: store.units,
      addProject,
      addUnit: (input) => {
        const unit = toUnit(createId(), input, new Date().toISOString());
        setStore((current) => ({ ...current, units: [unit, ...current.units] }));
        return unit;
      },
      updateUnit: (id, input) => {
        setStore((current) => ({
          ...current,
          units: current.units.map((unit) =>
            unit.id === id ? toUnit(id, input, new Date().toISOString()) : unit,
          ),
        }));
      },
      deleteUnit: (id) => {
        setStore((current) => ({
          ...current,
          units: current.units.filter((unit) => unit.id !== id),
        }));
      },
    };
  }, [store]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const value = useContext(InventoryContext);
  if (!value) throw new Error("useInventory must be used within InventoryProvider");
  return value;
}
