# «Traducir el diálogo al alemán» — decisiones (23/11/2026; por defecto desde el 24/11/2026)

> **24/11/2026, orden del dueño:** el doblaje va POR DEFECTO, sin interruptor en el lote (se quitó). Todo vídeo cuya
> referencia tenga diálogo en otro idioma se dobla al idioma del producto (`products.language`: `de` → `deu`,
> `it` → `ita`…). Al separar la voz, Whisper (`faster-whisper`, modelo `large-v3-turbo` desde el 25/11/2026, en la imagen) dice si hay diálogo
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
5. Orden del dueño sobre FalterPfote 5 (vídeo 22, 24/11/2026): «el diálogo tiene que estar traducido al alemán»; el
   clasificador lo dejó sin doblar (la cuenta atrás no llegó a Claude por un umbral de idioma de 0,5 —ahora 0,3— y la
   otra frase salió «duda»). Ahora: ante la duda gana HABLA si la frase es conversacional y no es letra de canción
   (ejemplos reales en el prompt); varias frases que son trozos de una misma canción mal transcrita son todas CANTO; una
   frase de habla que se solapa en el tiempo con una de canto cuenta como canto. Probado con Claude real sobre las
   frases del lote 6: 22 y 6 → habla; 8, 11, 13, 20 y 21 → canto o duda. Y si el dueño enciende a propósito «Doblar el
   diálogo» en la tarjeta (`videos.dub_dialogue = true`, no el valor por defecto), se dobla todo sin clasificar.
6. «Solo gancho» sin cuerpos elegidos en la tarjeta: el montaje lleva los cuerpos del producto (el vídeo 22 salió solo
   con el gancho porque nadie eligió su cuerpo «bury»).

No hay nada parecido en Codex: allí el doblaje se pedía a mano por vídeo y su V6 tradujo letras de la canción.

## Lote 10: el diálogo con un villancico debajo (25/11/2026)

Ningún vídeo de HaarZauber del lote 10 salió en alemán según el coordinador. Medido con el audio real:

- **45** («10 seconds I promise. No I'm good. Wait what? Oh you're buying it.») y **46** («I got one last week. Best
  thing ever. Enjoy!») quedaron «skipped / solo canto o duda». Dos causas en el código del 24/11: la regla «una frase de
  habla que se solapa con una de canto es canto» (el diálogo de la pista de voz se solapaba con «Jingle Bell Rock» y
  «Let It Snow» de la pista de música) y el ejemplo «I'm good» como frase corta «dentro de una canción» en el prompt.
- **44** sí estaba en alemán: el audio de la edición es el doblaje (correlación 0,9998 con `doblajes/44/36.m4a`) y
  Whisper large-v3-turbo lo transcribe «Der hier ist nur für mich. Das hast du dir verdient, Mama.». Los clips de
  Genjutsu de este lote vienen SIN pista de audio (ffprobe: solo vídeo), así que no hay voz generada que quitar; el
  inglés que se oyó era Whisper `small`/`tiny` leyendo el alemán como inglés («There he is, no fun»). Los cortes del
  clip coinciden con los de la referencia (±0,05 s) en 44, 45 y 46: el doblaje cae en sus tiempos reales. En el **47**
  el clip va 1,1 s desplazado desde el primer corte; el montaje «plano a plano» corta en los tiempos de la referencia
  (los del doblaje) y queda en 12,1 s.

Órdenes del dueño (25/11/2026) y cómo quedan:

