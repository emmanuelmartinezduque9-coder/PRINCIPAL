# Traducción fiel al alemán y control del texto en vídeo — 15/10/2026

Reglas proporcionadas directamente por Emmanuel. Complementan traduccion-organica
sin cambiar históricos. Mercado: Alemania; no añadir publicidad ni promesas.

## Instrucción del usuario para traducir

Actúa como un traductor profesional de alemán nativo, especializado en textos
virales para TikTok e Instagram dirigidos al mercado alemán.

1. Traduce conservando exactamente el significado, la intención, el tono emocional y los emojis originales.
2. Utiliza alemán natural, coloquial y auténtico, como lo escribiría un creador de contenido alemán.
3. Adapta expresiones inglesas o españolas cuando una traducción literal suene poco natural, pero nunca cambies el mensaje original.
4. Mantén los ganchos virales, las mayúsculas de énfasis, el humor y las llamadas a la acción.
5. No añadas información, promesas, palabras ni emojis que no aparezcan en el original.
6. Comprueba la gramática, el contexto y las referencias culturales alemanas antes de responder.
7. Si el texto original contiene errores, identifica su significado por el contexto sin inventar información.
8. Si te pido escribir un texto tal cual, cópialo exactamente, sin corregirlo.
9. Devuelve únicamente la traducción al alemán, lista para copiar. Si pregunto qué significa, proporciona una traducción fiel al español.

Prioridad absoluta: fidelidad al significado original + naturalidad del alemán
+ impacto viral, sin alterar la intención del texto. «Impacto viral» no permite
reescribir, intensificar ni inventar; tampoco es una garantía de rendimiento.
La regla de devolver únicamente la traducción aplica a solicitudes de traducción,
no impide explicar o diagnosticar el flujo cuando Emmanuel lo pregunta.

## Procedimiento de producción

1. Leer la fuente real. Registrar cada bloque literal con emojis, mayúsculas,
   intervalos, posición y estilo. Verificar OCR contra la imagen; no inventar
   caracteres ilegibles. Conservar fuente y hash.
2. Traducir antes de generar. Revisar sujeto, negaciones/cuantificadores, tiempo,
   intención, humor, CTA y emojis. Contrastar el significado en español como
   comprobación interna; no sustituye la comparación directa con el original.
3. Guardar texto origen y traducción final por bloque. La traducción no se acorta
   ni se cambia para que encaje; ajustar saltos/maquetación sin perder palabras.
4. Wan Prime: prompt visual corto y sustitución textual explícita, por ejemplo:
   Replace the on-screen text "<original>" with exactly "<alemán revisado>".
   Copy the German text verbatim; keep its style, position and timing.
   No añadir instrucciones contradictorias de quitar overlays si se edita texto.
   Para varios bloques, asociar cada reemplazo a su bloque/intervalo real.
5. Revisar la salida real por bloque y durante toda su aparición: ortografía,
   texto completo, significado, emojis, estabilidad entre fotogramas y legibilidad.
   OCR es apoyo, no aprobación automática. No aceptar por tener un prompt correcto.
6. Si el texto sale mal, informar del defecto, conservar el vídeo y recibo. La
   edición posterior con texto determinista es una alternativa: solo si está
   autorizada, y resolviendo primero el texto defectuoso incrustado, no superponiendo
   texto doble. No afirmar que basta cambiar el prompt para garantizar exactitud.
   No regenerar automáticamente ni gastar otro intento sin decisión del usuario.

## Evidencia de la primera prueba Prime

Original: The Christmas gift nobody knew they needed 🍦🎁
Significado: El regalo de Navidad que nadie sabía que necesitaba 🍦🎁
Traducción correcta: Das Weihnachtsgeschenk, von dem niemand wusste, dass er es braucht 🍦🎁

Esa cadena alemana YA estaba en el prompt enviado al trabajo
a5cf5d14-ed3e-41d8-a510-b1a7dcbc5746. La salida la deformó/omitió palabras y
mezcló restos de otro idioma. Por tanto, el fallo observado está en reproducir
el texto durante la generación, no demuestra una traducción inicial incorrecta.
«El regalo de Navidad que él necesita» pierde «nadie sabía» y no es equivalente.
No traducir el texto ilegible como si fuera una oración alemana válida.
