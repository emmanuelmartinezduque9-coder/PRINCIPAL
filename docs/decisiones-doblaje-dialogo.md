# «Traducir el diálogo al alemán» — decisiones (23/11/2026; por defecto desde el 24/11/2026)

> **24/11/2026, orden del dueño:** el doblaje va POR DEFECTO, sin interruptor en el lote (se quitó). Todo vídeo cuya
> referencia tenga diálogo en otro idioma se dobla al idioma del producto (`products.language`: `de` → `deu`,
> `it` → `ita`…). Al separar la voz, Whisper (`faster-whisper`, modelo `base`, en la imagen) dice si hay diálogo
> (texto con detector de voz y probabilidad de idioma ≥ 0,5; si no, suele ser la letra de la canción) y en qué idioma:
> sin diálogo o ya en el idioma del anuncio, no se sube nada ni se gasta (fila `dubs` en `skipped`, que no se vuelve a
> mirar). Si la voz no se puede separar, se monta con el audio original y un aviso. Solo se apaga desde la tarjeta
> («Doblar el diálogo», discreto). Los vídeos de lote ya montados desde el 23/11 con «Audio original» se volvieron a
> montar una vez al publicar (`redubTodaysEdits`, marca `doblaje.relanzado-20261124`). Regla: `reglas/doblaje-del-dialogo.md`.

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

## Que no quede nada en el idioma original (24/11/2026)

El montaje 7 del vídeo 6 (FalterPfote) dejó «Oh mein Gott, look at her wings!»: BandIt había metido ese grito en la
pista de **música** (Whisper lo oía en `music.wav`, no en `speech.wav`), así que no se dobló y volvió a sonar en inglés
al mezclar sobre la música original. Es el mismo fallo que Codex vio en el V6 del pedido 81. Ahora:

1. **Rescate antes de doblar** (`doblar.py separar --destino de`): Whisper escucha las voces aisladas (UVR MDX de
   rea-video) de la música y de los efectos; cada frase en otro idioma (el del diálogo) se amplía con la energía de esas
   voces (hasta 1,2 s por lado, huecos de 0,3 s: Whisper corta tarde las frases pegadas) y esa voz pasa de la música a
   la voz. Con el vídeo 6: «Oh my god! Look at her wings!» entera en la voz y nada hablado en la música.
2. **Comprobación al final** (`doblar.py comprobar`): Whisper transcribe el audio doblado y detecta el idioma frase a
   frase. Lo que siga en el idioma original (probabilidad ≥ 0,6) se vuelve a doblar SOLO ese trozo (`tramo`, con
   margen de 0,25 s) y se injerta en la voz doblada (`injertar`), hasta 2 veces; lo que quede se avisa. El coste del
   trozo se suma al doblaje del vídeo.
3. Los doblajes hechos antes (sin `comprobado` en `dubs.raw`) se rehacen al volver a montar; al publicar, los vídeos con
   uno de esos se vuelven a montar solos una vez (`recheckDubbedEdits`, marca `doblaje.comprobado-20261124`).

## Una canción no se traduce nunca (24/11/2026)

En el lote 6 se doblaron canciones (vídeos 8, 11, 13, 14, 20, 21 y 22): su pista de voz estaba casi vacía y la «voz»
salió de la MÚSICA (Whisper oía la letra en inglés y el rescate la trataba como diálogo). Orden del dueño: se dobla solo
cuando una persona habla; una canción no se traduce nunca; en caso de duda, no. Ahora:

1. La pista no decide: BandIt mete a veces TODO el diálogo en la música (vídeo 22, FalterPfote 5: «Three, two, one,
   let's…» con la voz a −57 dB) y otras veces mete una canción en la voz. Las frases en otro idioma de la voz y de la
   música son `candidatas` (`doblar.py separar`, sin mover nada).
2. Antes de gastar, Claude (Sonnet, `classifySpeech`, con ejemplos: cuenta atrás y exclamaciones = habla; «Last
   Christmas», «Rockin' around the Christmas tree», «All I want for Christmas» = canto) dice frase a frase HABLA, CANTO o
   DUDA con el texto y los datos de Whisper (`no_speech_prob`, `avg_logprob`, duración, pista). Solo se dobla la habla:
   `rescatar` deja en la voz solo las ventanas de habla (la habla de la música pasa a la voz y el canto de la voz vuelve a
   la música, que suena igual). Si Claude no responde o duda: no se dobla. Probado con las frases reales del lote 6:
   los villancicos de 8, 11, 13, 20 y 21 → canto o duda; 22 y 6 → habla.
3. La comprobación final solo mira dentro de las ventanas del diálogo (fuera suena la canción).
4. Los doblajes y las marcas de «no doblar» de antes (sin `decision: 2`) se vuelven a mirar: doblado y era canción →
   se retira y vuelve el audio original; era habla → se reutiliza sin pagar; marcado «sin diálogo» con habla en la
   música → ahora se dobla. Al publicar, sus vídeos se vuelven a montar una vez (`reclassifyDubbedEdits`, marca
   `doblaje.habla-o-canto-v2-20261124`).
5. «Solo gancho» sin cuerpos elegidos en la tarjeta: el montaje lleva los cuerpos del producto (el vídeo 22 salió solo
   con el gancho porque nadie eligió su cuerpo «bury»).

No hay nada parecido en Codex: allí el doblaje se pedía a mano por vídeo y su V6 tradujo letras de la canción.

## Ningún montaje mudo (24/11/2026)

Sin canción y sin el audio de la referencia guardado, el montaje usa el audio del vídeo de referencia (el de la réplica
o el de edición); si tampoco hay, la canción más reciente de la biblioteca con drop marcado; y lo dice en los avisos.
Revisados los 8 montajes del almacén (lotes del 23/11): todos tienen audio (−16 a −19 dB de media); ninguno salió mudo.
Los clips de Seedance sí son mudos (`generate_audio: false`): un clip descargado tal cual no lleva sonido.

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

Higgsfield `dubbing`: **44 créditos por 12 s** en la prueba real de PRINCIPAL (23/11/2026; 66 en la de Codex del
19/11). Emmanuel autorizó hasta ~66 créditos por vídeo de 12 s, solo cuando se elige la opción. BandIt v2 y la
mezcla son gratis (CPU de Railway, ~15–60 s por vídeo).

## Prueba real (23/11/2026)

`referencias-pedido-54/ref-v1.mp4` (diálogo inglés «Three, two, one. Let's see how this comes out.» sobre música)
→ voz alemana «3, 2, 1, mal sehen wie das wird.» (Whisper: alemán) sobre la música original (al restar la voz
alemana queda la música separada, correlación 0,9994), 12,24 s como el original. 44 créditos (trabajo
`3b769c1f-de86-42d5-8966-8992821ae973`). Archivos para escuchar en
`side-session-notes/local_1e4352e4-…/doblaje-aleman/`.

## Pendiente / mejoras

- El presupuesto del lote aún no cuenta el doblaje (solo imagen + clip); sí se mira el saldo antes de enviar.
- En Codex (pedido 81, V6) una vez quedó diálogo inglés dentro de `music.wav` y el doblaje tradujo letras de la
  canción: BandIt no es perfecto cuando la canción tiene voces encima del diálogo.
- El doblaje no sincroniza labios con nuestro clip (Higgsfield sincroniza con el vídeo que recibe, que es la
  referencia); para un avatar hablando haría falta un lipsync aparte.
