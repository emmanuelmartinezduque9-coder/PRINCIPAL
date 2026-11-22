# Pedido 54: estado para el piloto del editor con ritmo (fase A, solo estudio)

Fecha del estudio: 22/11/2026. En el Mac no se escribió nada fuera de `/tmp/principal-p54/`, y esa carpeta ya está borrada.
Etiquetas: **[visto]** = comprobado en el Mac, con la ruta indicada. **[inferido]** = deducción mía, sin confirmar.

Rutas abreviadas:
- `ORD` = `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-6852a9fdeb44480983cc86d73a67d471-54`
- `MUS` = `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/NanoBanana/_EDICIONES/music-library` (el volumen está montado [visto])
- `DROPS` = `/Volumes/T7/AUTOMATIZACION SEGA/MUSICA_DROPS/emmanuel/<sha>.json`
- Encargo original (snapshot): `/Users/emmanuelmartinezduque/Library/Application Support/SEGATOM/local-access-state-20261005-1/original-intake/NanoBanana/_LOTES_APP/owners/emmanuel/orders/app-6852a9fdeb44480983cc86d73a67d471-54.json` (`batch.items[]`)
- Requisitos de edición que dejó el motor anterior: `ORD/post-edit/independent-edit-requirements.json`

Todos los clips finales en 1080p están en 1080×1920, a 24 fps y con pista AAC [visto, ffprobe].

---

## 1. Tabla resumen

| V | Cuenta | Tipo de audio (indicación 1 del dueño) | ¿Clips listos? | Referencia | Canción + drop guardado | Textos | Qué falta |
|---|---|---|---|---|---|---|---|
| 1 | EisWerk | **Canción elegida** (gancho 1,2,3 + cuerpo) | **NO**. El gancho original (939a0f58) fue rechazado porque las cajas se ven bajo la tela. La corrección 73c78aac está **completada en Higgsfield, pero no se descargó, no se revisó y no tiene Topaz**. El cuerpo está listo, pero solo en 480p | `ORD/post-edit/reference-v1.mp4` (12,33 s) | nº 2 «navideña1», drop **9,32 s** | Están en el JSON de requisitos; los tiempos hay que recalcularlos | Descargar y revisar la corrección + Topaz. Decidir sobre el defecto del cuerpo (sirope sobre el motor) |
| 2 | EisWerk | **Canción elegida** (gancho + 2 cuerpos) | **NO**. El gancho ad8825df fue rechazado. La corrección ed0559f6 está **completada en Higgsfield, sin descargar ni revisar**. Los cuerpos están listos | `ORD/post-edit/reference-v2.mp4` (17,20 s) | nº 11 «Let It Snow!», drop **7,49 s** | En el JSON de requisitos; tiempos por recalcular | Descargar y revisar la corrección + Topaz |
| 3 | EisWerk | **Genjutsu / audio original** | **SÍ**: Topaz 4bbbe864, 10,04 s | `ORD/sources/2b17f08a3274c05470fa/ref.mp4` | — (generated_original) | Definidos con tiempos exactos | Nada que bloquee. Ya existe una edición antigua sin entregar |
| 4 | EisWerk | **Genjutsu / audio original** | **NO**. Rechazado por un defecto funcional (embudo en el motor). La corrección no se llegó a enviar | `ORD/sources/f50626bb8dc68cc24abd/ref.mp4` | — | Definidos | Regenerar, o que el dueño acepte el clip tal cual |
| 5 | HaarZauber | **Genjutsu / audio original** | **SÍ**: Topaz 53458694, 13,04 s | `ORD/sources/5bb12b89a20240e8a74e/ref.mp4` | — | Definidos | Nada que bloquee. Ya existe una edición antigua sin entregar |
| 6 | HaarZauber | Genjutsu, **pero con canción elegida** (nº 6) | **NO EXISTE VÍDEO**. El frame se generó, pero no se reconcilió (no tiene media_id) y nunca se envió a vídeo | `ORD/sources/c6123c259d27c74276b0/ref.mp4` | nº 6 «Rockin' Around The Christmas Tree», drop **6,94 s** | Hay límites de rótulos visibles en la referencia | Generar el vídeo entero |
| 7 | HaarZauber | **Canción elegida** (gancho de 3,2 s + cuerpo de la biblioteca) | **NO**. El gancho 5505b172 está **completado en Higgsfield, sin descargar ni revisar**. El cuerpo está listo | `ORD/sources/1ff6c1e34f998f40994e/ref.mp4` | nº 3 «navideña2», drop **17,74 s** | Adaptados según la nota del dueño | Descargar y revisar el gancho + Topaz |
| 8 | HaarZauber | **Genjutsu / audio original** | **SÍ**: Topaz 1fe3dcd0, 12,04 s | `ORD/sources/8b271ec8cc98948f3deb/ref.mp4` | — | Definidos | Nada que bloquee. Ya existe una edición antigua sin entregar |
| 9 | FalterPfote | Genjutsu, **pero con canción elegida** (nº 2) | **CASI**. Existe el original en 480p (a6de312d, 11,72 s). El Topaz 66469331 está **completado en Higgsfield, pero no se descargó** | `ORD/sources/b92fd14294cdc0b11d5d/ref.mp4` | nº 2 «navideña1», drop **9,32 s** | 1 rótulo durante todo el vídeo | Descargar el Topaz y decidir el tipo de audio |
| 10 | FalterPfote | **Genjutsu / audio original** | **NO**. Rechazado: lleva quemados los rótulos originales («Die Idee / Vs / Das Resultat») | `ORD/sources/aedf420c345da037ec11/ref.mp4` | — | Definidos | Regenerar. Está prohibido taparlos con paneles |
| 11 | FalterPfote | **Genjutsu / audio original** | **NO**. Rechazado: rótulos quemados y falta el coche que se acerca | `ORD/sources/a9d0b013e3e9164770b8/ref.mp4` | — | Definidos | Regenerar |
| 12 | FalterPfote | **Canción elegida** (gancho 1,2,3 + cuerpo) | **SÍ**: gancho Topaz 4d20b781 (6,08 s) + cuerpo de 9,38 s | `ORD/post-edit/reference-v12.mp4` (es el mismo archivo que la referencia de V1) | nº 2 «navideña1», drop **9,32 s** | Definidos | Nada que bloquee. Ya existe una edición antigua sin entregar |

