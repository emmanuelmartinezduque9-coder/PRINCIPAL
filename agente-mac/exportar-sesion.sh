#!/bin/bash
# Guarda la sesión de Instagram de Brave para el agente del Mac de PRINCIPAL.
#
#   bash agente-mac/exportar-sesion.sh
#
# El agente arranca solo (launchd) y macOS no le deja leer las cookies de Brave. Este script, lanzado
# desde el Terminal, las copia (con yt-dlp, que las lee de Brave) a ~/.principal-agente-instagram.txt
# (solo para leer perfiles; los reels se siguen bajando con ~/.principal-agente-cookies.txt),
# solo legible por ti. Hace falta haber entrado en Instagram con Brave. Repetirlo si Instagram cierra
# la sesión. No enseña ninguna cookie.
set -euo pipefail
DESTINO="$HOME/.principal-agente-instagram.txt"
RUTA="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
YTDLP="$(PATH="$RUTA" command -v yt-dlp || true)"
[ -n "$YTDLP" ] || { echo "No se encuentra yt-dlp." >&2; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
umask 077
# yt-dlp escribe en el archivo todas las cookies que leyó de Brave; la descarga en sí da igual.
"$YTDLP" --ignore-config --cookies-from-browser brave --cookies "$TMP/c.txt" --skip-download --simulate \
  --use-extractors Instagram "https://www.instagram.com/reel/C0000000000/" >/dev/null 2>&1 || true
if ! awk -F'\t' '$1 ~ /instagram\.com/ && $6 == "sessionid" {f=1} END {exit !f}' "$TMP/c.txt" 2>/dev/null; then
  echo "Brave no tiene la sesión de Instagram iniciada (o no se pudo leer). Entra en instagram.com con Brave y repite." >&2
  exit 1
fi
cp "$TMP/c.txt" "$DESTINO"
chmod 600 "$DESTINO"
echo "Sesión de Instagram guardada para el agente del Mac."
