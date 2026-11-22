"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { safeBackPath } from "@/lib/safe-redirect";
import { AuthCard, AuthField } from "@/components/auth/auth-card";

function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "No se pudo iniciar sesión.");
        return;
      }
      // Solo se vuelve a una dirección de esta misma aplicación.
      window.location.assign(safeBackPath(params.get("volver"), window.location.origin));
    } catch {
      setError("No hay conexión con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <AuthField label="Correo" name="email" type="email" autoComplete="username" required autoFocus />
      <AuthField label="Contraseña" name="password" type="password" autoComplete="current-password" required />
      {error ? (
        <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-1 flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-base font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="animate-spin" /> : null}
        Entrar
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Entrar">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