**Listos para editar tal cual: 4 (V3, V5, V8, V12).** V9 también queda listo en cuanto se descargue su Topaz, que ya está completado (o si se edita el de 480p).

**Descubrimiento importante [visto en Higgsfield, `show_generations`]:** cuatro trabajos que en el Mac seguían como `waiting`/`in_progress` en realidad están **completados** en el proveedor y nunca se descargaron:
- 73c78aac (corrección de V1)
- ed0559f6 (corrección de V2)
- 5505b172 (gancho de V7)
- 66469331 (Topaz de V9)

Nadie los ha revisado todavía. En los recibos del Mac, la última comprobación fue del 21/11 hacia las 18:48–18:55 (`ORD/EDITOR/video_recibos/<job>.json`, campos `state` y `provider_status`).

---

## 2. Detalle por vídeo

Datos comunes a todos los vídeos:
- Requisitos que dejó el motor anterior: `ORD/post-edit/independent-edit-requirements.json` (`final_verified:false`).
- Límites de los rótulos en las referencias: `ORD/post-edit/source-overlay-boundaries.json`.
- Ediciones antiguas sin entregar: `ORD/post-edit/final-vN-r1/` (cada una con spec, cut-plan, audio-plan, cues y receipt).

### V1 · EisWerk · item 46dd3bb2… · canción elegida
- **Estructura** [visto, snapshot + JSON de requisitos]: gancho «1,2,3» nuevo (Seedance, concepto C79) seguido del **cuerpo manual** EisWerk C78 clip 1. El cuerpo se conserva entero.
- **Nota literal del dueño:** «en la edicion de referecni adebes adaptarlo a eiswerk con los emojis que tengan que ver y en el cierre del video haces la misma llamada a a la accion de siempre, kommentiere ....»
- **Gancho:**
  - Original: `ORD/NanoBanana/_UPSCALE/939a0f58-1466-46c3-bd33-ace2c1dc1c19/final_1080p.mp4`, 6,08 s [visto].
  - **Rechazado** [visto, `ORD/video-preparation/v1-c1-technical1-rejection.json`]: se ven las cajas rosas bajo la tela a 0,875–1,25 s y a ~3,5 s. Lo he confirmado en la hoja de contactos: también se ven a 0,75–1,25 s y 3,25–3,75 s, y el revelado real está a ~5,5 s.
  - Corrección 73c78aac: completada en Higgsfield, **sin descargar**. Según su prompt [visto]: «Eins» 0,25–0,65 s, «Zwei» 1,0–1,4 s, «Drei» 1,8–2,2 s, frase «Mal sehen, wie es geworden ist» 2,6–4,3 s, retirada de la tela 4,4–4,9 s y caja visible como máximo 1 s. Se generó en 480p: hay que pasarle Topaz.
- **Cuerpo:** `/Volumes/T7/AUTOMATIZACION SEGA/ClipPlayback-20261026/verified-previews/ca938e4a-72e4-4c4a-adb7-a458b6607816.mp4` (copia: `ORD/post-edit/inputs/85f4b903….mp4`). **480×854**, 24 fps, 10,08 s [visto].
  - Secuencia: helado ya hecho (0–0,7 s) → sacarlo de la nevera (1–1,5 s) → leche (2 s) → tapa (3–4,5 s) → sirope (6–7 s) → servir (7,5 s en adelante) [visto, hoja de contactos].
  - **Defecto ya conocido** [visto, `manual-body-boundary-review.json`]: hacia los 6 s el sirope cae sobre la tapa del motor. Fue elección manual del dueño; no se ha sustituido.
