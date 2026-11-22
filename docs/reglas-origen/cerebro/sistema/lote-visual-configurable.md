# Lote visual configurable — 13 septiembre 2026

## Decisión aprobada

Emmanuel organiza la producción diaria en la app, como antes en Miro. No debe
reescribir prompts, textos o canciones de conceptos existentes. La interfaz
prioriza el lote completo, agrupa por cuenta y oculta opciones avanzadas hasta
necesitarlas. No reintroducir las secciones retiradas de publicación y entregas.

## Uso real

1. **Lote**: cuenta, tipo y enlaces. Cada enlace crea una tarjeta guardada.
   Regenerar y crear desde cero también permiten añadir una tarjeta sin enlace.
2. En cada tarjeta se elige concepto/receta con una galería de miniaturas. Debajo
   se muestran los frames por clip y se pueden cambiar visualmente. Edición y
   música quedan en la tarjeta; avatar, método y cambios especiales en opciones.
3. Marca las tarjetas para el encargo. **Preparar seleccionados (N)** valida solo
   esas tarjetas. La selección se guarda; una selección vacía no equivale a todo.
   Reutiliza lo guardado y solicita lectura/traducción solo de las referencias seleccionadas.
4. Revisión conjunta: abrir una edición para corregir, añadir, eliminar, unir
   bloques o ajustar tiempos. Seleccionar tarjetas y aprobar sus textos.
5. **Enviar seleccionados (N)** entrega exactamente la selección preparada y
   aprobada a la Oficina existente. Los excluidos quedan editables para otro envío;
   los enviados quedan bloqueados y registrados para no duplicarlos. Cambiar la
   selección requiere prepararla de nuevo. No autoriza generación ni exportación pagadas.

Pegar, guardar, duplicar o cambiar opciones no analiza, traduce ni genera.
La vista previa opcional descarga/prepara una copia local, pero no hace OCR.
«Número esperado» detecta discrepancias; nunca obliga a inventar o borrar textos.
El recuadro delimita los centros de las líneas que se incluyen en la lectura.

## Reutilización y organización

### Cuentas plegables — 13/09, 20:01

Las tarjetas se agrupan en un desplegable nativo por cuenta, con nombre y total de vídeos. Sin una preferencia previa, las cuentas aparecen plegadas. Añadir vídeos abre su cuenta para poder configurarlos. Se recuerda abierto/cerrado por lote en el navegador, también después de guardar o recargar; no modifica el encargo. Las cabeceras muestran seleccionados y diferencian errores, procesamiento y textos por aprobar. Plegar no elimina ni deselecciona; son las casillas las que deciden el alcance real de preparación/envío. Plegar detiene la reproducción oculta. No se añaden secciones nuevas.

### Crear variante — captura de referencia por clip

Partir de un concepto existente y cambiar solo lo necesario. Debajo de cada clip incluido aparecen **Elegir frame** y **Subir captura**. El primero elige una imagen ya guardada; el segundo adjunta una referencia PNG/JPG/WebP local, con miniatura y estado «Captura de referencia · frame pendiente». Cambiar/quitar captura afecta solo a ese clip y ese borrador; el concepto canónico, las selecciones de los otros clips, textos y música no se modifican. Duplicar comparte el archivo inmutable, pero permite cambiar la selección independientemente. Crear desde cero también acepta una captura para su clip 1; no es todavía un constructor arbitrario de múltiples escenas nuevas.

Las capturas viven en `NanoBanana/_LOTES_APP/captures/` y `frame_captures` enlaza número de clip → ID local en el borrador. El ID no es un media_id de Higgsfield ni un frame aprobado. Preparar congela `frame_requests` y `clip_execution_plan`, con ruta y SHA-256 de cada captura y `start_image: null` en el clip pendiente. Enviar entrega ese plan a Oficina, sin autorizar gasto. El especialista debe crear el frame por `EDITOR/frame.py`, presentarlo en la ronda global y obtener aprobación antes de vídeo; nunca tomar la captura ni el frame antiguo como el nuevo start_image. Las rutas nuevas no llaman proveedores. Se verifica la integridad del archivo antes de preparar/enviar. Desvincular no borra originales, históricos ni referencias de otras tarjetas.

