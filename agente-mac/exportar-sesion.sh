#!/bin/bash
# Guarda la sesión de Instagram del navegador para que el agente del Mac de PRINCIPAL lea perfiles.
#
#   bash agente-mac/exportar-sesion.sh
#
# El agente arranca solo (launchd) y macOS no le deja leer las cookies de los navegadores. Este
# script, lanzado desde el Terminal, copia con yt-dlp las cookies del primer navegador que tenga la
# sesión de Instagram iniciada: Google Chrome (cada uno de sus perfiles) y, si no, Brave. Las deja en
# ~/.principal-agente-instagram.txt, solo legible por ti (los reels se siguen bajando sin sesión).
# No enseña ninguna cookie ni cambia nada de tus cuentas. Repetirlo si Instagram cierra la sesión.
set -euo pipefail
DESTINO="$HOME/.principal-agente-instagram.txt"
RUTA="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
YTDLP="$(PATH="$RUTA" command -v yt-dlp || true)"
[ -n "$YTDLP" ] || { echo "No se encuentra yt-dlp." >&2; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
umask 077

# Navegadores en orden: los perfiles de Chrome que existan y, de reserva, Brave.
FUENTES=()
CHROME_DIR="$HOME/Library/Application Support/Google/Chrome"
if [ -d "$CHROME_DIR" ]; then
  for perfil in "$CHROME_DIR"/Default "$CHROME_DIR"/Profile*; do
    [ -f "$perfil/Cookies" ] && FUENTES+=("chrome:$(basename "$perfil")")
  done
fi
FUENTES+=("brave")

for fuente in "${FUENTES[@]}"; do
  rm -f "$TMP/c.txt"
  # yt-dlp escribe en el archivo todas las cookies que leyó; la descarga en sí da igual.
  "$YTDLP" --ignore-config --cookies-from-browser "$fuente" --cookies "$TMP/c.txt" --skip-download --simulate \
    --use-extractors Instagram "https://www.instagram.com/reel/C0000000000/" >/dev/null 2>&1 || true
  if awk -F'\t' '$1 ~ /instagram\.com/ && $6 == "sessionid" {f=1} END {exit !f}' "$TMP/c.txt" 2>/dev/null; then
    cp "$TMP/c.txt" "$DESTINO"
    chmod 600 "$DESTINO"
    echo "Sesión de Instagram guardada para el agente del Mac (de $fuente)."
    exit 0
  fi
done
echo "Ningún navegador (Chrome ni Brave) tiene la sesión de Instagram iniciada. Entra en instagram.com con Chrome y repite." >&2
exit 1