- **Referencia:** `ORD/post-edit/reference-v1.mp4`, 12,33 s, 30 fps.
  - Cortes aproximados (hoja a 2 fps, ±0,5 s) [visto]: revelado ~3,4 s, entrada del cuerpo ~3,9 s, y después ~4,9 / ~6,4 / ~8,0 / ~9,6 / ~10,6 / ~11,0 s.
  - El rótulo cambia a CTA a ~6,5–7 s.
- **Canción:** `MUS/a081c8089a0db17b330662177577c98e88efb958365758213895fd4a01bd47cf.mp3` (también copiada en `ORD/post-edit/inputs/`). Drop **9,32 s**, marcador humano (`DROPS/a081c808….json`, rev 1, `final_audio_verified:false`). La tarjeta indica start 2,53, pero el JSON de requisitos dice que eso no es motivo para alargar el gancho.
- **Producto mostrado (indicación 2):** las cajas se ven en el revelado del clip 1 (~4,9 s en la corrección planificada [inferido]). La máquina aparece **en el frame 0 del cuerpo** (clip 2) [visto].
- **Textos** (alemán, del JSON de requisitos; los tiempos son de muestreo y no exactos):
  - 0–6 s: «STARBUCKS × EISWERK 😳🍦»
  - 7 s–final: «Kommentiere „EisWerk“, wenn du auch eine willst! 🤩🍦»
  - El CTA va sobre el resultado del cuerpo, en los últimos 3–4 s.

### V2 · EisWerk · item 44e0e6b7… · canción elegida
- **Estructura** [visto]: gancho «1,2,3» nuevo (C80, cocina, con tela rosa EisWerk) → **cuerpo 209/2** (unboxing, 3,04 s) → **cuerpo 223/1** (nevera, leche, tapa, toppings, salsa, servir; 11,04 s). Hay que respetar este orden.
- **Nota del dueño:** fondo de cocina tomado de la imagen de referencia y trapo rosa con la marca EisWerk.
- **Gancho:**
  - Original: `ORD/NanoBanana/_UPSCALE/ad8825df-b3c9-4376-9d81-c5202d2c46f8/final_1080p.mp4`, 6,08 s. **Rechazado** por el mismo problema de ocultación (`v2-c1-technical1-rejection.json`).
  - Corrección ed0559f6: completada en Higgsfield, **sin descargar**. Tiempos según el prompt: iguales que en V1, retirada de la tela a 4,4–4,9 s [visto].
- **Cuerpos:**
  - `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-63a7c753a6f44022b7651b6f713fb348-37/NanoBanana/_UPSCALE/6e211d6a-3c31-4f7f-9eeb-46484560abc1/final_1080p.mp4`: 1080p, 3,04 s. Tiene un corte interno a ~2,25 s (de la caja a sostener la máquina) [visto].
  - `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-4b5cc5f0692f415dbacdd02be33a328c-46/NanoBanana/_UPSCALE/6f1ab6b3-f975-40ce-9081-788216661577/final_1080p.mp4`: 1080p, 11,04 s. Cortes a ~2,0 / ~3,0 / ~4,0 / ~5,0 / ~6,0 / ~7,5 / ~9,0 s [visto aprox.].
- **Referencia:** `ORD/post-edit/reference-v2.mp4`, 17,20 s.
  - El tirón de la tela es a ~3,6–4,0 s y hay corte al producto a ~4,0 s. Después, cortes a ~6,7 / ~9,5 / ~10,0 / ~11,3 / ~13,3 s [visto aprox.].
  - El CTA empieza a ~13,3 s.
- **Canción:** `MUS/d78f8ec32a6858fa455f0834261796d40b81f13e0ee66206cb8810ce0690ecfe.mp3`. Drop **7,49 s** (`DROPS/d78f8ec3….json`), card start 0.
- **Producto mostrado:** la caja aparece en el revelado del gancho. La máquina aparece en el **frame 0 del cuerpo 209** (clip 2) [visto].
- **Textos:**
  - 0–12 s: «Das beste Weihnachtsgeschenk existiert ni– 😲🎁»
  - 13 s–final: «Kommentiere „EisWerk“, wenn du eine haben willst 😊🤗»

