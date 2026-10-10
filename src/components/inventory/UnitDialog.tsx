import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { useInventory } from "@/context/InventoryContext";
import {
  sizeUnits,
  statusLabels,
  typeLabels,
  unitStatuses,
  unitTypes,
  validateUnit,
  type PropertyUnit,
  type UnitInput,
  type UnitStatus,
} from "@/lib/inventory";

type UnitDialogProps = {
  projectId: string;
  unit?: PropertyUnit;
  onClose: () => void;
};

function toInput(unit: PropertyUnit | undefined, projectId: string): UnitInput {
  return {
    projectId: unit?.projectId ?? projectId,
    number: unit?.number ?? "",
    type: unit?.type ?? "flat",
    size: unit?.size ?? 0,
    sizeUnit: unit?.sizeUnit ?? "sqft",
    location: unit?.location ?? "",
    price: unit?.price ?? 0,
    status: unit?.status ?? "available",
    bookingLabel: unit?.bookingLabel ?? "",
    buyerLabel: unit?.buyerLabel ?? "",
    saleLabel: unit?.saleLabel ?? "",
  };
}

export function UnitDialog({ projectId, unit, onClose }: UnitDialogProps) {
  const { projects, units, addUnit, updateUnit } = useInventory();
  const [input, setInput] = useState<UnitInput>(() => toInput(unit, projectId));
  const [errors, setErrors] = useState<Partial<Record<keyof UnitInput, string>>>({});

  const setStatus = (status: UnitStatus) => {
    setInput((current) => ({
      ...current,
      status,
      bookingLabel: status === "available" ? "" : current.bookingLabel,
      buyerLabel: status === "available" ? "" : current.buyerLabel,
      saleLabel: status === "sold" || status === "cancelled" ? current.saleLabel : "",
    }));
  };

  const submit = () => {
    const nextErrors = validateUnit(input, units, unit?.id);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (unit) updateUnit(unit.id, input);
    else addUnit(input);
    onClose();
  };

  const showBooking = input.status === "reserved" || input.status === "sold" || input.status === "cancelled";
  const showSale = input.status === "sold" || input.status === "cancelled";

  return (
    <Dialog title={unit ? `Edit ${unit.number}` : "New unit"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="block text-sm font-medium">
          Project
          <select
            value={input.projectId}
            onChange={(event) => setInput({ ...input, projectId: event.target.value })}
            className={`${fieldClass} mt-1.5`}
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.projectId} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Unit number
            <input
              autoFocus
              value={input.number}
              onChange={(event) => setInput({ ...input, number: event.target.value })}
              className={`${fieldClass} mt-1.5`}
              placeholder="A-1204"
            />
            <FieldError message={errors.number} />
          </label>
          <label className="block text-sm font-medium">
            Type
            <select
              value={input.type}
              onChange={(event) => setInput({ ...input, type: event.target.value as UnitInput["type"] })}
              className={`${fieldClass} mt-1.5`}
            >
              {unitTypes.map((type) => (
                <option key={type} value={type}>
                  {typeLabels[type]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <label className="block text-sm font-medium">
            Size
            <input
              inputMode="decimal"
              value={input.size || ""}
              onChange={(event) => setInput({ ...input, size: Number(event.target.value) })}
              className={`${fieldClass} mt-1.5`}
              placeholder="1450"
            />
            <FieldError message={errors.size} />
          </label>
          <label className="block text-sm font-medium">
            Size unit
            <select
              value={input.sizeUnit}
              onChange={(event) =>
                setInput({ ...input, sizeUnit: event.target.value as UnitInput["sizeUnit"] })
              }
              className={`${fieldClass} mt-1.5`}
            >
              {sizeUnits.map((unitName) => (
                <option key={unitName} value={unitName}>
                  {unitName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium">
          Location
          <input
            value={input.location}
            onChange={(event) => setInput({ ...input, location: event.target.value })}
            className={`${fieldClass} mt-1.5`}
            placeholder="Block B, Floor 12, south facing"
          />
          <FieldError message={errors.location} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Price (BDT)
            <input
              inputMode="numeric"
              value={input.price || ""}
              onChange={(event) => setInput({ ...input, price: Number(event.target.value) })}
              className={`${fieldClass} mt-1.5`}
              placeholder="8500000"
            />
            <FieldError message={errors.price} />
          </label>
          <label className="block text-sm font-medium">
            Status
            <select
              value={input.status}
              onChange={(event) => setStatus(event.target.value as UnitStatus)}
              className={`${fieldClass} mt-1.5`}
            >
              {unitStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="rounded-2xl border border-[#e6ebef] p-4">
          <legend className="px-1 text-sm font-semibold">Booking, buyer, and sale</legend>
          <p className="text-xs leading-5 text-muted-foreground">
            These stay on the unit. The Buyers and Sales screens are still coming soon, so the link
            is saved here until those records exist.
          </p>
          {input.status === "available" ? (
            <p className="mt-3 text-sm text-[#5c6b76]">
              Available units are not linked to a booking, buyer, or sale.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {showBooking ? (
                <>
                  <label className="block text-sm font-medium">
                    Booking
                    <input
                      value={input.bookingLabel}
                      onChange={(event) => setInput({ ...input, bookingLabel: event.target.value })}
                      className={`${fieldClass} mt-1.5`}
                      placeholder="Booking reference or name"
                    />
                    <FieldError message={errors.bookingLabel} />
                  </label>
                  <label className="block text-sm font-medium">
                    Buyer
                    <input
                      value={input.buyerLabel}
                      onChange={(event) => setInput({ ...input, buyerLabel: event.target.value })}
                      className={`${fieldClass} mt-1.5`}
                      placeholder="Buyer name"
                    />
                    <FieldError message={errors.buyerLabel} />
                  </label>
                </>
              ) : null}
              {showSale ? (
                <label className="block text-sm font-medium">
                  Sale
                  <input
                    value={input.saleLabel}
                    onChange={(event) => setInput({ ...input, saleLabel: event.target.value })}
                    className={`${fieldClass} mt-1.5`}
                    placeholder="Sale reference"
                  />
                  <FieldError message={errors.saleLabel} />
                </label>
              ) : null}
            </div>
          )}
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{unit ? "Save changes" : "Add unit"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
