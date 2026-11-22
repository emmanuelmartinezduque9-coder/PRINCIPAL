#!/bin/bash
# Instala (o actualiza) el agente del Mac de PRINCIPAL y lo deja siempre encendido.
#
#   bash agente-mac/instalar.sh
#
# Se puede lanzar las veces que haga falta: copia el programa a ~/.principal-tools/agente-mac/,
# escribe ~/Library/LaunchAgents/com.principal.agente.plist con las rutas de este Mac y lo carga
# con launchctl. Nunca enseña la ficha.
#
# La ficha y la dirección de la web van en ~/.principal-agente.json. Si aún no existe, se puede
# crear aquí mismo pasando las dos cosas como variables, sin que queden en pantalla:
#
#   PRINCIPAL_URL="https://…" PRINCIPAL_AGENTE_TOKEN="pra_…" bash agente-mac/instalar.sh
set -euo pipefail

ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$HOME/.principal-tools/agente-mac"
CONFIG="$HOME/.principal-agente.json"
ETIQUETA="com.principal.agente"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
REGISTRO="$HOME/Library/Logs/principal-agente.log"

# node: el de ~/.local/node si está; si no, el que haya en el PATH.
NODE="$HOME/.local/node/bin/node"
if [ ! -x "$NODE" ]; then NODE="$(command -v node || true)"; fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "No se encuentra node. Hace falta Node 22 o más." >&2
  exit 1
fi
VERSION_NODE="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if [ "$VERSION_NODE" -lt 22 ]; then
  echo "Hace falta Node 22 o más; este es el $VERSION_NODE." >&2
  exit 1
fi

# El programa.
mkdir -p "$DESTINO" "$(dirname "$PLIST")" "$(dirname "$REGISTRO")"
cp "$ORIGEN/agente.mjs" "$ORIGEN/lib.mjs" "$ORIGEN/README.md" "$DESTINO/"
echo "Programa copiado a $DESTINO"

# La configuración: se escribe solo si llegan las dos variables; la ficha no se enseña.
if [ -n "${PRINCIPAL_URL:-}" ] && [ -n "${PRINCIPAL_AGENTE_TOKEN:-}" ]; then
  (
    umask 077
    PRINCIPAL_URL="$PRINCIPAL_URL" PRINCIPAL_AGENTE_TOKEN="$PRINCIPAL_AGENTE_TOKEN" "$NODE" -e '
      const fs = require("node:fs");
      const text = JSON.stringify({ url: process.env.PRINCIPAL_URL, token: process.env.PRINCIPAL_AGENTE_TOKEN }, null, 2) + "\n";
      fs.writeFileSync(process.argv[1], text, { mode: 0o600 });
    ' "$CONFIG"
  )
  echo "Configuración guardada en $CONFIG"
fi
if [ -f "$CONFIG" ]; then
  chmod 600 "$CONFIG"
else
  echo "Falta $CONFIG con la dirección de la web y la ficha (ver README.md)."
  echo "El agente queda instalado y empezará a funcionar en cuanto exista."
fi

# launchd: rutas completas, sin ~ ni PATH del terminal.
escapar() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }
sed -e "s|__HOME__|$(escapar "$HOME")|g" -e "s|__NODE__|$(escapar "$NODE")|g" "$ORIGEN/com.principal.agente.plist" > "$PLIST"
echo "Arranque automático escrito en $PLIST"

# Se descarga el anterior (si lo había), se espera a que termine de irse y se carga el nuevo.
DOMINIO="gui/$(id -u)"
if launchctl print "$DOMINIO/$ETIQUETA" >/dev/null 2>&1; then
  launchctl bootout "$DOMINIO/$ETIQUETA" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    launchctl print "$DOMINIO/$ETIQUETA" >/dev/null 2>&1 || break
    sleep 0.5
  done
fi
launchctl bootstrap "$DOMINIO" "$PLIST"
launchctl kickstart -k "$DOMINIO/$ETIQUETA" >/dev/null 2>&1 || true

echo "Listo: el agente está en marcha y arrancará solo al encender el Mac."
echo "Para ver qué hace:  tail -f \"$REGISTRO\""
echo "Para pararlo:       launchctl bootout $DOMINIO/$ETIQUETA"
