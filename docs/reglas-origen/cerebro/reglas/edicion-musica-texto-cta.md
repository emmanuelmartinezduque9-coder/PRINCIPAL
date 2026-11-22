# Edición orgánica: música, texto y CTA — 2026-09-13

Orden de Emmanuel tras la prueba EisWerk C20–C22, confirmada en su respuesta:
«cuando hay personas hablando ... la música no se pone al 100%, pero en los
vídeos que hicimos no hay nadie hablando entonces se pone al 100».

- Música a **100%** sin habla. Audio ambiente, máquina o golpes NO justifican
  bajarla. Con voz conservada se atenúa; el 20% existente es un valor técnico
  provisional, **no un porcentaje fijo que haya pedido Emmanuel**. No amplificar
  la pista por encima de 100%, ni normalizar o silenciar otros sonidos por iniciativa.
- `speech_present` debe proceder del encargo, prompt verificado o revisión real.
  El compilador aplica esa clasificación, NO detecta voces escuchando. C20–C22
  tienen `false` por confirmación explícita de Emmanuel.
- Texto Classic blanco con borde negro, centrado y márgenes laterales iguales.
  Buscar líneas de anchura descendente, de arriba abajo. Reorganizar los saltos
  de OCR; no copiar ciegamente su línea corta encima de otra muy larga.
- Se permite división alemana válida con guion, por diccionario local:
  `Das süßeste Weihnachts-` / `geschenk 🎁🎄🍦`. No cortar nombres de cuenta,
  inventar palabras ni reordenar el mensaje para forzar la silueta. No separar emojis solos.
- En la petición de comentarios, sustituir la palabra clave citada por el nombre
  de la cuenta: **Eiswerk**. Mantener gancho, significado, tono orgánico y demás palabras.
  La evidencia OCR/traducción original conserva su snapshot; adaptar solo la salida.
- **Texto al vídeo**, nunca vídeo al texto: no añadir dos segundos, repetir,
  ralentizar, congelar ni regenerar el vídeo para una CTA. Respetar su corte real.

Implementación: `EDITOR/edicion_politicas.py`, `EDITOR/texto_classic.py`,
compilador automático y planificador manual Creatomate. Tests offline de ambos.
Los cambios afectan nuevos borradores; no reescriben MP4 ya exportados ni
autorizan renders adicionales. El ajuste del fotograma compartido se comprobó
en los tres MP4 C20–C22 reexportados el 13 septiembre con autorización adicional:
fotogramas anterior/posterior al corte sin solapamiento; música medida cerca de
ganancia 1,0 frente a 0,2 anterior. Evidencia en
`EDITOR/lotes/tanda_20260913_prueba_eiswerk/revision_corregidos/`.

Guardado: `EDITOR/montaje_archivo.py` copia cada nuevo montaje terminado en
entrega diaria y, si corresponde a un único concepto, su carpeta `edicion`.
Hash y nombre versionado; reintento local sin gastar otro render. Guardar NO aprueba.
