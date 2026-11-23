# Montador (v1)

> **Desde el 23/11/2026 corre en la nube** (proceso en segundo plano de Railway, `src/server/videos/montaje-nube.ts`;
> imagen en `Dockerfile`, dependencias en `requirements.txt`). Los rótulos los dibuja `texto06b.py` (HarfBuzz + FreeType,
> igual que `texto06b.swift`, que queda como referencia; comparación en `test_texto06b.py` con `referencias-06b/`).
> Decisiones: `docs/decisiones-almacen-y-montaje-nube.md`.

Programa pequeño que monta los vídeos del dueño a partir de un **plan de montaje** (un JSON por vídeo).
Se escribió para el piloto del pedido 54: v0 en `docs/piloto-pedido-54/montaje-v0.md`; **v1 (ritmo de los virales)
en `docs/piloto-pedido-54/montaje-v1.md`**, con el patrón medido en `docs/casos/referencias-edicion/patron-viral-eiswerk.md`.

## Montaje automático desde la web (`montar_auto.py`, 22/11)

Lo lanza el agente del Mac (1.3.0) para cada vídeo de un lote con los clips hechos:
`uv run --no-project --with librosa --with soundfile --with numpy --with pillow python montar_auto.py <ficha.json> <carpeta>`.
La ficha la hace la web (`src/server/videos/edits.ts`) y el agente le añade las rutas locales de los clips, la canción
y el `breakdown.json` de rea-video de la referencia de edición. Sin preguntar nada: normaliza los clips (1080×1920,
24 fps), gancho con in/out automáticos hasta `hookMs` (sin cola IA), cuerpos y réplicas con las ventanas de v1, drop
al empezar el cuerpo (réplica: al empezar el 2º plano, `product_shown: {"plano": 1}`), sin canción el audio del clip
o silencio (`audio.mode: "silencio"`), rótulos de la ficha, y de la referencia saca el ritmo (`ritmo.body`,
`ritmo.final`) y si el CTA entra en el último o el penúltimo corte. Deja `salida.mp4`, `resultado.json` (con el resumen
de la autocomprobación), `plan.json`, `montador.log` y `revision/`. Pruebas: `python3 -I test_montar_auto.py`.
`montador.py` ganó `CACHE` (dónde guarda `analisis_clips/` y `beatmaps/`; `MONTADOR_CACHE`), el modo de audio
`silencio` y `product_shown.plano`.

## Qué cambia en v1 (22/11)

Los planes con clips `"auto": true` usan el montaje nuevo; los planes v0 (in/out fijos) siguen montándose igual.

1. **Análisis de cada clip** (caché `analisis_clips/<sha16>-<versión>.json`): actividad fotograma a fotograma, cortes y
   saltos internos (umbral local), **cola IA** (el clip acaba en otra imagen, p. ej. la foto del producto: se descarta
   y se deja 0,6 s de margen antes porque el morph empieza antes), colas quietas, trozos < 0,4 s.
2. **In/out automáticos**: en cada tramo usable, 1–4 ventanas con la duración del patrón por sección
   (`PATRON` en `montador.py`: revelado 1,0–1,9 s, cuerpo 0,6–1,5 s, final 1,5–3,0 s), donde hay acción y terminando
   con la acción en marcha. Tantas ventanas como acciones reales quepan (un plano IA con verter + tapar + toppings da
   varias). Nunca se cambia la velocidad.
3. **Gancho**: `in_frame` (~0,1 s antes de la primera palabra) y `reveal_frame` (primer fotograma con la caja visible):
   el corte va `hold_s` después (0,45 s por defecto). La voz puede terminar hasta `max_spill_s` (0,6 s) dentro del
   primer plano del cuerpo para no cortar palabras.
4. **Cortes en beat**: cada plano se alarga/acorta hasta ½ beat (máx. 0,22 s), dentro de su tramo y de su sección,
   para que el corte caiga en un beat de la canción (o del audio original en réplicas). Para acortar se quita primero
   el inicio (preparación), no el final de la acción.
5. **Rótulos**: principal desde 0, CTA en el corte del último plano (o del penúltimo si el último dura < 1,5 s);
   cualquier otro cambio se pega al corte más cercano.
