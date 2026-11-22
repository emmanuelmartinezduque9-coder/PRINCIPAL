# Identificadores de edición y Montaje simplificado

Cada referencia conserva un alias permanente `texedicionN` en la tabla
`text_editions` de `NanoBanana/_TEXTOS_REFERENCIA/jobs.sqlite3`.
Se muestra junto a los textos y en Referencias guardadas. Copiar ID exige guardar
primero las correcciones pendientes. El alias no implica aprobación ni traducción terminada.

Resolver mediante `reference_texts.store.resolve('texedicionN')` o GET
`/api/reference-texts/job?id=texedicionN`. Para reutilizar, obtener su revisión
actual y usar `service.snapshot(alias, revision)`; los conceptos guardan su propia
copia de textos y tiempos, no se reescriben al corregir otra referencia.

Emmanuel pidió retirar ambas secciones: Siguiente vídeo para publicar y Pruebas
y entregas. Se retiraron de Montaje, no se borraron vídeos, registros ni endpoints.
No reintroducirlas como solución a otros problemas sin consultarlo.
