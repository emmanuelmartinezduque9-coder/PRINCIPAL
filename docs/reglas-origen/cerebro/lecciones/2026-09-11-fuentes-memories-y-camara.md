# Corrección de Emmanuel: fuente original, Memories y POV amplio

La corrección F10 V3 utilizó como composición el media de V2, que ya había sido
rechazado. `estado_frames.json` conservaba una composición original antigua y por
eso no demostraba los inputs reales. El manifiesto y el registro de generación sí
mostraban la base defectuosa. El análisis independiente confirmó ese error.

Los tres originales RentierGlanz tenían resultados reales de Memories (caption y
ASR), pero no el análisis Q&A detallado con escenas/tiempos/acciones requerido. No
llamar a eso análisis completo ni sustituirlo por intuición. El MCP disponible y
el chat web tienen capacidades distintas; si una vía no sirve, informar y usar
la vía autorizada adecuada. Si se bloquea la subida, explicar el permiso exacto.

Además, los prompts heredados ordenaban close-ups/macros aunque una línea final
dijera no zoom. La orden posterior del usuario exige POV amplio en TODO Seedance
largo, incluso ampliando los planos de detalle del vídeo original.

Se añadió `EDITOR/integridad_previa.py`: fuente con ID/hash, bloqueo de bases
generadas sin aprobación, expediente del envío preparado, desglose de escenas
trazable y veredicto independiente antes del gasto. Cambiar prompt, referencias
o evidencias exige nuevo veredicto. Se conserva la revisión del MP4 después.
Los nuevos frames persisten también media/ruta/hash y prompt exacto. Para datos
históricos que carecen de esos campos, la identificación por contenido no puede
reconstruirse de la nada: cotejar originales visualmente, no declarar cobertura
retroactiva completa.

Pruebas reproducibles: `EDITOR/lotes/tanda_20260911/comprobar_integridad.py`.
Regla vigente: `CEREBRO/reglas/integridad-y-pov-amplio.md`.
