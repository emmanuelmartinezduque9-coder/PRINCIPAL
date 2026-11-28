# Cuerpos automáticos

La biblioteca se sincroniza sin intervención desde el barrido de vídeo (worker, cada minuto). Por usuario activo con Higgsfield conectado se intenta actualizar como máximo una vez cada 30 minutos. Una reserva atómica en `settings` evita intentos simultáneos y limita también los fallos; se conserva la protección de 30 segundos de la actualización manual. Una conexión caducada no impide procesar las demás.

Al acabar `refreshLibrary` se encolan hasta 40 clips nuevos. El barrido recoge además los 40 pendientes más antiguos de toda la biblioteca, separados por propietario, para completar el historial existente y cualquier exceso de una sincronización. No hay botones ni confirmaciones nuevos. Es necesario tener el worker en marcha y aplicar las migraciones al desplegar.

`src/jobs/body-classifier.ts` registra y encola el trabajo; solo esta capa accede a la cola y a sus pasos. `src/server/videos/body-classifier.ts` consulta la biblioteca y guarda los resultados; el acceso a productos pasa por `listProductsFor`, y las fotos por la capa de fotos. Un cerrojo transaccional por usuario evita llamadas de visión concurrentes de su biblioteca. Cada llamada externa tiene un `runStep` persistente para reutilizar su respuesta si el proceso se interrumpe antes de guardar la clasificación.

## Clasificación

- Con `video_id`: se usa el producto del vídeo, incluidos los archivados visibles, sin llamar a Claude. El tipo `solo_gancho` se clasifica como gancho; los demás tipos, como cuerpo. La confianza es 100. La etiqueta de este camino es «Demostración del producto», pues no se analiza visualmente la toma.
- Sin vídeo: Claude, mediante `@/llm/gateway`, nivel `small`, compara grupos de hasta ocho clips con los productos activos visibles para el propietario. Recibe nombre, resumen y primera foto de artículo (incluye los mockups guardados como artículo), miniatura y hasta 300 caracteres del prompt. El prompt se trata como datos. La foto se envía en base64; las miniaturas utilizan las URL de la biblioteca.
- La respuesta exige todos los ids exactamente una vez, producto visible o ninguno, papel `cuerpo|gancho|otro`, confianza 0–100 y etiqueta española de 1–60 caracteres. Sin miniatura, la confianza se limita a 89. Sin productos activos se guarda ninguno sin llamar al gateway.

La migración `0069_cuerpos_automaticos` añade a `library_clips` `detected_product_id`, `classified_role`, `confidence` (entero 0–100), `classified_at` y `classification_method` (`video|vision`), y a `product_bodies` `auto` (false para todas las marcas existentes). Una clasificación sin producto también queda terminada y no se vuelve a pagar.

Solo un cuerpo con producto y confianza ≥90 se da de alta automáticamente. La clasificación y sus altas se guardan juntas en una transacción; la condición `classified_at IS NULL` evita sobrescribir resultados. El alta usa `ON CONFLICT DO NOTHING` sobre producto y clip: conserva nombre, autor y origen manual de cualquier cuerpo existente. No se borran marcas. Si se desmarca un automático, su clasificación queda y no se vuelve a añadir en el siguiente barrido.

## Presentación y límites

El selector compartido de lotes y tarjetas sigue consultando cuerpos por producto. Cada cuerpo incluye `accountName` (`instagram_account`) y `auto`, y muestra la cuenta y «Automático». La biblioteca recibe el producto detectado, filtrado por visibilidad, y lo muestra en la miniatura incluso cuando no tiene marca de cuerpo.

Una miniatura no permite verificar el movimiento completo del vídeo: la clasificación visual es una estimación, con umbral conservador. No se reclasifican automáticamente clips ya terminados cuando cambia una ficha o se añaden nuevos productos. Los clips pendientes se recuperan en el siguiente barrido tras un error; el gateway conserva sus controles de gasto y de saldo.

## Verificación

`tests/body-classifier.test.ts` cubre vídeo sin gasto, visión agrupada con gateway falso, producto desconocido, baja confianza, gancho, conservación de manuales, idempotencia y límite de 40. Las pruebas de biblioteca y cuerpos existentes siguen cubriendo permisos y selección. Ejecutar `npx tsc --noEmit -p .` y `npx vitest run`.

Resultado en el entorno de implementación: TypeScript sin errores y 13 pruebas de límites de arquitectura aprobadas. La ejecución completa de Vitest queda bloqueada en el arranque de PostgreSQL embebido por `listen EPERM: operation not permitted 127.0.0.1`; las pruebas que requieren base de datos no pudieron ejecutarse en este entorno.
