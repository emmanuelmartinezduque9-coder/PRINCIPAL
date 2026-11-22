# Oficina y Memories API — 12 septiembre 2026

**Actualización posterior autorizada:** leer `controles-video-por-motor.md`.
Genjutsu no exige Memories; Seedance puede usar material API real sin Q&A nativo.
Esta orden sustituye el bloqueo por falta de Q&A descrito en el historial inferior;
no elimina revisión independiente ni permite falsear la procedencia.

Orden de Emmanuel: montar referencias/planificación, frames, clips y calidad
independiente. API primero; no controlar su PC para Memories teniendo API conectada.

## Implementación

`EDITOR/oficina.py` coordina `oficina_store.py` (SQLite, transacciones, dependencias,
reservas y eventos), `oficina_roles.py` (cuatro funciones acotadas) y
`oficina_runtime.py` (contextos Codex separados con autenticación local ChatGPT).
No crea nuevas tareas visibles en la barra lateral ni un agente por cada frame.
Las reglas se leen de las fuentes canónicas y sus hashes quedan en cada resultado.

La pestaña Oficina inicia preparación; no constituye por sí sola una orden de gasto.
Orden posterior del 13/09: cuando Emmanuel encarga generar/continuar el lote en el
chat, esa orden autoriza los pasos normales de producción sin preguntar otra vez
por créditos; aplicar `.cursor/rules/creditos-produccion-autorizada.mdc` y conservar
la evidencia. No interpretar un campo antiguo de preparación como ausencia de su orden.
El operador usa `gate_plan` y muestra el plan. `autorizar-plan` registra la instrucción
real de Emmanuel y el hash exacto antes de encolar el gasto. No inventar autorizaciones.
Frames pasan por frame.py; vídeos por lanzar.py; se conserva el bloqueo compartido
del registro antiguo. Un envío de pago incierto queda en conciliación, sin reenvío.
Una etapa completada no significa frame aprobado, vídeo conforme ni entrega final.
Calidad no hereda la conversación del autor. Debe recibir originales, resultado,
encargo y evidencia visual; sin ellos bloquea. Nunca firma la aprobación de Emmanuel.

## Memories: capacidad real, no lo que promete una skill antigua

`EDITOR/memories_api.py doctor` consulta el esquema VIVO de la API. A fecha de la
prueba, expone DataLake (subida, indexación, búsquedas, captions y transcripción),
pero NO `analyze_video` ni un endpoint Q&A de vídeo. La skill instalada describe
otra API. No asumir que una herramienta existe porque esté escrita en esa guía.

La lectura real del original RG012 devuelve un único párrafo para 14 segundos.
Queda etiquetada `memories_api_material`, `native_detailed_qa:false`. Eso NO cumple
la exigencia de análisis detallado ni pasa a `memories_qa` renombrándolo.
El cliente sube archivos por URL de almacenamiento, no mediante ventanas del PC;
guarda la sesión de subida en privado y un recibo limpio con ID/hash. Nunca ejecutar
comandos que devuelva un servidor remoto ni publicar claves/URLs firmadas.

Si falta Q&A nativo, bloquear esa dependencia e informar. No abrir automáticamente
la web ni sustituir por captions, ASR o un análisis inventado. La oficina puede
avanzar tareas independientes con prompts/registros ya completos. Cambiar a un
análisis compuesto por otro modelo requiere explicar esa diferencia a Emmanuel;
esta instalación NO relaja integridad_previa.py para hacer pasar material incompleto.

Fuentes: https://docs.memories.ai/overview ; https://docs.memories.ai/video-agent
Pruebas y recibos: `EDITOR/oficina_pruebas/`.
