# Estudio visual multicuenta

Emmanuel pide navegación visual sencilla y producción para muchas cuentas.

Implementado: entrada por tarjetas de producto, acceso a clips/combinaciones/proyectos,
galería de ejemplos de ganchos agrupada por nombre (no análisis visual ni rendimiento),
tablero y creación idempotente de borradores en la cola existente de lote_app.
La adaptación conserva clip_sequence con cuenta/concepto/posición originales.
No genera al guardar, no modifica conceptos originales, no marca aprobaciones.

Dos operaciones distintas: guardar combinaciones reutiliza referencias a archivos;
adaptar a varias cuentas prepara nuevas generaciones de ambas piezas. No afirmar
que este segundo flujo ahorra la generación del cuerpo. No afirmar que exporta
ni que crea por sí mismo proyectos CapCut. Los textos del tablero son de prueba;
no transferir literalmente entre idiomas sin revisión/adaptación.

Pendiente: clasificación visual fiable, referencias de competencia y rendimiento,
adaptación selectiva con cuerpo reutilizado integrado a la entrega editable.
La revisión de frames y clips debe seguir las dos rondas agrupadas vigentes.