6. **Zooms apagados por defecto** (los virales no usan; el código de v0 sigue disponible con `zoom.enabled`).
7. **Réplicas recortadas con audio original**: el audio suena seguido desde el primer fotograma usado (fundido de
   0,15 s al final).
8. **Autocomprobación** después de exportar: duración de cada plano frente al patrón, cola quieta o salto/imagen nueva
   en los últimos 0,5 s de cada plano, cortes no previstos, rótulos fuera de corte/beat. Si hay algo arreglable, veta
   esa zona y vuelve a montar (máx. 2 veces). Escribe en `revision/`: `- autocomprobacion.txt/.json`,
   `- cortes.jpg` (tira de 0,75 s a 8 fps en cada corte), `- contactos.jpg` y `- plan-aplicado.json`.

Plan v1 (ejemplo, ver `planes_v1.py`):

```json
{"id": "V02-v1", "version": 1, "tipo": "gancho+cuerpo",
 "clips": [{"role": "hook", "path": "…", "in_frame": 11, "reveal_frame": 115, "hold_s": 0.45},
           {"role": "body", "auto": true, "path": "…/209.mp4"},
           {"role": "body", "auto": true, "path": "…/223.mp4"}],
 "audio": {"mode": "cancion", "song": "…", "drop": 7.49, "product_shown": {},
           "voice": {"path": "…", "clip": 0, "from": 0.458, "to": 5.75, "target_lufs": -14, "max_spill_s": 0.6}},
 "texts": [{"role": "main", "text": "…"}, {"role": "cta", "text": "Kommentiere „EisWerk“ …"}],
 "zoom": {"enabled": false}, "ritmo": {"body": [0.6, 1.0, 1.5]}, "output": "… (v1).mp4"}
```

Opciones por clip: `"ventanas": [[in_s, out_s], …]` fija las ventanas a mano; `"ventanas_por_tramo": n` fuerza n.
`product_shown: {}` = drop en el primer fotograma del cuerpo.

Lanzar en el Mac: `~/.principal-tools/montador/montar_v1.sh V02-v1 V01-v1 …` (log en
`/Volumes/T7/PRINCIPAL/pedido-54/trabajo/v1/<id>.log`).

---

Lo que sigue describe v0 (sigue valiendo para los planes sin `auto`).

## Archivos

- `montador.py`: el programa (Python, una sola pieza).
- `texto06b.swift`: dibuja los rótulos con el estilo fijo 06B (TikTokDisplay-Medium, blanco, contorno negro 0,05 em,
  interlínea 35/31 em, caja invisible x112/y287/886×318 sobre 1080×1920). Lo llama `montador.py`.
- `planes.py`, `planes_c.py`: generan los planes v0 del piloto; `planes_v1.py`: los planes v1 (`planes/*-v1.json`).
- `planes/*.json`: los planes del pedido 54.
- `analizar_referencia.py`: mide reels de referencia (cortes, actividad al cortar, tiras por corte, música, texto).
- `resumen_patron.py` y `ritmo_cortes.py`: resumen por planos y test «¿cortan en beat más que por azar?».
- `montar_v1.sh`: lanza planes v1 en el Mac.
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

`audio.mode: "original"` conserva la pista del clip (réplica Genjutsu entera). `audio.mode: "externo"` pone el audio de
otro archivo (`path`, `offset`), sin tocar nivel ni velocidad y recortado o completado con silencio: se usa para las
réplicas regeneradas con Seedance, que llevan el audio original del reel de referencia. `product_shown` también acepta
`{"t": segundos}`.

Cambios de la fase C (22/11): el pico de la mezcla se mide con `astats` (antes `volumedetect`, que no ve picos por
encima de 0 dBFS y dejaba saturar la voz subida; afectaba a V12 de la fase B, rehecho como «(r2)»); `planes_c.py`
genera los planes de la fase C; en el Mac hay además `hoja.sh` (hojas de contactos), `separar.py` (voz con HTDemucs) y
`transcribir.py` (comprobar qué dice la voz con mlx_whisper, sin escuchar).

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
