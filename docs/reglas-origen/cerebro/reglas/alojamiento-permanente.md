# Alojamiento compartido — 01/10/2026

Por petición de Emmanuel, no volver a anunciar Quick Tunnels como alojamiento.
Publicación persistente: `NanoBanana/_COMPARTIDO/cloud/deployment.json`.
Código desplegable: `NANO_CLOUD`; no publicar el repositorio de producción entero.
La interfaz compartida y réplicas públicas se sirven desde Sites/R2. Los envíos
se conservan allí hasta que el trabajador local los procese. No hay login público
por decisión explícita del dueño; la conexión del trabajador sí usa un secreto.

`EDITOR/cloud_bridge.py` solo admite rutas del gateway compartido. Su diario
durable no reenvía POST de resultado incierto: necesitan reconciliación. No
crear otra cola de generación; esta cola transporta las mismas solicitudes al
motor y chat existentes. Ninguna revisión visual queda aprobada por transporte.

El servicio `com.nanobanana.cloud` arranca al iniciar sesión y se recupera si sale.
`com.nanobanana.shared` mantiene los servicios locales sin crear nuevos túneles.
La web puede abrirse con el Mac apagado; generación, Codex, CapCut y cambios
pendientes requieren que el Mac y su sesión estén disponibles. Los catálogos
desconectados muestran la última copia. No prometer disponibilidad del 100%.

No revelar ni copiar a la web `cloud/connection.json`. Contiene la clave privada
del trabajador, no una contraseña que deban escribir Emmanuel o Sebastián.
Comprobaciones: `EDITOR/verify_cloud_hosting.py`; prueba de transporte sin
producción: `--offline-test`. El enlace vigente sale de la publicación confirmada,
nunca de la URL esperada antes de publicar ni de un túnel antiguo.
