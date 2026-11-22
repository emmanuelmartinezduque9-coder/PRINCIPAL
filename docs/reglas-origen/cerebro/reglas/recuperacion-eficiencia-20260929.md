# Recuperación y eficiencia — 29/09/2026

Orden de Emmanuel: reparar cola, depurar y mejorar eficiencia. No inventar una
causa ni atribuir corrupción a ChatGPT web sin evidencias.

## Cambios implementados
- `recovery_hold` detiene ejecución y cierre de históricos recuperados dudosos.
  Mantiene recibos/estados originales salvo cuatro entradas reconstruidas como
  bloqueadas desde planes y progreso. No retirar hold sin reconciliación.
- `queue_backup.py` usa la API de copia SQLite y valida integridad/JSON.
  El motor lo llama al arrancar; si falla no inicia workers. No es un backup
  externo ni cubre medios. Falta retención y copia fuera del equipo.
- `production_engine.py status ID` limita la consulta al lote solicitado.

## Preguntas
Antes de preguntar, leer snapshot, decisión vigente y evidencia del propio clip.
No volver a preguntar por créditos normales, 4K Topaz para Genjutsu 480p o
decisiones ya respondidas. Sí preguntar por frames nuevos, defectos visibles
válidos y cambios creativos no autorizados. No reutilizar aprobación por parecido:
solo si corresponde al archivo/fuente exactos y la puerta admite esa evidencia.
Explicar qué cambiaría el usuario en lenguaje sencillo; no pedirle diagnosticar
hashes, tickets, colas o manifests. Las correcciones técnicas autorizadas se ejecutan.

## Pendiente real
SQLite del Python del servidor es 3.51.0. Oficialmente el fallo WAL-reset está
corregido en 3.51.3+ (también backports). Es un riesgo, no causa demostrada.
Actualizar runtime en entorno aislado y pasar pruebas antes de sustituirlo;
no modificar el Python de macOS a ciegas.
La restauración estructural de cola NO verifica todos los medios ni termina lotes.