### V3 · EisWerk · item 04e6c027… · Genjutsu / audio original
- **Clip:** `ORD/NanoBanana/_UPSCALE/4bbbe864-d1eb-44dd-b977-d632693f47d4/final_1080p.mp4`, 10,04 s, 241 frames [visto]. Es una réplica completa de la referencia (Genjutsu motion control).
- **Secuencia** [visto, JSON de requisitos]: caja en la tienda → leche → tapa → batido → fresas → salsa → servir.
- **Sospecha no confirmada:** salsa a 6,8–7,8 s (`technical-findings-r2.json`). La revisión de la edición antigua no encontró nada bloqueante.
- **Audio:** `music_mode=reference_auto` → `generated_original` (snapshot). Se conserva el audio generado completo.
- **Textos** [visto, exactos]:
  - 0–8,0 s: «Zeig das bloß nicht deiner Freundin 🍦🎄🤫»
  - 8,0–10,04 s: «Kommentiere „EisWerk“, wenn du auch eine brauchst 🍦💕»
- **Edición antigua:** `ORD/post-edit/final-v3-r1/edited.mp4`. Tiene revisión visual independiente sin hallazgos bloqueantes, pero `audio_listened:false`.

### V4 · EisWerk · item 05a2d846… · Genjutsu / audio original
- **Clip:** `ORD/NanoBanana/_UPSCALE/e7e8b21a-9ca2-4cfd-b1cc-27c3d7dbc4c1/final_1080p.mp4`, 14,04 s.
- **Rechazado** [visto, `v4-c1-technical1-rejection.json`]: entre 6 y 8 s, los toppings y el sirope entran por un embudo inventado en la tapa del motor, y el producto real no lo tiene.
- La corrección es el único nodo nuevo de `execution-videos-correction-v4.json` (`v4-c1-technical1-video`), pero **no hay recibo de transporte, es decir, no se envió** [visto].
- **Textos** [visto]:
  - 0–11,33 s: «POV: Du kannst dein eigenes Eis zu Hause machen 😊🍨🎄»
  - 11,33–14,04 s: «Kommentiere „EisWerk“, wenn du auch eine willst! 🎁🍦»

### V5 · HaarZauber · item 1c37a08d… · Genjutsu / audio original
- **Clip:** `ORD/NanoBanana/_UPSCALE/53458694-0be9-4b29-9738-4b4c6c8c01e4/final_1080p.mp4`, 13,04 s.
- **Secuencia:** cepillado lateral en el salón → rizo en la coronilla → rizos traseros → cepillado final.
- **Textos** [visto]:
  - 0–2,63 s: «Als vielbeschäftigte Mama wurde ich zu einer HaarZauber-Vorführung eingeladen.»
  - 2,63–5,07 s: «Ehrlich gesagt hat mir HaarZauber richtig gut gefallen 👜✨»
  - 5,07–7,63 s: «Was meint ihr? Ich habe sie gekauft!»
  - 7,63 s–final: «Kommentiere „HaarZauber“, um deine zu bekommen 🛍️💬👇»
- **Edición antigua:** `ORD/post-edit/final-v5-r1/edited.mp4`.

### V6 · HaarZauber · item ac4740c2… · Genjutsu con canción elegida
- **No hay vídeo** [visto]:
  - `human-all-frames-approved.json` aprueba 11 frames y dice: «frame 6 approval retained separately until upload reconciliation».
  - V6 no figura en ningún `execution-videos*.json`.
  - `frame-preparation/v6-c1-preparation-error.json` registra un FileNotFoundError de `EDITOR/assets.json`.
  - El frame sí existe (`ORD/frames-revision/06-HaarZauber.png`) [visto].
- **Referencia:** 12,53 s, 30 fps. Cortes a ~2,9 / ~6,4 / ~8,4 s [visto aprox.]. El cepillo se ve desde el frame 0.
- **Canción:** `MUS/c2a4dce2916d8d44307fe898aa69145f3fa8e200e3ad5d6ad2fcd067ee54828b.mp3`, drop **6,94 s**, start 0.
- **Textos** [visto, límites medidos en la referencia]:
  - 0–3,07 s: «Als vielbeschäftigte Mama wurde ich zu einer HaarZauber-Vorführung eingeladen.»
  - 3,07–6,4 s: «Ehrlich gesagt hat mir HaarZauber richtig gut gefallen 👜✨»
  - 6,4–8,33 s: «Was meint ihr? Ich habe sie gekauft!»
  - 8,33 s–final: «Kommentiere „HaarZauber“, um deine zu bekommen 🛍️💬👇»

### V7 · HaarZauber · item 55377b1c… · canción elegida
- **Estructura** [visto]: gancho = **exactamente las tres entregas de caja en la tienda** de la referencia (segmento [0, 3,2 s), `ORD/sources/segment-378c75bc67f4b8adc32f/ref.mp4`, regenerado con cajas HaarZauber) → **cuerpo completo** HaarZauber C116 clip 1. No se conserva nada del cuerpo de la impresora original.
- **Nota del dueño:** «el texto adaptalo para que sea toda busy mom necesita esto y en el cierre del video que sea el mismo llamado a la accion de siempre kommentiere...»
- **Gancho:** 5505b172 (Genjutsu motion control), completado en Higgsfield y **sin descargar**. Se generó en 480p según la política del lote [inferido], así que necesita Topaz.
- **Cuerpo:** `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/NanoBanana/_UPSCALE/71696eaa-b5ed-4571-8fc3-b75b8d133c9b/final_1080p.mp4`, 13,04 s.
  - El cepillo rosa está visible desde el frame 0 y en primer plano a 3,5–5 s.
  - Cortes a ~3,0 / ~3,5 / ~5,5 / ~7,0 / ~9,0 / ~10,5 / ~11,2 s [visto aprox.].
