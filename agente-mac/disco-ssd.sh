#!/bin/bash
# Pasa al SSD externo todo lo que PRINCIPAL guarda en este Mac (orden de Emmanuel, 24/11/2026:
# «todo tiene que quedar en el disco SSD, no en el almacenamiento de mi computador»).
#
# El T7 es exFAT: Postgres no acepta sus permisos y uv se rompe con los archivos «._». Por eso se
# crea una imagen APFS dentro del T7 (/Volumes/T7/PRINCIPAL-DATOS.sparsebundle, crece según haga
# falta, tope 200 GB) que se monta sola en /Volumes/PRINCIPAL-DATOS al iniciar sesión y al
# conectar el T7 (LaunchAgent com.principal.disco). Las carpetas de siempre quedan como enlaces:
#   ~/.principal-tools            → herramientas   (agente, montador, entornos)
#   ~/.principal                  → datos-local    (base de datos de desarrollo)
#   ~/.cache/huggingface          → cache/huggingface (modelos Whisper)
#   ~/.cache/rea-video            → cache/rea-video
#   ~/Library/Caches/uv-principal → cache/uv
#   ~/.local/share/uv             → uv             (Pythons de uv)
#   ~/.npm                        → cache/npm
# y los temporales del agente van a /Volumes/PRINCIPAL-DATOS/tmp (TMPDIR en su plist).
# Sin el T7 conectado el agente no arranca; launchd lo reintenta solo y sigue al conectarlo.
# Se puede repetir: lo que ya está movido no se toca.
set -euo pipefail

IMG=/Volumes/T7/PRINCIPAL-DATOS.sparsebundle
D=/Volumes/PRINCIPAL-DATOS
APOYO="$HOME/Library/Application Support/Principal"
[ -d /Volumes/T7 ] || { echo "Conecta el disco T7 y vuelve a ejecutar esto."; exit 1; }

[ -e "$IMG" ] || hdiutil create -size 200g -type SPARSEBUNDLE -fs APFS -volname PRINCIPAL-DATOS "$IMG" >/dev/null
[ -d "$D" ] || hdiutil attach -nobrowse "$IMG" >/dev/null
mkdir -p "$D/tmp" "$D/agente"

mkdir -p "$APOYO"
cat > "$APOYO/montar-disco.sh" <<'EOF'
#!/bin/bash
# Monta las imágenes APFS del T7: la de datos de PRINCIPAL y la del proyecto (Codex). Si el T7
# parpadea, una imagen puede quedar conectada pero desmontada: entonces `attach` no hace nada,
# así que se suelta y se vuelve a conectar.
montar() {
  local img="$1" carpeta="$2" opciones="$3" dev
  [ -d "$carpeta" ] && return 0
  [ -d "$img" ] || return 0
  dev=$(/usr/bin/hdiutil info | /usr/bin/awk -v img="$img" '$0 ~ "image-path" && index($0, img) {f=1} f && /^\/dev\/disk[0-9]+[ \t]/ {print $1; exit}')
  [ -n "$dev" ] && /usr/bin/hdiutil detach -force "$dev" >/dev/null 2>&1
  /usr/bin/hdiutil attach $opciones "$img" >/dev/null 2>&1
}
montar /Volumes/T7/PRINCIPAL-DATOS.sparsebundle /Volumes/PRINCIPAL-DATOS/agente -nobrowse
montar "/Volumes/T7/Proyecto automatizacion.sparsebundle" "/Volumes/AutomatizacionProyecto/CLAUDE CODE" ""
exit 0
EOF
chmod +x "$APOYO/montar-disco.sh"
PLIST_DISCO="$HOME/Library/LaunchAgents/com.principal.disco.plist"
if ! grep -q StartInterval "$PLIST_DISCO" 2>/dev/null; then
  launchctl bootout "gui/$(id -u)/com.principal.disco" 2>/dev/null || true
  cat > "$PLIST_DISCO" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.principal.disco</string>
  <key>ProgramArguments</key><array><string>$APOYO/montar-disco.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>WatchPaths</key><array><string>/Volumes</string></array>
  <key>StartInterval</key><integer>60</integer>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
EOF
  launchctl bootstrap "gui/$(id -u)" "$PLIST_DISCO"
fi

AGENTE="$HOME/Library/LaunchAgents/com.principal.agente.plist"
[ -f "$AGENTE" ] && launchctl bootout "gui/$(id -u)/com.principal.agente" 2>/dev/null || true

mover() {
  local src="$1" dst="$D/$2"
  [ -L "$src" ] && return 0
  [ -e "$src" ] || return 0
  mkdir -p "$(dirname "$dst")"
  COPYFILE_DISABLE=1 cp -a "$src" "$dst"
  rm -rf "$src"
  ln -s "$dst" "$src"
  echo "Movido: $src"
}
mover "$HOME/.principal-tools" herramientas
mover "$HOME/.principal" datos-local
mover "$HOME/.cache/huggingface" cache/huggingface
mover "$HOME/.cache/rea-video" cache/rea-video
mover "$HOME/Library/Caches/uv-principal" cache/uv
mover "$HOME/.local/share/uv" uv
mover "$HOME/.npm" cache/npm

if [ -f "$AGENTE" ]; then
  /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:TMPDIR $D/tmp/" "$AGENTE" 2>/dev/null ||
    /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:TMPDIR string $D/tmp/" "$AGENTE"
  # bootout termina en segundo plano: se espera a que el agente haya salido antes de cargarlo.
  for _ in $(seq 1 20); do launchctl print "gui/$(id -u)/com.principal.agente" >/dev/null 2>&1 || break; sleep 1; done
  launchctl bootstrap "gui/$(id -u)" "$AGENTE"
fi
echo "Listo: los datos de PRINCIPAL están en el T7 ($D)."
