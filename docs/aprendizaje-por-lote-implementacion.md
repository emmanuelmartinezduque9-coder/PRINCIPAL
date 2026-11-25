# Implementación de aprendizaje por lote — 25/11/2026

Backend implementado, sin editar la vista web. No se ha aplicado la migración a una base de datos ni se ha hecho commit. Las pruebas de integración quedan pendientes por el bloqueo de PostgreSQL embebido en el sandbox.

## Archivos

| Archivo | Cambio |
| --- | --- |
| `src/db/schema.ts` | Cuatro tablas, restricciones de valores, índices y claves únicas. |
| `drizzle/0062_aprendizaje_por_lote.sql` | Migración generada con drizzle-kit en la copia temporal sin archivos `._*`. |
| `drizzle/meta/0062_snapshot.json` | Snapshot generado. |
| `drizzle/meta/_journal.json` | Entrada de la migración 0062. |
| `src/server/products.ts` | Lectura de mercados por ids dentro de la capa de productos. |
| `src/server/videos/aprendizaje/contexto.ts` | Tipos de toma a partir de los sitios del desglose y Pinterest. |
| `src/server/videos/aprendizaje/senales.ts` | Captura histórica y tras acciones, fuentes deterministas, filtro de rechazos del sistema y cierre de aplicaciones. |
| `src/server/videos/aprendizaje/destilar.ts` | Haiku con Zod por pagador, elecciones sin IA, evidencia, refuerzos, contradicciones y ejecución idempotente con transacción y cerrojo. `runStep` conserva la respuesta ante un fallo posterior de persistencia. |
| `src/server/videos/aprendizaje/preferencias.ts` | Selección por ámbito, peso y paso; constancia de aplicaciones, primera decisión definitiva y retirada automática. |
| `src/server/videos/aprendizaje/medicion.ts` | Métricas y detalle por lote, permisos por creador/producto asignado y tipos para la vista de Claude. |
| `src/app/api/mejoras/aprendizaje/route.ts` | GET autenticado con el contrato de la vista. |
| `src/jobs/aprendizaje-jobs.ts` | Barrido cada minuto, diario `15 4 * * *` (UTC, como el registro existente) y trabajo `aprendizaje.destilar`. |
| `src/worker/main.ts` | Carga de los trabajos de aprendizaje. |
| `src/server/videos/analysis.ts` | Preferencias en las instrucciones del desglose. |
| `src/server/videos/frame.ts` | Directivas inglesas detrás de `learnedSuffix`, por sitio. |
| `src/server/videos/clip.ts` | Directivas inglesas al final del prompt, por sitio. |
| `src/server/videos/pinterest.ts` | Preferencias en planificación y selección, dentro de los pasos existentes. |
| `src/server/videos/doblaje.ts` | Bloque aprendido incluido también en el hash de la clasificación. |
| `src/server/videos/edicion-referencia.ts` | Preferencias de rótulos en instrucciones y caché; no registra su aplicación si se reutiliza una lectura antigua sin ellas. |
| `src/server/videos/cambio-montaje.ts` | Preferencias en las instrucciones del cambio de montaje. |
| `src/server/videos/generations.ts` | Captura tras rechazar/aprobar y fecha del rechazo aunque no hubiera resultado aprobado. |
| `src/server/videos/publications.ts` | Captura y fecha de las revisiones de montaje. |
| `src/server/videos/videos.ts` | Captura tras crear la tarjeta, cambiar sus elecciones/notas/adaptación y elegir canción; fecha de la elección musical. |
| `src/server/videos/batches.ts` | Captura tras guardar indicaciones de producto del lote y tras duplicar una tarjeta con notas. |
| `src/server/videos/lote.ts` | Captura tras responder y uso de elecciones preferidas disponibles en `autoAnswer`. |
| `src/server/videos/mejoras/reports.ts` | Captura después de guardar el reporte. |
| `src/server/videos/mejoras/classify.ts` | Segunda captura tras clasificar: permite excluir los reportes de «uso». |
| `tests/aprendizaje.test.ts` | Seis pruebas con BD y dos puras: ciclo completo, idempotencia/candidatas, variante, repetición/permisos, rechazo del sistema frente al dueño y retirada/resultado definitivo. |
| `docs/aprendizaje-por-lote-implementacion.md` | Este informe. |

