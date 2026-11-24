#!/bin/bash
# Instala (o actualiza) el agente del Mac de PRINCIPAL y lo deja siempre encendido.
#
#   bash agente-mac/instalar.sh
#
# Se puede lanzar las veces que haga falta: comprueba que node, yt-dlp y ffmpeg están donde el
# arranque automático los va a buscar, copia el programa a ~/.principal-tools/agente-mac/, escribe
# ~/Library/LaunchAgents/com.principal.agente.plist con las rutas de este Mac y lo carga con
# launchctl.
#
# La ficha y la dirección de la web van en ~/.principal-agente.json. Si aún no existe, el
# instalador pide la ficha: se pega y no se ve en pantalla. Nunca la enseña ni la deja en el
# historial del terminal.
set -euo pipefail

ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$HOME/.principal-tools/agente-mac"
CONFIG="$HOME/.principal-agente.json"
ETIQUETA="com.principal.agente"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
REGISTRO="$HOME/Library/Logs/principal-agente.log"
WEB_POR_DEFECTO="https://principal-production-6265bcf2.up.railway.app"

# Donde el arranque automático busca los programas (launchd no usa el PATH del terminal).
RUTA="$HOME/.local/bin:$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
buscar() { PATH="$RUTA" command -v "$1" 2>/dev/null || true; }

# 1. Lo que hace falta, con esa misma ruta. Si falta algo, no se instala nada.
NODE="$(buscar node)"
FALTA=""
for programa in node yt-dlp ffmpeg; do
  if [ -z "$(buscar "$programa")" ]; then FALTA="$FALTA $programa"; fi
done
if [ -n "$FALTA" ]; then
  echo "No se encuentra:$FALTA" >&2
  echo "El agente los busca en: $RUTA" >&2
  echo "Instálalos (o enlázalos) en una de esas carpetas y vuelve a lanzar este instalador." >&2
  exit 1
fi
VERSION_NODE="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if [ "$VERSION_NODE" -lt 22 ]; then
  echo "Hace falta Node 22 o más; el de $NODE es el $VERSION_NODE." >&2
  exit 1
fi

# 2. La configuración. La que ya hay se respeta. Si no hay, la ficha se toma de las variables
#    (PRINCIPAL_URL y PRINCIPAL_AGENTE_TOKEN) o se pide aquí, sin que se vea al pegarla.
if [ ! -f "$CONFIG" ]; then
  WEB="${PRINCIPAL_URL:-}"
  FICHA="${PRINCIPAL_AGENTE_TOKEN:-}"
  if [ -z "$FICHA" ]; then
    if [ -t 0 ]; then
      if [ -z "$WEB" ]; then
        read -r -p "Dirección de la web [$WEB_POR_DEFECTO]: " WEB || true
      fi
      read -r -s -p "Pega la ficha del Mac (Ajustes → Mac → Crear ficha) y pulsa Intro: " FICHA || true
      echo
    else
      # Sin terminal (lanzado por otro programa): la ficha puede llegar por la entrada.
      read -r -s FICHA || true
    fi
  fi
  WEB="${WEB:-$WEB_POR_DEFECTO}"
  if [ -n "$FICHA" ]; then
    case "$FICHA" in
      pra_*) ;;
      *) echo "Eso no parece una ficha de PRINCIPAL (empiezan por «pra_»). No se ha guardado nada." >&2; exit 1 ;;
    esac
    if [ "${#FICHA}" -ne 47 ]; then
      echo "La ficha está incompleta o le sobra algo (tiene que medir 47 caracteres). No se ha guardado nada." >&2
      exit 1
    fi
    (
      umask 077
      PRINCIPAL_URL="$WEB" PRINCIPAL_AGENTE_TOKEN="$FICHA" "$NODE" -e '
        const fs = require("node:fs");
        const text = JSON.stringify({ url: process.env.PRINCIPAL_URL, token: process.env.PRINCIPAL_AGENTE_TOKEN }, null, 2) + "\n";
        fs.writeFileSync(process.argv[1], text, { mode: 0o600 });
      ' "$CONFIG"
    )
    echo "Configuración guardada en $CONFIG"
  fi
  unset FICHA
fi
if [ -f "$CONFIG" ]; then
  chmod 600 "$CONFIG"
else
  echo "Falta $CONFIG con la dirección de la web y la ficha (ver README.md)."
  echo "El agente queda instalado y empezará a funcionar en cuanto exista."
fi

# 3. El programa.
mkdir -p "$DESTINO" "$(dirname "$PLIST")" "$(dirname "$REGISTRO")"
cp "$ORIGEN/agente.mjs" "$ORIGEN/lib.mjs" "$ORIGEN/perfil.mjs" "$ORIGEN/datos.mjs" "$ORIGEN/claude.mjs" "$ORIGEN/conectar-claude.sh" "$ORIGEN/README.md" "$DESTINO/"
echo "Programa copiado a $DESTINO"

# 4. launchd: rutas completas, sin ~ ni PATH del terminal.
escapar() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }
sed -e "s|__HOME__|$(escapar "$HOME")|g" -e "s|__NODE__|$(escapar "$NODE")|g" -e "s|__PATH__|$(escapar "$RUTA")|g" "$ORIGEN/com.principal.agente.plist" > "$PLIST"
# Datos de PRINCIPAL en el SSD (docs/datos-en-ssd.md): con la imagen montada, los temporales del
# agente (descargas, carpetas de trabajo de Claude Code) van a ella y no al disco interno.
DATOS_SSD="${PRINCIPAL_DATOS_SSD:-/Volumes/PRINCIPAL-DATOS}"
# PlistBuddy es de macOS; las pruebas (también en Linux) ponen uno simulado con PRINCIPAL_PLISTBUDDY.
PLISTBUDDY="${PRINCIPAL_PLISTBUDDY:-/usr/libexec/PlistBuddy}"
if [ -d "$DATOS_SSD" ]; then
  mkdir -p "$DATOS_SSD/tmp"
  "$PLISTBUDDY" -c "Set :EnvironmentVariables:TMPDIR $DATOS_SSD/tmp/" "$PLIST" 2>/dev/null ||
    "$PLISTBUDDY" -c "Add :EnvironmentVariables:TMPDIR string $DATOS_SSD/tmp/" "$PLIST"
  echo "Temporales del agente en $DATOS_SSD/tmp/"
fi
echo "Arranque automático escrito en $PLIST"

# 5. Se descarga el anterior (si lo había), se espera a que termine de irse y se carga el nuevo
#    (con RunAtLoad arranca solo: no hace falta empujarlo).
DOMINIO="gui/$(id -u)"
if launchctl print "$DOMINIO/$ETIQUETA" >/dev/null 2>&1; then
  launchctl bootout "$DOMINIO/$ETIQUETA" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    launchctl print "$DOMINIO/$ETIQUETA" >/dev/null 2>&1 || break
    sleep 0.5
  done
fi
launchctl bootstrap "$DOMINIO" "$PLIST"

echo "Listo: el agente está en marcha y arrancará solo al encender el Mac."
if [ ! -f "$HOME/.principal-agente-claude.json" ]; then
  echo "Para que tus lotes usen tu plan de Claude (no la API), lanza una vez:  bash agente-mac/conectar-claude.sh"
fi
echo "Para ver qué hace:  tail -f \"$REGISTRO\""
echo "Para pararlo:       launchctl bootout $DOMINIO/$ETIQUETA"