- **Referencia:** 13,95 s. Gancho de entregas rápidas con cortes cada ~0,5–0,7 s entre 0 y 3 s; después unboxing (3,0 s), mesa (4,3 s) y nevera con CTA (10,3 s) [visto aprox.].
- **Canción:** `MUS/b06202f2588ad3bebe04ffa1c2f53c6df101844127ef7d31ae7b00dc609a2929.mp3`, drop **17,74 s** (rev 2), card start 14,35.
- **Textos:**
  - 0–9 s: «Jede vielbeschäftigte Mama braucht genau DAS! 🎁😍»
  - 10 s–final: «Kommentiere „HaarZauber“, wenn du auch eine willst! 😇🎄»

### V8 · HaarZauber · item dfe37664… · Genjutsu / audio original
- **Clip:** `ORD/NanoBanana/_UPSCALE/1fe3dcd0-f8f3-42b9-a229-0fe6bd62bb3d/final_1080p.mp4`, 12,04 s.
- **Textos** [visto]: los mismos cuatro que V5, con cortes a 3,0 / 5,21 / 7,83 s.
- **Edición antigua:** `ORD/post-edit/final-v8-r1/edited.mp4`.

### V9 · FalterPfote · item 22e4792b… · Genjutsu (replace object) con canción elegida
- **Original:** `ORD/NanoBanana/FALTERPFOTE/CONCEPTO_1/clip1/_GENERADOS/a6de312d-f064-45fa-84c8-ea1470170995/original.mp4`, **480×854**, 11,72 s.
- **Topaz** 66469331: completado en Higgsfield, pero `ORD/NanoBanana/_UPSCALE/a6de312d…/estado.json` sigue en `processing` y no hay archivo `final_1080p` [visto].
- **Secuencia** [visto, hoja de contactos]:
  - 0–2,9 s: el hombre quita la tela y aparece el perro.
  - 3,0–5,9 s: se abrocha el collar; el collar se ilumina a ~5,5 s.
  - 6,0 s: proyección de alas en el paseo.
  - 8,0 s: escena con público.
  - 10,0 s: paseo final.
- **Canción:** nº 2, drop **9,32 s**, start 2,53.
- **Texto** [visto]: durante todo el vídeo, «👱‍♀️: „Schatz, hör auf, dem Hund so einen Scheiß zu kaufen“ / Ich:».

### V10 · FalterPfote · item 36d5c459… · Genjutsu / audio original
- **Clip:** `ORD/NanoBanana/_UPSCALE/a7831853-7ad5-4675-a03f-a26ea3c575c1/final_1080p.mp4`, 13,72 s.
- **Rechazado** [visto]: los rótulos «Die Idee / Vs / Das Resultat» están quemados en la imagen. No hay nodo de corrección enviado.
- **Nota del dueño:** alas de mariposa en vez de dragón y cambiar la raza del perro en todas las tomas.
- **Textos:**
  - 0–4,0 s: «Die Idee 🤔🐶»
  - 4,0–7,43 s: «Vs...»
  - 7,43 s–final: «Das Resultat 🐶👀»

### V11 · FalterPfote · item a356074e… · Genjutsu / audio original
- **Clip:** `ORD/NanoBanana/_UPSCALE/7aeae6af-722f-407d-8e00-a97f95324d25/final_1080p.mp4`, 14,05 s.
- **Rechazado** [visto]: rótulos quemados, y en el gancho no aparece el coche que se acerca, que es imprescindible.
- **Textos:**
  - 0–3,4 s: «Das Problem...😳❌»
  - 3,4–7,13 s: «Vs...»
  - 7,13 s–final: «Die Lösung 🐶👀»

### V12 · FalterPfote · item f98cd1b1… · canción elegida
- **Nota del dueño:** «haz que la tienda sea LIDL… maximo que dure 5 segundos hasta el destape y el cuerpo adjuntalo desde el primer clip».
- **Gancho:** `ORD/NanoBanana/_UPSCALE/4d20b781-b650-4fd0-aac4-1524044643ce/final_1080p.mp4`, 6,08 s.
- **Cuerpo:** `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-ffe90d4992df4e5585acd1acd93d294b-54/NanoBanana/_UPSCALE/9bcdfe34-e119-4935-af9c-e6eaa4a937bb/final_1080p.mp4`, 9,38 s.
- **Edición antigua** `ORD/post-edit/final-v12-r1/edited.mp4`, 14,79 s [visto]:
  - Gancho acelerado ~1,115× (se eliminó 1 de cada 9 frames: 145→130); las cajas se revelan en el frame de salida 109 (~4,5 s).
  - El cuerpo entra a **5,417 s**.
  - Música: offset 3,903 (= 9,32 − 5,417), mezcla R2.
  - En la hoja de contactos: caja FalterPfote a 5,5 s, collar a 6–7,5 s y proyección a 8,0 s.