1. **Ante la duda gana HABLA; una frase conversacional nunca es canto; con canción de fondo el diálogo se dobla
   igual.** En `classifySpeech` una «duda» (o una frase sin contestar) es habla; canto es el verso de una canción que
   Claude nombra (`cancion`, `verso`) o letra claramente cantada aunque no la conozca (rima, estribillo repetido, frases
   poéticas que no se dirigen a nadie). Exigir siempre el nombre de la canción se probó y se descartó: canciones que
   Claude no reconoce («Rock your body» del 48, «I'm a fireball» del 50, «Ordinary» del 53) salían habla y se habrían
   traducido. Cada frase se juzga sola. Fuera la regla del solapamiento.
   `DECISION_VERSION = 3`: todas las marcas y doblajes anteriores se vuelven a mirar.
2. **Whisper large-v3-turbo** en todo el doblaje (antes `base`). Probado en el contenedor de Railway con las pistas de
   BandIt: `base` daba el alemán del 44 como «el»/«es» y `small` como «en» al 0,75; el turbo transcribe bien las frases
   cortas dobladas, la voz sobre villancicos («Oh, no, I'm good», «Wait, what?») y los villancicos. ~20 s por vídeo en
   CPU además de la separación. Su idioma por frase corta sigue dudando (0,25 en «Der hier ist nur für mich»), así que
   una frase cuenta como «sigue en el idioma original» solo con ≥ 0,5 y ≥ 0,6 s (`en_idioma_original`).
3. **Comprobación final obligatoria** (`doblar.py verificar` + `checkFinalDialogue`): tras el montador, el vídeo montado
   se separa otra vez (BandIt + MDX) y se transcribe. Lo que siga en el idioma original pasa por la misma decisión
   habla/canto. Si es habla, el montaje NO se guarda: el doblaje de ese audio se marca «Comprobación final: …» con esos
   tramos en `forzar` (habla sí o sí) y el montaje vuelve a la cola; el siguiente intento dobla con esos tramos y vuelve a
   comprobar. Tras `MAX_FINAL_REDUBS = 2` rehechos se para con el motivo («el diálogo sigue sin traducir…»): nunca se
   entrega con el diálogo sin traducir. El aviso «Comprobado en el vídeo montado (Whisper): …» dice lo que se oyó.
   Si no se puede comprobar, el montaje falla con el motivo en vez de entregarse a ciegas.

4. **Primera prueba real (montajes 139–141):** 44 y 45 bien; en el 46 la comprobación final oyó «I.» suelta (un trozo de
   «but the fire is so delightful») y, sin contexto, Claude no la reconoció: se dobló un trozo de la canción («Aber dass
   ich er…»). Ahora una frase necesita al menos dos palabras para contar, y Claude decide con todo lo oído en otro
   idioma como contexto (los versos de alrededor), no con la frase suelta.

Prueba con Claude real y Whisper large-v3-turbo sobre 14 referencias reales (25/11/2026): lote 10 todo bien (diálogo
de 44, 45, 46, 47 y 48 → habla; canciones de 48, 50, 51, 53 y los villancicos → canto); lote 6: 6, 8, 11 y 13 bien.
Límite conocido, imposible de decidir solo con el texto: en el 21 dos versos mal transcritos («I'm on a ride», «Your top
stick») salen habla, y en el 22 una frase hablada poética («…the imagination, was held in chains») sale canto.

Datos corregidos a mano (25/11/2026): los doblajes 54 (vídeo 50) y 55, 57, 58 (vídeo 48) se retiraron: se hicieron
con la versión que exigía nombrar la canción, y la comprobación final tradujo «rock your body» (48). El 46 volvió a su
primer doblaje (51), sin el trozo de «Let It Snow». Vídeo 51: la tarjeta pedía «el audio en alemán del 3, 2, 1, vamos a
ver cómo sale» al principio, con «vamos a ver cómo sale» al retirar el pañuelo. Es la voz de las referencias de EisWerk
del mismo lote («Eins, zwei, drei. Mal sehen, wie es geworden ist.», referencia 38, separada con BandIt): se añadió al
«Audio original» del 51 0,5 s tarde («Mal» a los 3,2 s; el pañuelo sale a los 3,4–3,5 s). La copia sin la voz está en
`referencias/51/audio-original-sin-voz-alemana.m4a`. Pendiente: que una orden así de la tarjeta («añade esta voz») se
haga sola en el montaje.

Descartado tras medirlo: una puntuación acústica de canto (tono sostenido, sílabas por segundo; prototipo de Codex con
las 28 frases de los lotes 6 y 10) acertaba el 46 % dejando cada vídeo fuera del ajuste; inaSpeechSegmenter y YAMNet
meten TensorFlow en la imagen y tampoco separan «habla sobre música» de «canto» con fiabilidad. Forzar el idioma en
Whisper y comparar probabilidades tampoco: traduce en vez de transcribir.

## Lote 11: trozos de canción dados por diálogo (26/11/2026)

Emmanuel: el resto del lote 11 quedó muy bien, pero en el **64** se dobló «Made in the step.» (un trozo mal transcrito
de la canción, pegado a «A place on a lover with a fire in its heart») y en el **65** el verso «I'm a shot alone in my
tower». Causa: «ante la duda, habla» con letra transcrita a medias. Y, al escuchar los montajes, Higgsfield había traducido
la canción: el 65 sonaba «Die ganze Zeit, die Falle in meinem Turm…» y el 64 empezaba con «Magda macht ihr nicht so viel so».

1. **Claude dice además si cada frase es conversacional** (tiene sentido como algo que una persona de la escena dice a
   otra o a cámara). `lyricFragments`: una frase NO conversacional que solapa o va pegada (≤ 1 s) a un verso, o que se
   repite como un estribillo, es canto. Una conversacional sigue siendo habla aunque suene una canción a la vez («10
   seconds, I promise.» del lote 10). El prompt añade la primera persona poética sin interlocutor y los trozos sin
   sentido pegados a un verso. `DECISION_VERSION = 4`.
   Probado con Claude real sobre las frases guardadas de los lotes 10 y 11 (20 vídeos): 64 «Made in the step.» → canto
   («That's it?» y «Okay. Best gift ever.» → habla); 65 → canto; 49 «Hooray to downtown!» ×4 → canto; todo el diálogo
   del lote 10 (44–48, 63) sigue habla y las canciones (48, 51, 60, 61, 67, 68) canto.
2. **La comprobación final busca también letra traducida**: (a) frases en el idioma del anuncio que, con la misma
   decisión, son canto; (b) Claude compara cada frase doblada del montaje con las frases de la referencia (con su
   habla/canto) y dice cuál traduce: si traduce una de canto, el montaje no vale. Esos tramos se guardan en `cantar`: al
   volver a doblar, lo que caiga ahí y no sea conversacional es canto. Con `forzar` (diálogo sin traducir) manda el
   diálogo. Tras 2 rehechos se para con el motivo («la letra de la canción sigue traducida…»).
3. Revisión de Codex del cambio: (a) una canción que ya está en alemán en la referencia no puede tomarse por letra
   traducida: el análisis guarda `nativas` (lo que ya estaba en el idioma del anuncio) y la comprobación lo ignora;
   (b) una letra traducida anula el `forzar` anterior de ese tramo (si no, el verso se volvía a traducir hasta agotar
   los intentos); (c) una frase de diálogo en un tramo con letra traducida (la canción se coló en su ventana, vídeo 64)
   se dobla sin el margen de 0,25 s a cada lado.
4. Primer intento real (montajes 165 y 166): los dos reutilizaron el doblaje viejo. En el 65 Claude dio esta vez habla a
   «I'm a shot alone in my tower» (sola, sin contexto, la decisión bailaba) y la comparación no unió «Magda, machst du
   nicht zu viel?» del 64 con la canción. Ahora: lo NO conversacional que el separador dejó en la pista de música es
   canto (la cuenta atrás del 22 y «Oh my God!» del 63, en la música pero conversacionales, siguen habla), y todo
   diálogo que suena a la vez que un verso se dobla sin margen. `DECISION_VERSION = 5`. Probado con Claude real sobre los
   lotes 10 y 11: todo el diálogo habla; 49, 50, 64 «Made in the step.», 65 y 66 «And me to be…» canto.
5. Segundo intento real (168 y 169): 64 bien («Das war's.», «Okay, bestes Geschenk aller Zeiten», la canción en inglés);
   el 65 se volvió a doblar: Claude a veces no contestaba si la frase era conversacional y eso contaba como «sí». Ahora
   el campo es obligatorio, y Claude recibe como contexto lo que Whisper oye en el audio entero (`mezcla` de `separar`).
   La comprobación final también escucha el audio entero (en el 65 el alemán cantado no salía en la voz separada).
   `DECISION_VERSION = 6`. Probado 3 veces seguidas con Claude real: 65 canto 3/3; 64, 45, 22 y 63 sin cambios.

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
