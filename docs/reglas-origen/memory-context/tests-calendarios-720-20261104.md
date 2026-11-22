# Tests: calendarios, tarjetas y 720p — 04/11/2026

Orden de Emmanuel: aplicar a nuevos tests; conservar snapshots, jobs y aprobaciones anteriores.

- Calendarios de adviento: usar la misma caja y figuras reales. Marcar Calendario de adviento, cargar caja y exactamente tres charms distintos. Las referencias se conservan con hashes en cada encargo; la caja y los tres charms deben adjuntarse a todos sus clips. No inventar figuritas ni personalizar el calendario. Preparar mockups fieles si procede, conservando fuentes; mostrar el conjunto al cierre cuando corresponda a la acción solicitada.
- Duplicar tarjeta conserva países, modalidad, ganchos, canciones y referencias. Genera ID nuevo y copia verificada de las imágenes, sin recibos ni envío automático.
- Imágenes de referencia: selección múltiple, hasta 12; identificar Producto, Caja, Charm fijo o Escenario. No confundir referencia con aprobación del frame.
- Nuevos tests: generación 720p para Genjutsu y Seedance. Topaz Theia 1080p, FPS originales. Prevalece sobre el default480 anterior. No alterar calidad de históricos ni otras configuraciones.
- HüpfPanda: alta solicitada; assets existentes del pedido chat-alta-403f0ec07b68cc01a1510aa780692bc8, embalaje alemán corregido6c36b65f. Cuenta HUPFPANDA disponible para nuevos lotes.

Implementación: product-tests.js, product_test_intake.py y product_test_admission.py. Contrato720 persiste en snapshot y se hereda al preparar clips; se valida contra el padre. Adjuntos obligatorios comprobados por hashes en la admisión de clips.

Verificación: 12 pruebas focalizadas pasan (copia aislada y bytes, falta/duplicado de charms, identidad padre, roles, hashes alterados, modalidad, idempotencia y720 en ambos motores). La suite histórica amplia tiene fallos previos por API antigua ausente y entorno de mantenimiento; no se declara esa suite satisfactoria. Pruebas sin llamadas a proveedor, sin generar ni reenviar pedidos. UI activa comprobada: controles calendario/referencias y duplicación visibles y tarjeta duplicada creada. Esta verificación no acredita calidad visual de futuras generaciones.

Topaz: actualizado upscale.py para fuentes Genjutsu720 nuevas desde04/11; conserva480 e históricos. video_resolution hereda upscale_policy del item inmutable. Seedance no toma la exención720 antigua si el nuevo test exige Theia1080. Comprobados elegibilidad temporal y enrutado Seedance sin llamar proveedor.
