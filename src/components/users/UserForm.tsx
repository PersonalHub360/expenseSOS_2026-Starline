import { type FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { AccessRole } from "@/lib/roles";

export function UserForm({
  roles,
  onClose,
  onSaved,
}: {
  roles: AccessRole[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setPending(true);
    setError("");
    const result = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({ username, email, password, roleId }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved("User added.");
  }

  return (
    <Dialog title="Add user" onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <p className="text-sm text-[#5c6b76]">The password is stored hashed. It is never shown again.</p>
        <label className="text-sm font-medium">
          Username
          <input className={`${fieldClass} mt-1.5`} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" required />
        </label>
        <label className="text-sm font-medium">
          Email
          <input className={`${fieldClass} mt-1.5`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" required />
        </label>
        <label className="text-sm font-medium">
          Role
          <select className={`${fieldClass} mt-1.5`} value={roleId} onChange={(event) => setRoleId(event.target.value)} required>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Password
            <input className={`${fieldClass} mt-1.5`} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} required />
          </label>
          <label className="text-sm font-medium">
            Confirm password
            <input className={`${fieldClass} mt-1.5`} type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" minLength={12} required />
          </label>
        </div>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || roles.length === 0}>
            {pending ? "Saving…" : "Add user"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