No se han modificado `tests/boundaries.test.ts` ni `tests/flujo-automatico.test.ts`. Los cambios de la vista y `.claude/launch.json` pertenecen a otras sesiones.

## Claves de origen

- `gen:<id>:rechazo`.
- `res:<id>:aprobado` y `res:<id>:descartada`.
- `video:<id>:nota:<sha1>` y `video:<id>:adaptacion:<sha1>`.
- `lote:<batchId>:<productId>:notas:<sha1>`.
- `video:<id>:respuesta:<key>:<sha1>`.
- `report:<id>`.
- `video:<id>:montaje:<aprobado|rechazado>:<runId|editId|0>`.
- `video:<id>:eleccion:<variante|cancion|avatar>:<valor>`.

El SHA-1 se calcula sobre el texto original y se recorta a 12 caracteres. Los textos almacenados se limitan a 4.000 caracteres. Ejecuciones: `lote:<id>` y `dia:<YYYY-MM-DD>` en UTC. Preferencias de elección: `eleccion-<tipo>-<producto>`.

## Verificación y salida

`npm run typecheck`: código 0.

```text
> principal@0.1.0 typecheck
> tsc --noEmit
```

Segunda generación sobre la copia temporal: código 0.

```text
No schema changes, nothing to migrate 😴
```

Comando de integración solicitado, ejecutado con los ocho archivos:

```sh
npx vitest run tests/aprendizaje.test.ts tests/mejoras.test.ts tests/boundaries.test.ts tests/flujo-automatico.test.ts tests/edicion-referencia.test.ts tests/doblaje.test.ts tests/pinterest.test.ts tests/lote-automatico.test.ts
```

Resultado: código 1, antes de ejecutar pruebas. La preparación global no pudo arrancar PostgreSQL:

```text
Error: Postgres init script failed (code: 1, signal: null).
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(key=241692730, size=56, 03600).
```

Vitest también muestra «No test files found» al abortar esta preparación global; no es evidencia de ausencia de los archivos. No se consideran aprobadas las pruebas con BD ni la aplicación de la migración.

Para continuar sin BD se usó una configuración temporal en `/private/tmp/learning-vitest.config.mjs`, sin `globalSetup`, limitada a `boundaries.test.ts` y los casos puros de `aprendizaje.test.ts`:

```text
Test Files  2 passed (2)
     Tests  15 passed | 6 skipped (21)
```

Son 13 comprobaciones de arquitectura y 2 pruebas puras. Las seis omitidas son las nuevas pruebas con BD.

`npm run lint -- <archivos TypeScript tocados>`: código 0.

```text
src/server/videos/publications.ts
  2:39  warning  'isNotNull' is defined but never used
✖ 1 problem (0 errors, 1 warning)
```

La advertencia corresponde a un import anterior a estos cambios; no se modificó esa línea. `git diff --check`: código 0, sin salida.

## Decisiones de implementación

- Los reportes generales se capturan después de clasificarse, para no contar uno que después resulte ser «uso». La acción de crear el reporte invoca igualmente la captura. Los cambios pedidos en montaje se capturan de inmediato, incluso cuando su clasificación de Mejoras sea «uso».
- La función `learningByBatch` devuelve la lista por lote. El GET usa `learningView` para envolverla en `{ batches, videoProducts }`, con etiquetas y destinos de enlaces que necesita la vista que está creando Claude. `firstPass` es la proporción entre 0 y 1.
- Las elecciones se cuentan una vez por vídeo y tipo, usando su última señal; cambiar varias veces no infla los apoyos. Se registra la aplicación de una elección solo si su valor está entre las opciones disponibles.
- Para el ámbito de toma se reutilizan las descripciones de lugares ya persistidas; si no existen, `shot_type` queda nulo. No se añade otra clasificación de IA.
- Se conserva la reutilización de las lecturas de edición antiguas que ya establecía Mejoras. Sin preferencias ni correcciones, la clave sigue siendo la de antes.
- La verificación con BD y la aplicación real de la migración siguen pendientes; el sandbox no permite iniciar el PostgreSQL embebido.
