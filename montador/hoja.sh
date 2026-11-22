#!/bin/zsh
# hoja.sh <video> <salida.jpg> [fps=2] [cols=6] [ancho=270]
# Hoja de contactos con marca de tiempo en cada fotograma.
v="$1"; out="$2"; fps="${3:-2}"; cols="${4:-6}"; w="${5:-270}"
FF=$HOME/.local/bin/ffmpeg; FP=$HOME/.local/bin/ffprobe
d=$($FP -v error -show_entries format=duration -of csv=p=0 "$v")
n=$(python3 -c "import math;print(math.ceil(float('$d')*$fps))")
rows=$(( (n + cols - 1) / cols ))
COPYFILE_DISABLE=1 $FF -v error -y -i "$v" -vf "fps=$fps,scale=$w:-2,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='%{pts\:hms}':x=4:y=4:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=${cols}x${rows}" -frames:v 1 -q:v 4 "$out"
echo "$out dur=$d frames=$n"
