# Edición flexible — requisitos y soluciones, 13 septiembre 2026

Estado: requisitos aclarados y propuestas; NO implantación de un editor nuevo.
No se ha renderizado ni modificado una plantilla remota en esta revisión.

## Texto sin transcripción manual de Emmanuel

Aceptar captura, vídeo original, referencia a un texto de concepto guardado o idea
dictada en español. Extraer/verificar texto cuando exista, conservar alemán aprobado
literal en regeneraciones y adaptar a alemán natural cuando se pida traducción o pilar.
Mostrar texto extraído cuando sea incierto; no adivinar palabras ilegibles.
Para una variación de significado, confirmar antes; no acortar un ganador sin permiso.
El usuario elige intención/referencia, no escribe el alemán largo a mano.

## Duración y dos textos

La plantilla aporta estilo; el montaje final aporta tiempos. Para el esquema pedido:
hook desde inicio hasta último corte, CTA desde último corte hasta final del vídeo.
Con clips separados, calcular sobre los recortes, velocidades y transiciones finales;
no usar duraciones brutas ni tiempos heredados de plantilla. Vincular CTA a la escena
de cierre en el plan para que cambios de montaje recalculen ambos textos.
Con cortes dentro de un solo MP4 (Seedance largo), detectar y verificar el corte;
no confundir entrada de archivo con cambio de toma, ni un movimiento/flash con corte.
Si no hay corte o es ambiguo, comunicarlo. No fingir detección perfecta.

Comprobar legibilidad: un texto alemán largo no se arregla reduciendo la letra hasta
ser ilegible; el último plano puede ser insuficiente. Proponer CTA más corta, entrada
anterior o ajuste del cierre, y no aplicar cambios de significado/metraje sin acordarlos.
Señalar casos excepcionales, no pedir tiempos manuales para todos los vídeos.

## Música

Recibir archivo completo una sola vez: preferir MP3 o WAV como material de trabajo;
otros formatos comunes como M4A se pueden inspeccionar/convertir si hace falta.
No exigir que Emmanuel prepare un recorte por vídeo. Conservar el original.
Guardar número/nombre estable y tramo favorito; aceptar «desde 00:18» o escoger
con él un tramo una vez. Cortar al largo real, ajustar volumen y fundidos; mezclar con
voz sin cambiarla. La API admite trim_start, trim_duration, volume y audio_fade_*.
No combinar loop y trim directamente: preparar el fragmento/otra secuencia si hay que
repetirlo. No estirar música de forma automática para llenar una duración.
La selección de estribillo/beat necesita análisis, no es una capacidad semántica
automática de Creatomate. No confundir enlace de escucha con archivo de audio.
Confirmar permiso de uso del archivo; automatizar recortes no concede derechos.

## Un resultado debe seguir siendo modificable

MP4 es salida plana, no proyecto por capas. Conservar montaje resuelto y versionado:
source RenderScript, medios, fuentes, textos, recortes, tiempos, música y parámetros.
La prueba MAQUINA DE HELADOS conserva payload con vídeo y texto, fuentes y rutas
en `NanoBanana/_EDICIONES/jobs/10887632b4e94f54bf23922da6939ff4/plan.json`.
Corregir texto/música implica reexportar montaje, no pagar otra generación Seedance.
Si el error está dentro del clip generado, cambiar una capa de texto no lo corrige.

Propuesta inmediata: pedir corrección por chat sobre ese montaje guardado.
Para edición visual autónoma: ofrecer «Editar» en el resultado existente, sin sección
nueva. Abrir una copia editable del montaje resuelto en Creatomate creada por API
solo cuando se necesite, preservando plantilla madre y revisiones anteriores.
Alternativa posterior: Preview SDK en Montaje para previsualizar/editar antes de
exportar. No construir un clon completo de CapCut para resolver dos capas de texto.
No existe promesa de importar RenderScript como proyecto por capas en CapCut.
Nueva exportación normalmente consume créditos; preferir revisión previa del montaje.
Ninguno de esos accesos nuevos a editor se ha implementado en este turno.

## Fuentes oficiales

- https://creatomate.com/docs/api/render-script/the-timeline
- https://creatomate.com/docs/api/render-script/element-properties
- https://creatomate.com/docs/api/render-script/audio-element
- https://creatomate.com/docs/api/reference/create-a-template
- https://creatomate.com/docs/api/preview-sdk/what-is-the-preview-sdk

Relacionado: [[sistema/creatomate-maquina-helados-api]], [[reglas/colaboracion-critica]].
