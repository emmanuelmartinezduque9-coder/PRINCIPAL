#!/bin/zsh
export UV_CACHE_DIR=$HOME/Library/Caches/uv-principal COPYFILE_DISABLE=1
cd ~/.principal-tools/montador
for id in "$@"; do
  echo "=== $id $(date +%T)"
  ~/.local/bin/uv run --no-project --with librosa --with soundfile --with numpy python montador.py planes/$id.json --sobrescribir > /Volumes/T7/PRINCIPAL/pedido-54/trabajo/v1/$id.log 2>&1
  echo "=== fin $id rc=$? $(date +%T)"
done
