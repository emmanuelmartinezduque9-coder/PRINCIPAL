# Creatomate: un 403 no demuestra falta de permisos

**Fecha:** 2026-09-08 · **Ámbito:** integración Creatomate, no generación de frames

**Qué pasó:** el cliente urllib recibía `403` con `error code: 1010` de Cloudflare.
La app lo convertía sin comprobarlo en «La clave no tiene acceso a este proyecto».
Con la misma consulta GET y un User-Agent descriptivo la respuesta pasó a la capa
de autenticación (401 para una clave inválida). No se envió ningún render.

**Regla:** identificar el cliente HTTP, distinguir rechazo de infraestructura de
autenticación y no afirmar una causa que el código de estado solo no demuestra.
Nunca devolver cuerpos externos que puedan contener claves; no validar conexión
mediante operaciones que consuman créditos.

**Control ejecutable:** `PYTHONPATH=EDITOR python3 -m unittest EDITOR/test_creatomate_app.py -q`.
Pruebas obligatorias: conexión solo GET; User-Agent presente; 1010 no atribuido al
proyecto; errores sin secretos; redirecciones sin reenviar credenciales; clave
previa conservada si falla la nueva. Estas comprobaciones pertenecen a la
integración, NO a la checklist visual de frames.
