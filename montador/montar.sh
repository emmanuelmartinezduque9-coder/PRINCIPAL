#!/bin/zsh
# Uso: ./montar.sh planes/V03.json [más planes...]   (log en /Volumes/T7/PRINCIPAL/pedido-54/trabajo/montar.log)
export UV_CACHE_DIR=$HOME/Library/Caches/uv-principal COPYFILE_DISABLE=1
cd "$(dirname "$0")"
for plan in "$@"; do
  echo "=== $plan $(date '+%H:%M:%S')"
  $HOME/.local/bin/uv run --no-project --with librosa --with soundfile --with numpy python montador.py "$plan" $EXTRA
  echo "=== fin $plan rc=$? $(date '+%H:%M:%S')"
done
