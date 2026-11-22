# Replicar Seedance: textos y edición automáticos — 2026-09-13

Orden posterior de Emmanuel: las réplicas Seedance a partir de enlace usan el
texto del original automáticamente. El usuario elige canción e inicio, no vuelve
a pegar el enlace, redactar textos ni indicar cada cambio. Criterio
[[traduccion-organica]]; traducir al idioma de la cuenta, conservando texto ya nativo.

Implementación: `EDITOR/reference_texts/replication.py`. Los nuevos trabajos no
Genjutsu de Replicar guardan `textos_automaticos`; el worker prepara OCR/traducción
en paralelo con la producción. Los trabajos históricos NO se activan retroactivamente.
Genjutsu queda sin cambios. El texto se incorpora en montaje, no se añade al
prompt de Seedance ni se cambia el prompt histórico de una regeneración.

## Vínculo determinista

En manifiestos conservar `replicar_id` (o `trabajo_lote`) y `origen_referencia`.
`lanzar.py` también obtiene el ID del inventario global o de un enlace único de
la misma cuenta. Lo conserva en el registro del clip. Un enlace repetido exige
ID inequívoco: no elegir el primero ni enlazar un vídeo histórico del mismo URL.
Las regeneraciones literales siguen su receta ya guardada, sin reinterpretar el enlace.

Método B espera un vídeo completo. A espera todas sus escenas. C debe declarar
`total_clips_montaje` en el trabajo de Replicar según su esquema híbrido; no se
adivina que cualquier primer clip sea la entrega completa. Auto debe resolver
A/B durante su análisis, como en el pipeline existente.

## Edición

Aplicar también [[edicion-musica-texto-cta]]: música al 100% sin habla,
líneas centradas de ancho descendente y palabra de comentario de la cuenta.

Corrección explícita de Emmanuel, 13 septiembre, durante la primera prueba:
**el texto se adapta al vídeo, nunca el vídeo al texto**. No existe una duración
fija de dos segundos para la CTA ni se exige igualar su duración al original.
Si corresponde al último cambio de toma, empieza en el último corte real y acaba
con el vídeo, aunque ese intervalo sea menor que en la referencia. No regenerar,
alargar, congelar ni repetir planos para aumentar su tiempo. Ajustar presentación
y tiempos del texto, conservando sus palabras salvo cambio de copy autorizado.

Después de entrega válida de TODOS los clips: comprobar el texto, vincular sus
cambios a los cortes reales y guardar snapshot/hash en la receta del concepto.
Un texto dura el vídeo; varios conservan su relación con los planos. La ambigüedad
queda pendiente, sin repetir clips, inventar recortes o estirar la plantilla.

Autorización de texto automático es distinta de aprobación humana: la receta usa
`reference_texts.automatic` con procedencia verificada, NO `language_confirmed=True`
ficticio. Se conserva el circuito manual de revisión de textos cuando se usa Montaje
directamente. Este permiso NO aprueba frames ni vídeos rechazados.

La música y el avatar se eligen en una fila independiente por enlace antes de añadir
el lote (`items`). No duplicar silenciosamente una única selección en todos los vídeos.
Se permiten selecciones por vídeo en Seedance y Genjutsu; Genjutsu conserva la música
en `edicion_pedida` sin activar este circuito de textos Seedance. El envío se valida
completo antes de guardar y su ID evita duplicarlo al reintentar.

La música puede elegirse al añadir enlaces o después por trabajo. «Elegir después»
no significa silencio; «Sin música» es una decisión explícita. Inicio se fija en la
receta; cambiar la biblioteca no lo cambia. Permiso de uso y exportación siguen
sus comprobaciones. Cambiar música invalida el borrador anterior para exportar.

Se crea solo un borrador de Creatomate, nunca un render pagado automático. No se
sobrescribe una edición manual ni se reescribe una receta congelada al corregir
después el OCR. Se reutilizan los originales descargados cuando coincide URL/hash;
la previsualización muda NO se reutiliza como fuente para generar vídeo.

Quitar un trabajo usa confirmación dentro de la app y archivo recuperable con Deshacer;
no borra originales, frames ni clips. Las retiradas se conservan frente a snapshots
viejos de productores. La cola se modifica sin esperar una generación remota.

Mac y app/worker deben seguir funcionando. Esto automatiza los textos y el
borrador, no reemplaza la generación ni sus aprobaciones. OCR puede omitir emojis;
no se inventan. Pruebas: `EDITOR/test_replication_edits.py` y
`EDITOR/replicar_textos_20260913/`.
