# Textos de edición — patrón CapCut de Emmanuel, 13 septiembre 2026

Orden: todos los montajes nuevos usan Classic blanca con contorno negro. Referencias
visuales: capturas de Documents del 13 septiembre a 0.21.36 y 0.21.49. Mantener
márgenes laterales iguales, centrar cada línea y adaptar letra al texto; no fijar
tamaño por número de caracteres. No alterar palabras de un texto ganador.

Implementación: `EDITOR/texto_classic.py`, aplicada por `creatomate_app.plan` y
`montaje_automatico.compile_source`. Se mantienen tiempos y posición vertical
de la plantilla; las entregas y planes ya existentes no se reescriben.

- Caja horizontal centrada, ancho 84% (8% a cada lado); escala 100%, no 50%.
- Classic: TikTok-Display-Medium.ttf real, copia durable en `EDITOR/fonts/` y
  SHA-256 comprobado. El alias `classic/800` selecciona el asset exacto registrado;
  no significa que se haya encontrado un archivo Bold distinto.
- Blanco con contorno negro de 0,55 vmin; tamaño nativo automático limitado a
  4–7,8 vmin, con máximo particular calculado por ancho real de las palabras.
- Orden posterior: recomponer los saltos OCR para obtener líneas de anchura
  descendente (hasta cuatro líneas). Admitir división alemana correcta con guion,
  sin cambiar palabras ni separar emojis solos. Ver [[edicion-musica-texto-cta]].
  Mide Classic y reserva ancho conservador para emojis.
- No truncar ni ocultar con elipsis. Si no cabe legible, detener y proponer
  dividir el texto/pantalla; jamás resumir automáticamente un copy aprobado.
- Lectura: encajar no garantiza que dé tiempo a leer. Esto no autoriza a alargar
  el vídeo ni imponer un mínimo fijo de CTA. Respetar el corte final; el texto se adapta.
- La medición previa no acredita una revisión visual: revisar muestras del MP4,
  especialmente cambios de fuente, emoji, composición anidada o texto excepcional.

MAQUINA DE HELADOS remota: `0658121e-cb17-4b4e-ab8b-54f3a648dde5`.
Respaldo y verificación del cambio por API en `EDITOR/prueba_textos_20260913/`.
La prueba con música `0606327b52554f709c542b135c37514d` fue aprobada por Emmanuel;
esa aprobación no se extiende automáticamente al nuevo estilo de esta comparativa.

No es entrenamiento automático del modelo: es una regla ejecutable reproducible,
con ejemplos, pruebas de regresión y ajustes posteriores a comentarios del usuario.