- Regeneraciones: copia de los prompts y frames canónicos. Las modificaciones
  explícitas se guardan por separado; no reescribir el prompt original en silencio.
- Textos independientes del vídeo: conservar edición, elegir `texedicionN`,
  extraer del vídeo, de otro enlace o sin texto.
- Música: número y segundo por tarjeta. Se puede asignar a varias seleccionadas
  o usar la misma canción con distintos inicios. No se modifica la canción global.
- Duplicar tarjeta/lote crea nuevos identificadores de trabajo, sin iniciar tareas.
- **Textos y edición**: miniatura, gancho, ID, nombre opcional, cuenta y búsqueda.
  No deducir la cuenta de una referencia histórica por semejanza de nombres.
- Los cambios de textos quedan versionados. Una edición modificada después de
  aprobarla invalida esa aprobación para un encargo aún no enviado.
- En el lote, «Ver vídeo y editar textos» abre la referencia y permite guardar
  textos/tiempos solo para esa tarjeta. `text_custom` no modifica `texedicion`;
  la canción y su inicio permanecen separados. No presentar el original como
  previsualización de un nuevo render con los textos personalizados.
- El texto sigue adaptándose al montaje real mediante el motor existente. Este
  flujo no autoriza alargar vídeos ni imponer segundos fijos de CTA.

## Implementación y persistencia

- Backend: `EDITOR/lote_app.py`, API `/api/lote-app/`.
- Borradores: `NanoBanana/_LOTES_APP/batches.sqlite3` (SQLite WAL, revisión CAS).
- Encargos: snapshot JSON en esa carpeta y cola de `EDITOR/oficina.py`.
- Ediciones: almacén existente `NanoBanana/_TEXTOS_REFERENCIA/`; aliases estables.
- Pantallas: `PANEL/lote.html`, `library.html`, `text-editor.js`, `studio.css`.
- Shell/navegación: `PANEL/generate_panel.py`, `app-theme.css`.
- Edición anterior compatible en `montaje.html`, sin las secciones retiradas.

Las escrituras se serializan y comprueban revisión. El envío usa un identificador
estable: reintentar el mismo encargo no crea otros trabajos de Oficina.
No se han modificado las puertas de generación ni las autorizaciones de gasto.

## Cuentas ocultas de la app

Por orden del 13/09/2026: HERZPFOTE, FLAUSCHNEST y PLATTENZAUBER se ocultan de
Conceptos, Frames y selectores de lote/edición/equipo. La lista reversible está
en `PANEL/cuentas_ocultas.json`, aplicada por `EDITOR/app_accounts.py`.
No se eliminan assets, conceptos, prompts, numeración ni archivos históricos.

## Comprobación y límites

Pruebas: `EDITOR/test_lote_app.py`, regresiones existentes de textos/música/montaje,
`EDITOR/lote_app_e2e.cjs` contra el servidor aislado y
`EDITOR/lote_app_ui_probe.cjs` de solo lectura contra la app real.
Los ensayos de interfaz usan resultados simulados y un vídeo local existente;
no prueban calidad generativa ni gasto, y no ejecutan proveedores externos.

Este cambio implementa configuración, persistencia, revisión y despacho. No
demuestra que el detector reconozca cualquier vídeo sin errores, ni convierte
la preparación de planes en una producción automática autorizada. La lectura,
traducción y Oficina mantienen sus servicios y cuotas existentes. La carga por
enlaces depende de que la fuente sea accesible; no promete saltarse restricciones.

Las guías de mejora de procesos, diseño de sistemas y diseño visual se aplicaron
para separar configuración de ejecución, reutilizar la edición y mostrar solo
las decisiones necesarias. No sustituir esto por formularios nuevos por cada caso.

Relacionados: [[reglas/colaboracion-critica]], [[reglas/traduccion-organica]],
[[reglas/edicion-musica-texto-cta]], [[reglas/produccion-por-rondas]].