- **Textos:**
  - 0–11,29 s: «LIDL × FALTERPFOTE 😳🦋»
  - 11,29–14,79 s: «Kommentiere „FalterPfote“, wenn du / auch eins willst! 🤩🦋»

### Cómo se entregó el pedido 81 (referencia de «terminado») [visto]
- **Ruta:** `/Volumes/T7/AUTOMATIZACION SEGA/videos editados/2026-11-20/app-8082c194d416445a9cd108923e243156-81/<Cuenta> - DE/NN - <Cuenta> - DE.mp4` + `NN - Beschreibung - DE.txt`. Las carpetas de cuenta son `EisWerk - DE`, `HaarZauber - DE`, `FalterPfote - DE` y `HaarFein - DE`, con numeración correlativa 01–18.
- **Formato de exportación:** H.264 1080×1920 a 24 fps, ~6,3–10,7 Mb/s; AAC 44,1 o 48 kHz a ~192 kb/s (a veces 256–326 kb/s). Duraciones entre 10,7 y 20,0 s.
- **Formato de la descripción** (ejemplo, 01):
  ```
  Das süßeste Weihnachtsgeschenk! 🍦🎁😍

  Kommentiere „EisWerk“, wenn du sie brauchst! 🎄🍦
  ```
- **Vídeo 01 (hoja de contactos):** el texto 06B va arriba (zona y≈15 %) y es fijo; el CTA aparece en el resultado (~9 s); hay cortes cada ~1,5–4 s.

---

## 3. Reglas de edición que aplican (resumen operativo)

Fuentes: `docs/reglas-origen/reglas-edicion-t7/CRITERIOS_OBLIGATORIOS.md`, `CORRECCION_FUNCION_DROP_GANCHOS_20261115.md`, `MUSICA_R2_APROBADA/REGLA.md` + `politica.json`, `GENJUTSU_AUDIO_COMPLETO.md`, `SIN_OVERLAYS_GENERADOS.md`, `GENJUTSU_PADDING_TECNICO.md`; `memory-context/ritmo-musica-voz-edicion.md`, `texto-edicion-default-06b.md`, `verificador-cortes-independiente.md`, `videos-editados-por-fecha-20261029.md`, `textos-siempre-edicion-20261031.md`; `raiz/AGENTS.md` §Edición y entrega; y las indicaciones del dueño del 22/11 (`indicaciones-del-dueno.md`).

**Prioridad**
1. La instrucción humana más reciente y las notas del vídeo mandan sobre los valores por defecto.

**Estructura y duración**
2. **Gancho 1,2,3: máximo 6 s.** Regalo pop y caída de café: máximo 3 s. **No hay límite general.** Los límites son solo del gancho, **nunca del cuerpo**. Si el concepto aprobado es más corto, se respeta su duración.
3. **Cajas visibles como máximo 1 s después del revelado** (24 frames a 24 fps), sin cortar palabras.
4. **Réplicas** (Genjutsu): conservar la secuencia, acciones, visuales, tiempos, cortes, ritmo y duración de la referencia. **No recortar ni acelerar.**
5. **Cuerpos:** se usan enteros, desde su primer frame funcional, en el orden manual. Ningún frame del gancho antiguo ni de otro clip puede sobrevivir, tampoco en empalmes internos. Hay que quitar el padding técnico.
6. Cortar **por frame exacto**: nada de keyframes ni de segundos aproximados.

**Velocidad**
7. Solo se permite acelerar **levemente el gancho, máximo 1,12×** (por defecto), conservando el tono. **Nunca el cuerpo** y **nunca una réplica**. Si hay cambio de velocidad, hay que registrar el mapa de frames.

**Música** (en vídeos con canción elegida)
8. Usar el archivo exacto (sha256 de la tarjeta). Debe sonar **desde el primer frame, continuo, sin cortes internos ni reinicios**.
9. **Inicio del fragmento = drop guardado − segundo de entrada real del cuerpo.** Si el cuerpo tiene preparación antes del funcionamiento, el drop se ancla al frame «operativo». **Nunca se alarga el gancho para encajar la música.** Un offset negativo se resuelve retrasando de verdad la pista.
10. **Mezcla R2:** nivel de la canción constante, sin ducking automático y sin separar ni limpiar la canción. Solo se permite una ganancia global anticlip (el motor antiguo usaba un pico de 0,94).
11. **Audio del clip:** se elimina la música original. En gancho + cuerpo solo se conserva el **habla del primer clip**, separada; el cuerpo va sin audio ni ambiente. Si la separación deja música residual, no se entrega como verificado.
12. La voz tiene que ser inteligible y estar nivelada (~−14 LUFS, sin saturar). Hay que quitar la espera antes de hablar, dejando unos ~100 ms antes del primer fonema.

