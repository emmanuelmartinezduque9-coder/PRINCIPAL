"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard, AuthField } from "@/components/auth/auth-card";

function ActivateForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return <p className="text-sm text-muted-foreground">Este enlace no está completo. Pide uno nuevo.</p>;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("repeat") ?? "")) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "No se pudo activar la cuenta.");
        return;
      }
      // Recarga completa a propósito: la primera pantalla se sirve ya con la sesión.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch {
      setError("No hay conexión con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <AuthField
        label="Contraseña nueva"
        placeholder="Mínimo 10 caracteres"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        autoFocus
      />
      <AuthField label="Repítela" name="repeat" type="password" autoComplete="new-password" minLength={10} required />
      {error ? (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          <p className="flex gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> {error}
          </p>
          {/ya se ha usado|caducado/.test(error) ? (
            // El enlace era para crear la contraseña una vez: la cuenta ya existe y es para siempre.
            <p className="text-muted-foreground">
              Si ya creaste tu contraseña, tu cuenta sigue activa:{" "}
              <a href="/login" className="font-medium text-foreground underline underline-offset-2">
                entra con tu correo y tu contraseña
              </a>
              . Si la olvidaste, pide al dueño un enlace nuevo de contraseña.
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-1 flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-base font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="animate-spin" /> : null}
        Guardar y entrar
      </button>
    </form>
  );
}

export default function ActivatePage() {
  return (
    <AuthCard title="Elige tu contraseña">
      <Suspense>
        <ActivateForm />
      </Suspense>
    </AuthCard>
  );
}
