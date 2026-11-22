# Referencia de RufZeit: no confundir OCR con captions ni traducción con éxito

Emmanuel probó `https://www.instagram.com/reels/DdAvbTMNhSZ/` y obtuvo 21
bloques: marcas DIALTONE de las cajas, fragmentos del mismo hook y una traducción
pendiente presentada como «Traducido». La prueba anterior no incluía este caso
real de estanterías repetidas; los tests sintéticos no demostraban fiabilidad.

## Causas comprobadas

- `reference_texts.ocr.blocks` agrupaba las líneas con tamaño compatible. Después
  `caption_tracks.track` las agrupaba por segunda vez, mezclando letras del
  embalaje con el overlay. Se añadió entrada `pre_grouped`, sin cambiar el
  comportamiento del detector antiguo para sus otros consumidores.
- Una marca en muchas cajas generaba múltiples tracks. Se detecta ahora repetición
  espacial en varios frames y trayectoria del texto de escena, sin una excepción
  escrita para la palabra DIALTONE. Las exclusiones conservan razón y muestra.
- Espacios y lecturas defectuosas de emojis fragmentaban los textos. La limpieza
  conserva evidencia; palabras, números y emojis reconocidos distintos no se
  fusionan. Un intervalo realmente vacío no se rellena.
- Apple detectó indonesio al recibir la mezcla de etiquetas repetidas. Inglés y
  alemán SÍ estaban instalados. El aviso anterior no demostraba que faltasen.
- Con los dos overlays correctos, Apple identifica inglés pero traduce mal el
  hook coloquial en mayúsculas: introduce repeticiones y cambia Target por Ziel.
  Esto es otro fallo, no está resuelto por arreglar OCR.

## Comportamiento tras la corrección

El vídeo real produce dos bloques, 0–8,5 s y 8,75–15,67 s. Se conserva el breve
intervalo sin texto. El detector sigue sin recuperar todos los emojis: el vídeo
original muestra 🤣☎️ y 🤩☎️; no se insertan mediante una excepción oculta.

La traducción corrupta se rechaza y su respuesta se guarda para diagnóstico.
La UI dice «Traducción pendiente» y no permite convertirla en traducción válida
con «Guardar correcciones». La revisión guardada anteriormente se preserva en
`EDITOR/correccion_ocr_20260913/before.json`. No se modifican recetas aprobadas,
MP4 originales ni entregas.

Las comprobaciones de repetición y nombres NO certifican calidad semántica.
Para calidad idiomática independiente del chat hace falta evaluar un traductor
dedicado con un conjunto real de captions. No prometer que Apple Translation es
suficiente ni resolver la escalabilidad añadiendo una traducción codificada por
cada vídeo. Cambiar de proveedor/coste requiere dirección de Emmanuel.

## Evidencia ejecutable

- `EDITOR/test_reference_texts.py`: embalajes repetidos, no doble agrupación,
  espacios, dos overlays idénticos simultáneos, cambios de palabra/número/emoji,
  huecos vacíos, rechazo de traducción corrupta y de guardado sin traducir.
- `EDITOR/correccion_ocr_20260913/probe.py`: reproduce con OCR real guardado este
  vídeo y el anterior de EisWerk. Ambos dan dos bloques; el alemán fallido queda
  bloqueado. No es una prueba de descarga nueva.
- `EDITOR/correccion_ocr_20260913/ui_probe.cjs`: navegador propio headless, sin
  escrituras ni renders, comprueba resultado real y estados de la app.
