# «Traducir el diálogo al alemán» — decisiones (23/11/2026)

Petición de Emmanuel: en un vídeo o en el lote, la opción **«Traducir el diálogo al alemán»**. El montaje separa
la voz de la música, dobla SOLO el diálogo al alemán y deja la canción exactamente igual.

## De dónde sale: copiado de Codex

Lo tenía funcionando en Codex desde el 19/11/2026 (`EDITOR/dialogue_stems.py` + `EDITOR/reference_dubbing.py`,
en el disco «AutomatizacionProyecto», que hoy no está montado; el código se recuperó del historial de Codex).
Prueba real: `/Volumes/T7/AUTOMATIZACION SEGA/Audio/Pruebas/Df5AlGsNWCn/DE` (`final.mp4`).

El método, tal cual:

1. **BandIt v2** (Watcharasupat, Wu y Orife, checkpoint multilingüe `checkpoint-multi.ckpt`, pesos CC BY-SA 4.0;
   https://github.com/kwatcharasupat/bandit-v2) separa el audio en voz (`speech`), música (`music`) y efectos
   (`sfx`), canal a canal, a 48 kHz.
2. Un MP4 con SOLO la voz (`dialogue-only.mp4`) se sube a Higgsfield y se dobla con el modelo **`dubbing`**
   (`target_language: deu`, entrada `input_video`).
3. La voz alemana se mezcla sobre la música y los efectos originales con el mismo filtro
   (`amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.98`), sin cambiar la duración (si el doblaje dura
   más de 0,15 s distinto, no se mezcla).

## Qué cambia respecto a Codex (y por qué)

- **El modelo corre en ONNX** (la conversión de rea-video, `bandit-v2-multi.onnx`, mismos pesos) en vez de
  PyTorch: rea-video ya está en la imagen de Railway con onnxruntime, así que no hace falta meter PyTorch (~1 GB).
  Comprobado con la prueba real de Codex: voz, música y efectos con correlación 0,999 frente a los de Codex, y la
  mezcla final con correlación 0,9997 frente a su `final.mp4`.
- **Va en la imagen**: el modelo (~149 MB) se baja al construir la imagen (`Dockerfile`); si no se puede, se baja
  al primer doblaje.
- **Lo que se dobla es el «Audio original»** (el de la referencia, el que el montaje pone desde 0), y el audio
  mezclado pasa a ser el «Audio original» del montaje. La imagen del `dialogue-only.mp4` es la de la referencia si
  la hay en el disco (como en Codex); si no, negro: de Higgsfield solo se usa el audio.
- **Con canción de la biblioteca** el audio de la referencia no suena, así que no hay diálogo que traducir: se
  monta con la canción y se avisa.

## Dónde está

- `montador/doblar.py` (`separar`, `mezclar`) y sus pruebas `montador/test_doblar.py`.
- `src/server/videos/doblaje.ts`: separar → subir → presupuestar → mirar el saldo → enviar UNA vez → esperar →
  mezclar → guardar en el almacén (`doblajes/<vídeo>/<id>.m4a`). Tabla `dubs`: una fila por vídeo y audio de
  partida; volver a montar reutiliza el doblaje sin pagar otra vez.
- `src/server/videos/montaje-nube.ts`: el paso, antes del montador.
- Conector de Higgsfield: `quoteDubbing` / `submitDubbing` (solo añadidos).
- Opción: `videos.dub_dialogue` (tarjeta; `null` = lo del lote) y `batches.dub_dialogue` (lote). Interruptor
  junto a «Música» en la tarjeta (solo con «Audio original») y en la barra del lote.

## Reglas del flujo automático

- Sin botones ni confirmaciones: con la opción puesta, el montaje dobla solo.
- Solo se para con un motivo que solo él puede resolver: **sin saldo**, Higgsfield sin conectar, o un envío del
  que **no se sabe si llegó** (no se repite solo porque cuesta; si vuelve a montar, se intenta otra vez).
- Si Higgsfield tarda, el montaje vuelve a la cola (sin gastar intento) y recoge el mismo trabajo; a la hora,
  se da por fallido.

## Coste

Higgsfield `dubbing`: **66 créditos por 12 s** en la prueba real de Codex (~5,5 créditos por segundo de vídeo).
BandIt v2 y la mezcla son gratis (CPU de Railway, ~15–60 s por vídeo).

## Pendiente / mejoras

- El presupuesto del lote aún no cuenta el doblaje (solo imagen + clip); sí se mira el saldo antes de enviar.
- En Codex (pedido 81, V6) una vez quedó diálogo inglés dentro de `music.wav` y el doblaje tradujo letras de la
  canción: BandIt no es perfecto cuando la canción tiene voces encima del diálogo.
- El doblaje no sincroniza labios con nuestro clip (Higgsfield sincroniza con el vídeo que recibe, que es la
  referencia); para un avatar hablando haría falta un lipsync aparte.
