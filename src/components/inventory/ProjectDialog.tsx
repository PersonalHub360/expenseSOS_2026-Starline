import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { useInventory } from "@/context/InventoryContext";
import { validateProject, type ProjectInput } from "@/lib/inventory";

type ProjectDialogProps = {
  onClose: () => void;
  onCreated?: (projectId: string) => void;
};

export function ProjectDialog({ onClose, onCreated }: ProjectDialogProps) {
  const { projects, addProject } = useInventory();
  const [input, setInput] = useState<ProjectInput>({ name: "", location: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectInput, string>>>({});

  const submit = () => {
    const nextErrors = validateProject(input, projects);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const project = addProject(input);
    onCreated?.(project.id);
    onClose();
  };

  return (
    <Dialog title="New project" onClose={onClose}>
      <p className="text-sm leading-6 text-muted-foreground">
        Units are grouped under a project. This only creates the inventory group. Project timelines
        stay in the Projects module, which is still coming soon.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="block text-sm font-medium">
          Project name
          <input
            autoFocus
            value={input.name}
            onChange={(event) => setInput({ ...input, name: event.target.value })}
            className={`${fieldClass} mt-1.5`}
            placeholder="Starline Heights"
          />
          <FieldError message={errors.name} />
        </label>
        <label className="block text-sm font-medium">
          Location
          <input
            value={input.location}
            onChange={(event) => setInput({ ...input, location: event.target.value })}
            className={`${fieldClass} mt-1.5`}
            placeholder="Gulshan, Dhaka"
          />
          <FieldError message={errors.location} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save project</Button>
        </div>
      </form>
    </Dialog>
  );
}