**Réplica Genjutsu sin canción**
13. Se conserva el audio generado completo.
14. **Conflicto:** desde el 15/11, la regla escrita dice que la canción explícita de la tarjeta prevalece también en Genjutsu completo (afecta a V6 y V9). El dueño acaba de decir que en Genjutsu se mantiene el audio original. Ver la pregunta 1.

**Texto**
15. Configuración **06B**:
    - Fuente `TikTokDisplay-Medium` (`EDITOR/fonts/TikTok-Display-Medium.ttf` en el proyecto del Mac).
    - Blanco #FFFFFF con contorno exterior negro de 0,05 em, sin sombra.
    - Interlínea 35/31 em.
    - **Caja fija invisible x112 / y287 / ancho 886 / alto 318** sobre 1080×1920, texto centrado en horizontal y vertical.
    - Sin seguimiento ni cambios de posición. Se ajusta el tamaño o los saltos de línea sin deformar el texto.
16. Traducción fiel al alemán natural. En el CTA se pone la **marca propia de la cuenta** («Kommentiere „EisWerk/HaarZauber/FalterPfote“ …»). Los emojis se adaptan al nicho de destino (cuentas: EisWerk 🍦, HaarZauber 💇‍♀️). Hay que guardar el original, la adaptación, el motivo y la traducción al español.
17. Los textos se ponen siempre, aunque la tarjeta diga `text_mode=none`. El CTA va sobre el resultado o producto y no puede quedar fugaz.
18. **Prohibido** tapar texto quemado con paneles o rectángulos opacos. Si el clip trae rótulos, es un defecto que hay que resolver.

**Entrega**
19. MP4 en `/Volumes/T7/AUTOMATIZACION SEGA/videos editados/AAAA-MM-DD/` (fecha Europe/Madrid), en `app-…-54/<Cuenta> - DE/NN - <Cuenta> - DE.mp4`, junto con `NN - Beschreibung - DE.txt`.
20. La descripción es la **descripción publicada del reel de referencia, adaptada**: alemán, marca propia, palabra de comentario igual a la del CTA del vídeo y emojis. Si está vacía o no se puede verificar, hay que decirlo.
21. Comprobar el SHA256 del origen y del destino, no sobrescribir (usar sufijo de revisión) y no entregar vídeos bloqueados ni lotes incompletos como «completos».
22. Una revisión independiente debe comprobar cortes, audio, textos y drop. No se puede afirmar escucha si no la hubo.

**Indicaciones del dueño del 22/11**
23. El **drop cae cuando se muestra el producto** (normalmente en el clip 2 o 3).
24. Los cambios de escena van con el ritmo de la canción.
25. Mini zooms para dar dinamismo. La intensidad y la frecuencia están por definir.

---

## 4. Lo que falta o es dudoso (preguntas para el dueño)

1. **V6 y V9 son Genjutsu, pero tienen canción elegida** (nº 6 y nº 2). ¿Audio original, como acabas de decir, o canción, como dice la regla del 15/11?
2. **¿Dónde exactamente cae el drop?** En V1, V2 y V12 la caja se ve en el revelado del gancho (clip 1), pero el producto real (máquina o collar) aparece en el frame 0 del cuerpo (clip 2), y su funcionamiento llega más tarde: en V12, la proyección a ~2,6 s del cuerpo. El motor antiguo lo puso en la entrada del cuerpo. ¿Lo mantenemos así?
3. **V1, V2 y V7:** ¿descargo y reviso los clips ya completados en Higgsfield (73c78aac, ed0559f6, 5505b172) y les paso Topaz? El Topaz gasta créditos.
4. **V4, V10 y V11 rechazados** y **V6 sin generar:** ¿se regeneran (con coste) o se entregan sin esos vídeos?
5. **Cuerpo de V1:** está en 480p y tiene el defecto del sirope sobre el motor. ¿Se usa igualmente?
6. **Descripciones:** el motor no guardó el pie de foto de ninguna referencia (`ORD/sources/*/source.json` no lo incluye [visto]). ¿Las saco de los reels de Instagram, cuyas URL están en el snapshot, o las escribes tú?
7. **Mini zooms:** ¿qué intensidad (por ejemplo 103–108 %), cada cuánto, y sirven ejemplos de vídeos tuyos? ¿Se permiten también en las réplicas Genjutsu? La regla dice que conservan los «visuales» (ver §5).
8. **Ediciones antiguas sin entregar** (V3, V5, V8, V12 en `ORD/post-edit/final-vN-r1/`): ¿se descartan y se rehacen con el editor nuevo? Mi propuesta es que sí.
9. **Fecha de la carpeta de entrega:** la de la nueva edición (regla Europe/Madrid). ¿Numeración 01–12 por posición? [inferido a partir del pedido 81]

