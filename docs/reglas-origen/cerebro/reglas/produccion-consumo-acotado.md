# Producción con consumo acotado

Orden de Emmanuel, 19/09/2026: corregir el consumo de Codex sin resultados en el
lote del 18/09. El importe comunicado por el usuario es 30 USD; no hay desglose
de facturación por llamada disponible para atribuirlo exactamente.

## Ruta de trabajo

1. Retomar desde un estado compacto por lote: artefactos existentes, jobs,
   decisiones del usuario, próximo paso y bloqueo preciso. Verificar solo lo
   que pueda haber cambiado. No releer registros enteros ni reconstruir todo.
2. Clasificar ANTES de preparar: regeneración literal, cambio de frame,
   adaptación de cuenta, clip nuevo y reutilización. No etiquetar adaptaciones
   como literales: hace que controles ajenos bloqueen la producción.
3. Fuentes según tarea: una regeneración parte del concepto y prompt guardados;
   una captura define el cambio solicitado; un enlace de textos no se convierte
   en referencia de acción. No descargar ni analizar enlaces por defecto.
4. Reutilizar recibos, materiales y revisiones válidos por hash. Repetir solo
   cuando cambie la entrada relevante o exista un fallo concreto.
5. Un único coordinador. Revisores independientes solo donde se exijan, con un
   expediente pequeño y sin historial heredado. Un error de cuota no es una
   revisión: registrarlo, no multiplicar agentes/reintentos equivalentes.
6. Tras dos intentos de diagnóstico sin avance sobre el mismo bloqueo, registrar
   causa y acción necesaria; pasar al trabajo independiente autorizado. Si el
   programa impide avanzar, exponer ese bloqueo real. No seguir acumulando
   lecturas ni falsificar estados para abrir una puerta.
7. Cada ciclo termina en un resultado verificable: solicitud real enviada,
   archivo recuperado, revisión concreta o bloqueo localizado. Las explicaciones
   y planes no cuentan como producción. Actualizaciones breves solo con novedad.
8. Separar coste de Codex, generación y montaje. No atribuir dólares a llamadas
   sin recibos; no prometer un ahorro porcentual ni un tope de dólares que no se
   pueda imponer. No cambiar de modelo ni comprar créditos sin encargo.

Esto es una instrucción persistente de ejecución, no un limitador automático
de facturación. Guardar un resumen reduce relecturas; no borra el contexto de
una conversación ya extensa.

## Aplicación al lote 18/09

Estado de continuación: `EDITOR/lotes/app_20260918_59/CONTINUAR.md`.
Corregir primero la clasificación y el bloqueo global de las adaptaciones con
una migración trazable y validada, respetando controles de cada clip. No generar
los clips dudosos solo para desbloquear los frames independientes.
