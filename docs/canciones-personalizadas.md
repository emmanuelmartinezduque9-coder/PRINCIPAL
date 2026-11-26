# Infoproducto de canciones personalizadas (Emmanuel, 26/11/2026)

## Qué es

Reels de reacción como los de la cuenta de referencia https://www.instagram.com/tune_ofyou/reels/: en el coche suena
«una canción de la radio» que en realidad es una canción hecha para el copiloto (con su nombre); se graba su reacción.
Textos: un gancho en recuadro oscuro con letra blanca («Mi abuela pensaba que era una canción de la radio»… «Crea la
tuya aquí») y la letra de la canción en amarillo, debajo, sincronizada. Audio: solo la canción (20–30 s).

Para cada reel de referencia, PRINCIPAL:

1. Replica la escena con Genjutsu Motion Transfer (un frame, un clip con la referencia entera) con avatares y entorno
   del país de destino (reglas de siempre: localización, cada toma conserva su sitio…).
2. Crea una canción NUEVA con el mismo contexto, la misma relación y el mismo estilo que la de la referencia, pero en el
   idioma y con nombres y detalles del país de destino (Abuela Carmen → Oma Hildegard; meriendas al salir del cole →
   Kakao nach der Schule). La canta la web musical de Emmanuel (Suena a Ti, ElevenLabs `music_v2_5`), con la duración
   de la referencia. Emmanuel autorizó el gasto de ElevenLabs (26/11/2026).
3. Monta con la canción nueva desde el segundo 0 (sin audio de la referencia, sin doblaje), el gancho traducido en su
   recuadro y la letra en amarillo sincronizada palabra a palabra.

## Producto

`products.kind`: `fisico` (por defecto, lo de siempre) o `cancion` (infoproducto de canciones). Se elige en la ficha del
producto. Con `cancion` no hay caja ni variantes obligatorias; la marca y su llamada final las crea el chat de productos.

## Paso «canción» (`video.cancion`)

Para los vídeos de un producto `cancion` sin canción propia, en cuanto la referencia está lista (y antes del montaje):

1. Transcribe la canción de la referencia (Whisper large-v3-turbo, como el doblaje) con su idioma y tiempos.
2. Claude (pasarela de siempre) devuelve en JSON: `recipientName` (nombre del país de destino para la misma relación),
   `relationship`, `story` (el contexto de la referencia adaptado al país), `lyrics` en el idioma del país con
   secciones `[Verse]`/`[Chorus]`/…, `genre`, `styles` (en inglés), `mood` y `voice` (la de la referencia). Reglas de
   letra de Suena a Ti: primera persona de quien regala a quien recibe; el nombre se canta en el estribillo; detalles
   concretos de la historia; rimas naturales; cantable: 4–6 líneas cortas por sección, máx. ~9 palabras por línea; que
   quepa en la duración de la referencia.
3. `POST ${WEB_MUSICAL_URL}/api/internal/songs` con cabecera `x-internal-key: ${WEB_MUSICAL_INTERNAL_KEY}` y cuerpo
   `{ language, durationSeconds, genre, styles, mood, voice, recipientName, story, lyrics }` → `{ id, title,
   durationMs, sections, words[{word,startMs,endMs}] }`; después `GET /api/internal/songs/<id>/audio` (MP3).
   Errores: 400, 401, 429 (tope diario), 502 (mensaje en español).
4. Guarda el MP3 en `songs` (sección «canciones-personalizadas» y el nombre del producto, `dropMs` 0, `startMs` 0),
   la letra con tiempos en `song_lyrics` y pone `videos.song_id`. Idempotente (`runStep`), sin preguntas; un fallo se
   reintenta solo.

## Montaje

Con un producto `cancion`: la canción del vídeo suena desde el segundo 0 durante todo el vídeo, sin audio original ni
doblaje. Los rótulos de la referencia se adaptan como siempre (el gancho). La letra se dibuja en amarillo, centrada,
debajo del gancho, línea a línea con los tiempos de `words` agrupados por las líneas de `sections` (algunas palabras
llegan con `startMs == endMs`: se usa la línea entera).

## Pruebas

`tests/canciones.test.ts`: la petición a la web musical (cabecera, cuerpo, idioma y duración), el guardado en `songs` y
`song_lyrics`, que el montaje de un producto `cancion` no dobla y pone la canción desde 0, y el agrupado de la letra.
