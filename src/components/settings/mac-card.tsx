"use client";

import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { Check, Copy, KeyRound, Laptop, Loader2, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MAC_KEY, useMac, type MacStatus } from "@/components/videos/use-mac";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Agent = NonNullable<MacStatus["agents"]>[number];

const seenAgo = (iso: string) => `visto hace ${formatDistanceToNowStrict(new Date(iso), { locale: es })}`;

/** La ficha recién creada: se enseña esta única vez, con «Copiar». */
function NewToken({ token, onDone }: { token: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      toast.error("No se pudo copiar. Selecciónala y cópiala a mano.");
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-amber-500/10 p-4 ring-1 ring-amber-500/25" role="status">
      <p className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4 text-amber-600" aria-hidden />
        Cópiala ahora: no se vuelve a enseñar
      </p>
      <div className="flex items-center gap-2">
        <code aria-label="Ficha del Mac" className="min-w-0 flex-1 rounded-md bg-background px-3 py-2 font-mono text-xs break-all ring-1 ring-foreground/10 select-all">
          {token}
        </code>
        <Button className="h-9 shrink-0 gap-1.5 px-3" onClick={() => void copy()}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? "Copiada" : "Copiar"}
        </Button>
      </div>
      <Button variant="ghost" className="h-8 self-end px-3" onClick={onDone}>
        Hecho
      </Button>
    </div>
  );
}

/** Un Mac con ficha en vigor: su nombre, si está conectado y «Revocar». */
function AgentRow({ agent, onRevoke }: { agent: Agent; onRevoke: () => void }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", agent.online ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
        <Laptop className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-medium">{agent.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {/* Si está conectado ya lo dice la cabecera: aquí, con qué yt-dlp; si no, cuándo se le vio. */}
          {agent.lastSeenAt === null ? "Aún sin conectar" : agent.online ? (agent.ytDlp ? `yt-dlp ${agent.ytDlp}` : "Sin yt-dlp") : seenAgo(agent.lastSeenAt)}
        </span>
      </div>
      <Button variant="ghost" className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-destructive" aria-label={`Revocar ${agent.name}`} onClick={onRevoke}>
        <Trash2 data-icon="inline-start" />
        Revocar
      </Button>
    </li>
  );
}

/**
 * Solo el dueño: el Mac que descarga los enlaces pegados. Estado («Conectado · visto hace 20 s» o
 * «Sin conexión»), «Crear ficha» (la ficha se enseña una sola vez, con «Copiar») y «Revocar».
 */
export function MacCard() {
  const client = useQueryClient();
  const { query, data } = useMac({ every: 10_000 });
  const nameId = useId();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Agent | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: MAC_KEY });

  async function create() {
    setCreating(true);
    try {
      const created = await api<{ agentId: number; token: string }>("/api/ajustes/agente", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || "Mac" }),
      });
      setToken(created.token);
      setName("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la ficha.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(agent: Agent) {
    setBusy(true);
    try {
      await api("/api/ajustes/agente", { method: "DELETE", body: JSON.stringify({ agentId: agent.id }) });
      setRevoking(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo revocar.");
    } finally {
      setBusy(false);
    }
  }

  const agents = data?.agents ?? [];
  const online = data?.online === true;

  return (
    <Panel
      title="Mac"
      actions={
        data ? (
          <span className="inline-flex items-center gap-2 text-sm" role="status">
            <span aria-hidden className={cn("size-2 rounded-full", online ? "bg-emerald-500" : "bg-foreground/25")} />
            {online ? "Conectado" : "Sin conexión"}
            {data.lastSeenAt ? <span className="text-muted-foreground">· {seenAgo(data.lastSeenAt)}</span> : null}
          </span>
        ) : null
      }
    >
      {query.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !data ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm">No se pudo leer el estado del Mac. Recarga la página.</p>
      ) : (
        <>
          {agents.length > 0 ? (
            <ul className="-my-2.5 flex flex-col divide-y" aria-label="Mac con ficha">
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} onRevoke={() => setRevoking(agent)} />
              ))}
            </ul>
          ) : null}
          {token ? (
            <NewToken token={token} onDone={() => setToken(null)} />
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <Input
                id={nameId}
                aria-label="Nombre del Mac"
                placeholder="Nombre del Mac"
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
                className="h-9 min-w-0 flex-1"
              />
              <Button type="submit" variant={agents.length === 0 ? "default" : "outline"} className="h-9 shrink-0 gap-1.5 px-3" disabled={creating}>
                {creating ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}
                Crear ficha
              </Button>
            </form>
          )}
        </>
      )}

      <Dialog open={revoking !== null} onOpenChange={(open) => (open ? null : setRevoking(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Revocar {revoking?.name}?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-10 px-4" onClick={() => setRevoking(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" className="h-10 gap-2 px-4" disabled={busy} onClick={() => (revoking ? void revoke(revoking) : undefined)}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              Revocar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
