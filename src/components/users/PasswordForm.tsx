import { type FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function PasswordForm({
  userId,
  username,
  onClose,
  onSaved,
}: {
  userId: string;
  username: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
    const result = await api(`/api/users/${userId}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved("Password saved. Use it the next time this account signs in.");
  }

  return (
    <Dialog title="Set password" onClose={onClose}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <p className="text-sm text-[#5c6b76]">
          This is the sign-in password for <span className="font-semibold text-[#16332c]">{username}</span>. It is saved on the account and is not shown again.
        </p>
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
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save password"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
