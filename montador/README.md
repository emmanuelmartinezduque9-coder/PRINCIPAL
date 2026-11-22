# Montador v0

Programa pequeño que monta los vídeos del dueño a partir de un **plan de montaje** (un JSON por vídeo).
Se escribió para el piloto del pedido 54 (ver `docs/piloto-pedido-54/montaje-v0.md`).

## Archivos

- `montador.py`: el programa (Python, una sola pieza).
- `texto06b.swift`: dibuja los rótulos con el estilo fijo 06B (TikTokDisplay-Medium, blanco, contorno negro 0,05 em,
  interlínea 35/31 em, caja invisible x112/y287/886×318 sobre 1080×1920). Lo llama `montador.py`.
- `planes.py`: genera los planes del piloto en `planes/`.
- `planes/*.json`: los planes del pedido 54.
- En el Mac, además, `montar.sh` (lanza uno o varios planes) y `beatmaps/` (mapa de beats guardado por sha256 del audio).

## Cómo se usa (en el Mac)

La copia que se ejecuta está en `~/.principal-tools/montador/`.

```sh
cd ~/.principal-tools/montador
./montar.sh planes/V12.json planes/V12-zoom.json
# o directamente:
export UV_CACHE_DIR=$HOME/Library/Caches/uv-principal COPYFILE_DISABLE=1
uv run --no-project --with librosa --with soundfile --with numpy python montador.py planes/V12.json
```

Usa `~/.local/bin/ffmpeg` y `ffprobe`. No sobrescribe un vídeo que ya existe (salvo con `--sobrescribir`).
Nunca crea entornos virtuales en el T7: `uv` guarda su caché en `~/Library/Caches/uv-principal`.

## Qué hace

1. Lee el plan y comprueba velocidades: solo el gancho (`role: hook`) puede acelerarse, como mucho 1,12×; cuerpos y réplicas a 1×.
   La aceleración se hace quitando fotogramas repartidos, y se guarda qué fotogramas se quitaron.
2. Analiza los beats con librosa (la canción elegida o, en réplicas, el audio original) y guarda el mapa en `beatmaps/`.
3. Con canción: **inicio de la canción = drop guardado − momento en que se enseña el producto**. La canción suena desde el
   primer fotograma, seguida, a volumen constante, sin ducking; solo se aplica una ganancia global para que el pico no pase de 0,94.
   La voz del gancho (pista separada) se nivela a −14 LUFS y lleva la misma velocidad que el gancho. Nunca se alarga el gancho.
4. Ajuste de cortes a beats: solo en clips marcados `snap_out: true`, solo recortando (tolerancia `snap_tolerance`, 0,08 s) y
   nunca en el corte que sostiene el drop. Cuerpos y réplicas no se tocan: el ritmo lo ponen los mini-zooms.
5. Mini-zooms (apagados por defecto; en réplicas hace falta además `allow_on_replica: true`): acercamientos suaves de 4–7 %
   que arrancan en un corte, en el drop o en el primer beat de un compás, suben en 0,12 s y vuelven despacio (coseno) antes
   del siguiente corte. No arrancan en los 0,6 s siguientes a la aparición de un rótulo ni mientras hay un rótulo largo
   (> 70 caracteres). El zoom se aplica solo a la imagen; los rótulos se ponen encima y no se mueven.
6. Rótulos 06B con los tiempos del plan (salto de línea automático a 34 caracteres, o `\n`).
7. Exporta como el pedido 81: H.264 High 1080×1920 24 fps CRF 18, AAC 192 kb/s 44,1 kHz (en réplicas con audio original,
   la pista se copia tal cual).
8. Escribe en `revision/` junto al vídeo: `<nombre> - plan-aplicado.json` (cada corte, velocidad, fotogramas quitados,
   zoom, rótulo, desfase de audio y comprobaciones) y `<nombre> - contactos.jpg` (un fotograma cada 0,5 s).

## Formato del plan (resumen)

```json
{
  "id": "V12", "tipo": "gancho+cuerpo | replica",
  "clips": [
    {"role": "hook", "path": "…/final_1080p.mp4", "in_frame": 0, "out_frame": 145, "out_frames": 130, "snap_out": false},
    {"role": "body", "path": "…/final_1080p.mp4"}
  ],
  "audio": {"mode": "cancion", "song": "…/a081….mp3", "drop": 9.32,
            "product_shown": {"clip": 1, "frame": 0},
            "voice": {"path": "…/voice-demucs.wav", "clip": 0, "from": 0, "to": 4.95, "target_lufs": -14},
            "music_gain_db": 0, "peak_limit": 0.94},
  "texts": [{"start": 0, "end": 11.29, "text": "LIDL × FALTERPFOTE 😳🦋"}, {"start": 11.29, "end": null, "text": "…"}],
  "zoom": {"enabled": true, "amounts": [1.04, 1.06], "drop_amount": 1.07, "release": 0.9, "min_gap": 1.6},
  "output": "…/12 - FalterPfote - DE.mp4", "notas": ["…"], "avisos": ["…"]
}
```

`audio.mode: "original"` conserva la pista del clip (réplica Genjutsu entera). `product_shown` también acepta `{"t": segundos}`.

## Límites de v0

- Con audio original solo admite un clip entero (réplica fiel).
- Los beats son automáticos (librosa); el drop sí es el marcador humano guardado.
- No escucha: las comprobaciones de audio son numéricas (duración, desfase, picos, LUFS de la voz).
- Sin interfaz; sin descripciones (`Beschreibung`).

## Analizar un vídeo de referencia (`analizar_referencia.py`)

Mide el montaje de un reel/TikTok de referencia para imitar su estilo: cortes (detector de escena de ffmpeg, umbral
0,20 por defecto), duración de planos, ritmo por tramos, tempo/beats/compases/drop (librosa), distancia de cada corte
al beat (con el % que saldría por azar; con `--bpm` se mide contra una rejilla fija anclada en el drop, porque
el tempo de librosa a veces sale mal), zooms y movimiento dentro de cada plano (opencv), y opcionalmente hojas de
contactos a 4 fps, texto en pantalla (Vision de macOS) y transcripción (mlx_whisper). Escribe `<id>.analisis.json`
junto al vídeo; si al lado está el `<id>.info.json` de yt-dlp, añade vistas/likes/caption/fecha.

```sh
export UV_CACHE_DIR=$HOME/Library/Caches/uv-principal COPYFILE_DISABLE=1
uv run --no-project --with librosa --with soundfile --with numpy --with opencv-python-headless \
    python analizar_referencia.py /ruta/*.mp4 --hojas --ocr --voz
```

Los números no bastan: mirar siempre las hojas de contactos (un «corte» puede ser un flash o un barrido de cámara, y el
beat de librosa puede ir desfasado). Primer uso: ver `docs/casos/referencias-edicion/wearheelit.md`.