---

## 5. Propuesta de montaje con ritmo

**Principios comunes**
- Se analiza la canción (beats y tempo) **solo** en los vídeos con canción elegida.
- En las réplicas Genjutsu con audio original no se resincroniza nada (indicación 1). Solo se añaden textos y, si el dueño lo aprueba, mini zooms, sin tocar cortes ni velocidad.
- El ancla de todo es el drop humano guardado: **inicio de la pista = drop − t_producto**.
- La rejilla de beats sirve para colocar los demás cortes y los zooms, **nunca** para mover el drop.

**Zooms y velocidad frente a las reglas actuales**
- **Zooms:** ninguna regla escrita los prohíbe. Hay tres matices:
  - (a) El texto 06B debe quedar fijo: el zoom se aplica solo a la capa de vídeo.
  - (b) Las réplicas «conservan visuales». Es una zona gris: pedir confirmación (pregunta 7).
  - (c) El verificador `cut_integrity` compara píxeles frame a frame y bloquea si hay una «transformación no contemplada». El editor nuevo tiene que **registrar cada zoom en el plan** y verificar antes de aplicarlo, o verificar contra el plan transformado [inferido].
- **Velocidad:** solo en el gancho y como máximo 1,12×; nunca en cuerpos ni réplicas.

**Tipo A · Gancho 1,2,3 + cuerpo con canción (V1, V2, V12)**
1. Gancho: se conserva la cuenta «Eins-Zwei-Drei» y la frase completa. Si hace falta, se acelera hasta 1,12× para que el revelado llegue antes de los 6 s (V12: antes de 5 s).
2. Se corta como máximo 1 s después del revelado, en el beat anterior al drop. El empalme gancho→cuerpo **es el drop**. Así el producto entra con el golpe.
3. Inicio de la pista con la entrada del cuerpo a t_c:
   - V12: t_c ≈ 5,42 s → start ≈ 3,90.
   - V1 y V2 (correcciones con revelado a ~4,4–4,9 s): t_c ≈ 5,4–5,9 s → V1 start ≈ 3,4–3,9 y V2 start ≈ 1,6–2,1 [inferido; se recalcula con el clip real].
4. Cuerpo: se usa entero sin recortar. Sus cortes internos ya existen y solo se cuadra el texto y el CTA al último resultado (3–4 s finales).
5. Mini zoom suave (≈+4 %) en cada toma estática del cuerpo, arrancando en un beat. Un «punch-in» corto en el drop.
6. En el gancho, pulso de zoom pequeño en «Eins/Zwei/Drei» si coinciden con beats.
7. En V2, el cuerpo 209 (unboxing) entra con el drop y su corte interno a ~2,25 s se mantiene.

**Tipo B · Gancho de acción + cuerpo de biblioteca con canción (V7)**
- Gancho de 3,2 s (tres entregas de caja). En la referencia, los cortes rápidos de ~0,5–0,7 s ya son rítmicos: se conservan y se comprueba si caen en los beats de la canción nº 3.
- Drop (17,74) en la entrada del cuerpo, donde el cepillo es visible: start ≈ 17,74 − 3,2 ≈ 14,5. Es coherente con el card start 14,35, que apuntaría a una entrada a 3,39 s.
- Alternativa: el primer plano del cepillo funcionando (~3,5 s dentro del cuerpo) solo si el dueño prefiere «producto funcionando».
- Mini zooms en las tomas largas del cuerpo (3,5–5,5 s y 9–11 s).

**Tipo C · Genjutsu con canción (V9 y V6, si se confirma la canción)**
- No se recorta ni se acelera. La canción se coloca para que el drop caiga en el corte donde se muestra el producto:
  - V9: collar a ~3,0 s → start 6,32; o proyección a ~6,0 s → start 3,32.
  - V6: el cepillo está visible desde 0 s. Propuesta: el corte de ~2,9 s con start 4,04, o el drop en 0 si la canción empieza con fuerza.
- El resto de cortes de la referencia se dejan donde están. Se comprueba cuántos coinciden con beats y se informa; no se mueven.

**Tipo D · Genjutsu con audio original (V3, V4, V5, V8, V10, V11)**
- Sin música nueva y sin tocar los cortes.
- Solo textos 06B con los tiempos medidos y, si se aprueba, mini zooms lentos alineados con los cortes existentes y con los golpes del audio original.

**Verificación antes de entregar**
- Mapa de frames y lista de zooms en el plan.
- Comprobación de que el drop está dentro de ±1 frame del corte o de t_producto.
- Música continua desde t0, nivel constante y pico ≤0,94.
- Revisión de texto y emojis.
- Hoja de contactos final y ffprobe.
- No se declara «escuchado» si no se ha escuchado.
