# Consumo, fidelidad del inicio y corrección local

Orden 19/09 18:43. Emmanuel señala 13% de uso del plan; no existe atribución medida
que permita convertir ese porcentaje en dólares de este lote. No prometer ahorro
porcentual sin comparación real. No ocultar fallos bajo más documentación.

## Evidencia del fallo
- Recibo c5a179d7-e379-49b6-b1cd-75079f7ec155: el prompt final dice sostener y
  mostrar junto al árbol; el original muestra recoger debajo. La simplificación
  cambió la acción. Se debe conservar verbo, origen y destino del objeto.
- f_nailuna_fila.txt pide adultos genéricos; ahora la orden concreta son mujeres
  jóvenes adultas saliendo de Müller. Esto no cambia el avatar de demostración.
- frames_nailuna_completo.json contiene seis referencias para secuencia larga;
  crear una por corte no es requisito de Seedance. Hay que cubrir necesidades,
  no multiplicar imágenes sin beneficio comprobado. Existía una referencia de
  fila: no afirmar que nunca se generó; revisar su utilización antes de atribuir causa.

## Cambio aplicado
production_brief.py produce un paquete de reanudación local compacto, sin red,
sin prompts largos, sin subagentes ni generación. Se prueba recuperación de IDs,
aislamiento de bloqueos, ausencia de prompts, y rechazo de históricos. No sustituye QA.
Usarlo al retomar; no releer todo el historial o repetir análisis ya disponibles.
Las dos correcciones actuales tienen inventario separado y dos frames iniciales.
No se autoriza modificar otras tomas, avatar restante, receta, música o texto.
No más de un intento nuevo por frame sin decisión de Emmanuel si hay defecto.
Una revisión independiente de ambos expedientes pequeños mantiene la puerta sin
duplicar contextos completos. Presentar ambos resultados tan pronto estén revisados.

## Medición honesta
Medir bytes de contexto recuperado frente a fuentes, trabajos nuevos y reutilizados.
Estos son indicadores de sobreprocesamiento; no equivalen al coste facturado de Codex.
Este cambio no resuelve por sí solo todo el consumo ni garantiza ausencia de fallos.
