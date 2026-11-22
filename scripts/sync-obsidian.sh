#!/bin/bash
# Copia el conocimiento del repositorio PRINCIPAL a la bóveda de Obsidian (carpeta PRINCIPAL).
# Se ejecuta en el Mac del dueño. Solo escribe dentro de <bóveda>/PRINCIPAL; no toca nada más.
set -euo pipefail
VAULT="${1:-/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/CEREBRO}"
BRANCH="${2:-main}"
WORK="$HOME/.principal-sync/PRINCIPAL"
[ -d "$VAULT/.obsidian" ] || { echo "No encuentro la bóveda de Obsidian en: $VAULT"; exit 1; }
if [ -d "$WORK/.git" ]; then
  git -C "$WORK" fetch -q --depth 1 origin "$BRANCH" && git -C "$WORK" checkout -q -B "$BRANCH" FETCH_HEAD
else
  mkdir -p "$(dirname "$WORK")"
  git clone -q --depth 1 --branch "$BRANCH" https://github.com/emmanuelmartinezduque9-coder/PRINCIPAL.git "$WORK"
fi
DEST="$VAULT/PRINCIPAL"
mkdir -p "$DEST/Casos" "$DEST/Investigación/notas" "$DEST/Diseño"
rsync -a --delete "$WORK/docs/casos/" "$DEST/Casos/"
rsync -a --delete "$WORK/docs/research_notes/" "$DEST/Investigación/notas/"
rsync -a "$WORK/docs/reports/" "$DEST/Investigación/"
rsync -a "$WORK/docs/superpowers/specs/" "$DEST/Diseño/"
for f in decisiones-base-plataforma.md skills-instaladas.md despliegue-railway.md; do
  [ -f "$WORK/docs/$f" ] && cp "$WORK/docs/$f" "$DEST/Diseño/$f"
done
cp "$WORK/docs/cerebro/00 - Inicio.md" "$DEST/00 - Inicio.md"
echo "Copiado a $DEST ($(find "$DEST" -name '*.md' | wc -l | tr -d ' ') notas) desde la rama $BRANCH"
