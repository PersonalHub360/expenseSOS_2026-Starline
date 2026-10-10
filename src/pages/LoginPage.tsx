import { FormEvent, useState } from "react";
import { Building2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";

export function LoginPage() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const message = await login(identifier, password);
    if (message) setError(message);
    setPending(false);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[420px] rounded-[28px] border border-border bg-card p-8 shadow-[0_20px_50px_rgba(14,40,36,0.08)]"
      >
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a9a84] text-white">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Starline Property</p>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          </div>
        </div>

        <label className="mb-4 block text-sm font-medium">
          Username or email
          <input
            name="identifier"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 outline-none ring-[#1a9a84] focus:ring-2"
            required
          />
        </label>
        <label className="mb-4 block text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 outline-none ring-[#1a9a84] focus:ring-2"
            required
          />
        </label>
        {error ? (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
