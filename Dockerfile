# Imagen de PRINCIPAL en Railway: la web, el proceso en segundo plano y el montaje en la nube.
# - Node 22 para la web (Next.js) y el proceso en segundo plano.
# - ffmpeg para vídeos y miniaturas.
# - Python con el montador (librosa, rótulos 06B con freetype-py + uharfbuzz), rea-video (desglose de la
#   referencia de edición) y yt-dlp (enlaces que la nube alcanza), en /opt/montador.
# - Noto Color Emoji solo de reserva: los emojis del iPhone (Apple Color Emoji) se bajan del almacén al montar.
# La fuente de los rótulos (TikTok Display) NO va en la imagen: se baja del almacén de objetos al montar.
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates git fonts-noto-color-emoji fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

# Python del montador y de rea-video (versión fijada: el commit con el que se probó en el Mac).
ARG REA_VIDEO_COMMIT=a124acd
ENV MONTADOR_PYTHON=/opt/montador/bin/python \
    REA_VIDEO_PYTHON=/opt/montador/bin/python \
    YT_DLP=/opt/montador/bin/yt-dlp \
    REA_VIDEO_MODELS=/opt/rea-models \
    EMOJI_FONT=/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf \
    NUMBA_CACHE_DIR=/tmp/numba \
    MPLCONFIGDIR=/tmp/matplotlib \
    PIP_DISABLE_PIP_VERSION_CHECK=1
COPY montador/requirements.txt /tmp/montador-requirements.txt
RUN python3 -m venv /opt/montador \
  && /opt/montador/bin/pip install --no-cache-dir -r /tmp/montador-requirements.txt \
  && git clone --filter=blob:none https://github.com/JuneYaooo/rea-video /opt/rea-video \
  && git -C /opt/rea-video checkout "$REA_VIDEO_COMMIT" \
  && /opt/montador/bin/pip install --no-cache-dir /opt/rea-video \
  && /opt/montador/bin/python -c "import librosa, freetype, uharfbuzz, rea_video; print('python ok')"
# Modelos de rea-video (separar voz/música, caras) ya dentro de la imagen: si no se pueden bajar ahora,
# rea-video los baja la primera vez que haga falta.
RUN mkdir -p /opt/rea-models && /opt/montador/bin/python -c "\
from rea_video import stems; stems.ensure_model()" || echo 'modelos de rea-video: se bajarán al usarlos'
# BandIt v2 (voz / música / efectos, ~149 MB, ONNX) para «Traducir el diálogo al alemán» (montador/doblar.py,
# copia del método de Codex del 19/11/2026): dentro de la imagen; si no se puede bajar ahora, se baja al primer doblaje.
RUN /opt/montador/bin/python -c "\
from rea_video import effects; effects.ensure_model()" || echo 'BandIt v2: se bajará al primer doblaje'

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
CMD ["npm", "start"]
