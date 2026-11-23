# Edición como la referencia y emojis del iPhone — decisiones (23/11/2026)

Emmanuel vio el montaje del lote «23/11 · EisWerk» (`AUTOMATIZACION SEGA/EisWerk - 01 - 2026-11-23.mp4`) «súper
mal»: rótulo de relleno «EISWERK 😍», emojis de Android y el clip de 13 s recortado a 8,9 s con el patrón genérico
de los virales. Tres órdenes: emojis de iPhone, editar por defecto como el vídeo de referencia de la réplica, y
copiar la lógica de edición de Codex tal cual.

## Lo que hacía Codex (de dónde sale cada regla)

- **Referencia efectiva** (`REGLAS_EDICION/CRITERIOS_OBLIGATORIOS.md` punto 3; `video_edit_policy.py:93-124`): si
  hay enlace de edición, ese; si no, el vídeo de referencia original de la réplica. «Vacío NO significa sin edición».
- **Rótulos** (`Motor/order-preparation/app-116085…-36/post-edit/editorial.py`, `ref-switches.json`): los de la
  referencia, leídos con OCR de Apple Vision a 2 fps, con el fotograma exacto de cada cambio (búsqueda y comprobación
  visual), y adaptados a mano: mismo sentido y tono, marca ajena → la nuestra, emojis del nicho, `|` para el salto de
  línea, traducción española aparte. Siempre en la caja fija 06B (x112/y287/886×318), nunca en la posición de la
  referencia (`TEXTOS_FIJOS_PRODUCTOS_FISICOS_20261031.md`).
- **Réplica completa** (`render-local.py`, `full`): un solo segmento, el clip ENTERO (sin recortar), y cada cambio de
  rótulo en el punto proporcional `round(t × fotogramas / duración de la referencia)`. Las réplicas conservan
  secuencia, tiempos y ritmo de la referencia (aclaración del 15/11).
- **Gancho nuevo + cuerpos**: el CTA no se hereda a ciegas del tiempo de la referencia; va al resultado/último plano.
- **Música**: canción continua desde el primer fotograma, el drop en el revelado o cambio de escena de la referencia.
- **Emojis**: CoreText en el Mac → Apple Color Emoji, en línea y al tamaño del texto.

## Lo que hace ahora PRINCIPAL

- `src/server/videos/intake.ts`: al preparar la referencia, el vídeo ENTERO va al almacén
  (`referencias/<vídeo>/<subida>.mp4`, `videos.reference_storage_key`). Antes solo se guardaban fotogramas y audio.
- `edits.ts`: sin referencia de edición (ni la del vídeo ni la del grupo del lote), la ficha lleva
  `replicaReference`: el archivo del almacén o, en los vídeos de antes de hoy, su enlace (se trae con `link-media`:
  nube y, si no, el Mac).
- `edicion-referencia.ts`: Claude (Sonnet, por `src/llm`, con topes de gasto) mira la referencia a 2 fps con el tiempo
  de cada fotograma y devuelve cada rótulo editorial, desde cuándo, en qué franja de alto y su versión adaptada (las
  reglas de `editorial.py`/`CRITERIOS_OBLIGATORIOS.md`, CTA con la palabra clave del producto). El cambio se afina al
  fotograma exacto buscando, en el medio segundo entre muestras, el fotograma donde más cambia esa franja (lo que
  Codex hacía con la búsqueda binaria). Cortes de la referencia con el filtro de escena de ffmpeg (umbral 0,3,
  ≥ 0,28 s, como el motor de Codex). El resultado se guarda en el almacén (`ediciones/…`): volver a montar no gasta.
- `montador/montar_auto.py`: réplica con rótulos de la referencia → modo de Codex: clip entero (`montador.py` modo
  v0), rótulos en sus tiempos proporcionales en la caja 06B y, con canción, el drop en el primer cambio de plano de la
  referencia. Gancho + cuerpos: el rótulo principal y el CTA de la referencia adaptados; el CTA en el corte del último
  plano (el ritmo de los cuerpos sigue siendo el automático). Si la referencia no tiene rótulos o no se pudo leer,
  el patrón de siempre y un aviso.
- **Emojis del iPhone** (`montador/texto06b.py`): la fuente Apple Color Emoji del Mac está en el almacén
  (`recursos/fuentes/AppleColorEmoji.ttc`, subida con `scripts/subir-fuente.ts --emojis`); el montaje la baja una vez
  y se la pasa al montador (`EMOJI_FONT`). HarfBuzz junta cada emoji como CoreText (uniones ZWJ, tonos de piel,
  banderas → un glifo) y se toma su PNG de 160 px de la tabla `sbix` (la FreeType de `freetype-py` no lee PNG). Mismo
  tamaño y posición medidos contra CoreText (`EMOJI_SCALE_EM`, `EMOJI_CENTER_EM`). Sin la fuente en el almacén: Noto
  (Android) y un aviso en el montaje. La fuente es de Apple: solo se usa para dibujar los rótulos de sus anuncios.

## Prueba real (23/11/2026)

Clip del vídeo del lote (`medios/4efce8e4…`, 13,04 s) con la referencia viral `09 - DdbTolZM_tC` de EisWerk y Claude
de verdad: rótulos «Setz das auf meine Weihnachtswunschliste 🍦🎄🤗» desde 0 y «Kommentiere „EisWerk“, wenn du auch
eins willst! 💕🤗» desde 6,25 s (afinado; coincide con el corte de 6,23 s de la referencia). Montaje: 13,04 s (el clip
entero), CTA en el mismo punto proporcional, caja 06B, emojis de Apple. No se encontró en el disco la referencia
exacta de ese vídeo (no está entre los virales); la comprobación final es «Volver a montar» en la web.

## Límites conocidos

- Claude lee a 2 fps: un rótulo que dure menos de medio segundo puede no verse.
- El instante del cambio se afina por diferencia de píxeles en la franja: un rótulo animado (palabra a palabra) puede
  quedar unos fotogramas antes o después (en Codex esos se corregían a mano).
- La tienda de la referencia se conserva si existe en Alemania; Codex preguntaba en el bloque inicial cuando no
  encajaba. Aquí no se pregunta (regla del flujo sin preguntas); queda en la traducción española para revisarlo.
- Los rótulos que el dueño cambie a mano en la tarjeta no mandan sobre los de la referencia en una réplica.
