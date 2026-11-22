# Ejecución por rondas completas — 12 septiembre 2026

Orden posterior de Emmanuel: aplicar el rediseño; no iniciar otro lote durante la implantación.

1. Registrar TODO el encargo en `EDITOR/lote_control.py registrar inventario.json`:
   `id`, `pedido`, `replicar_ids` y `items` con `id`, `cuenta`, `nombre`, `tipo`
   (`regeneracion`, `frame`, `genjutsu`, `reutilizado`), `replicar_id` si corresponde.
   Incluye nuevos conceptos, adaptaciones y Replicar. N es fijo, no una selección parcial.
2. Tramitar las regeneraciones primero. Conservar sus vídeos sin esperar otra aprobación.
   Orden posterior de Emmanuel (13 septiembre): «el resultado de un video no puede
   parar toda la producción nunca». Un fallo terminal acreditado por el recibo del
   proveedor queda aislado en su vídeo y permite continuar los trabajos independientes.
   No equivale a generado, aprobado ni entregado; el lote continúa incompleto.
   No repetir automáticamente el intento ni cambiar su prompt. Las dependencias reales
   (por ejemplo, aprobar el frame de ese mismo clip) siguen siendo obligatorias.
3. Concentrar la generación en TODOS los frames de la ronda global. Incluir
   `lote_global` e `item_lote` en cada manifiesto. No pedir opinión de tres si faltan otros.
4. Solo cuando TODOS tienen archivo y media: `lote_control.py presentar ID`.
   La presentación no aprueba ni sustituye QA. Un error técnico se informa como tal,
   nunca se usa para fingir que la ronda está completa ni lanzar un reintento pagado.
5. Registrar decisiones de Emmanuel para cada frame exacto. Lanzar clips de aprobados;
   `corregir ID` abre la siguiente ronda de todos los rechazados, conservando historial.
6. Genjutsu no requiere Memories ni desglose de escenas. Desde el 29/09/2026 sí requiere
   frame inicial limpio aprobado: ver `genjutsu-frame-inicial-obligatorio.md`. El original define
   acciones, cámara y tiempos. El proveedor recibe un prompt breve de edición generado
   por código desde cambios estándar y assets; no un nuevo guion escrito por un agente.
   Se mantienen elección de avatar/sin avatar, producto visible y autorización de gasto.
7. Cada job aceptado se registra en `EDITOR/video_recibos` antes de esperar. Un servicio
   de solo consulta guarda original y prompt en concepto/clip/_GENERADOS/job y copia diaria.
   Guardado no es aprobado: conservar defectuosos no los convierte en entrega publicable.

Esta regla prevalece sobre la posibilidad anterior de pedir aprobaciones parciales y
sobre instrucciones antiguas de Q&A general. La app debe mostrar avance, no pedir opinión
prematura. Los prompts históricos no se reescriben y los muros de procedencia se mantienen.
