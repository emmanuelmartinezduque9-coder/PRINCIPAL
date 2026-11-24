#!/bin/bash
# Conecta el Claude Code de este Mac con tu plan de Claude (Max) para que el agente haga las
# llamadas a Claude de tus lotes sin gastar la API.
#
#   bash agente-mac/conectar-claude.sh
#
# 1. Abre «claude setup-token»: se abre el navegador, entras con tu cuenta de Claude y te da una
#    ficha larga (empieza por «sk-ant-oat»). Es tu suscripción, no la API.
# 2. Pega esa ficha aquí (no se ve al pegarla) y pulsa Intro. Se guarda en
#    ~/.principal-agente-claude.json, que solo puedes leer tú. Nunca va a la web.
# 3. Reinicia el agente para que la use. En Ajustes → Mac pone «Claude Code …».
set -euo pipefail

ARCHIVO="$HOME/.principal-agente-claude.json"
ETIQUETA="com.principal.agente"

ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUTA="$HOME/.local/bin:$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
NODE="$(PATH="$RUTA" command -v node || true)"
if [ -z "$NODE" ]; then echo "Falta node (ver README.md)." >&2; exit 1; fi

# El mismo Claude Code que usará el agente (el más nuevo que haya en este Mac).
CLAUDE=""
while IFS= read -r c; do
  if [ -n "$c" ] && [ -x "$c" ] && "$c" --version >/dev/null 2>&1; then CLAUDE="$c"; break; fi
done < <("$NODE" --input-type=module -e "const { claudeCandidates } = await import(process.argv[1]); console.log(claudeCandidates().join('\n'));" "$ORIGEN/claude.mjs")
if [ -z "$CLAUDE" ]; then
  echo "No encuentro Claude Code en este Mac. Instálalo (o abre la app de Claude con «Code») y vuelve a lanzar esto." >&2
  exit 1
fi
echo "Claude Code: $("$CLAUDE" --version)"

limpiar() {
  # La ficha limpia (si se pegó la misma varias veces, una sola) o el motivo por el que no vale.
  PRINCIPAL_PEGADO="$1" "$NODE" --input-type=module -e '
    const { cleanClaudeToken } = await import(process.argv[1]);
    const r = cleanClaudeToken(process.env.PRINCIPAL_PEGADO);
    if (r.token) process.stdout.write(r.token); else { process.stderr.write(r.error + "\n"); process.exit(1); }
  ' "$ORIGEN/claude.mjs"
}

FICHA=""
if [ -t 0 ]; then
  echo
  echo "Ahora se abre el navegador: entra con tu cuenta de Claude (la del plan Max)."
  echo "Al terminar, copia la ficha que aparece (empieza por «sk-ant-oat»)."
  echo
  mkdir -p "$HOME/.principal-tools/claude-config"
  CLAUDE_CONFIG_DIR="$HOME/.principal-tools/claude-config" env -u ANTHROPIC_API_KEY "$CLAUDE" setup-token || true
  echo
  for intento in 1 2 3 4 5; do
    PEGADO=""
    read -r -s -p "Pega aquí la ficha de Claude (una sola vez) y pulsa Intro: " PEGADO || true
    echo
    if FICHA="$(limpiar "$PEGADO")"; then break; fi
    FICHA=""
    echo "Vuelve a pegarla." >&2
  done
  unset PEGADO
else
  read -r -s PEGADO || true
  FICHA="$(limpiar "${PEGADO:-}")" || FICHA=""
  unset PEGADO
fi
if [ -z "$FICHA" ]; then
  echo "No se ha guardado nada." >&2
  exit 1
fi

(
  umask 077
  PRINCIPAL_CLAUDE_TOKEN="$FICHA" "$NODE" -e '
    const fs = require("node:fs");
    fs.writeFileSync(process.argv[1], JSON.stringify({ token: process.env.PRINCIPAL_CLAUDE_TOKEN }) + "\n", { mode: 0o600 });
  ' "$ARCHIVO"
)
chmod 600 "$ARCHIVO"
unset FICHA
echo "Guardada en $ARCHIVO"

# Comprobación de verdad: una llamada mínima (Haiku) con esa ficha. `auth status` no la valida.
echo "Comprobando la ficha con una llamada pequeña…"
if MOTIVO="$("$NODE" --input-type=module -e '
    import fs from "node:fs/promises";
    import { spawn } from "node:child_process";
    const { checkClaude } = await import(process.argv[1]);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const r = await checkClaude({ fs, spawn, sleep }, process.env, { verify: true });
    if (r.bin) process.exit(0);
    process.stdout.write(r.reason); process.exit(1);
  ' "$ORIGEN/claude.mjs" 2>/dev/null)"; then
  echo "Claude Code responde con tu plan."
else
  echo "Aviso: la ficha no vale ($MOTIVO). Vuelve a lanzar esto y pega la ficha nueva." >&2
  exit 1
fi

if launchctl print "gui/$(id -u)/$ETIQUETA" >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/$ETIQUETA" >/dev/null 2>&1 || true
  echo "Agente reiniciado: en un minuto, Ajustes → Mac dirá «Claude Code …»."
else
  echo "El agente no está instalado: lanza «bash agente-mac/instalar.sh»."
fi
