# Meta de autonomía y aprendizaje — Emmanuel, 12 septiembre 2026

Estado: objetivo y criterios expresados por Emmanuel; NO acredita un sistema de
analítica conectado ni autoriza ejecución, publicación o gasto sin límites.
Procedencia: conversación del 12 septiembre, solicitud con captura 22.32.03 y
respuesta posterior a las preguntas sobre métricas y pilares.

## Meta confirmada

Emmanuel quiere reducir el trabajo humano a subir los vídeos terminados y después
delegar esa subida. El sistema debe seleccionar trabajo del día con resultados de
redes, regenerar o aplicar pilares según su criterio, editar con plantillas de
Creatomate y conservar las entregas. Quiere detección crítica proactiva de errores
y mejora técnica, no depender de que él señale cada fallo.

Ahora no usa ninguna herramienta de métricas. No se ha seleccionado ni contratado
un proveedor en esta conversación.

## Regla de selección confirmada

1. Probar un concepto nuevo.
2. Si viraliza, regenerar para comprobar si vuelve a funcionar.
3. Si la regeneración también funciona, aplicar pilares.
4. Un pilar confirmado: cambiar ligeramente el texto conservando su significado.

Otros pilares mencionados: fondo y música; la lista completa, magnitudes de cambio
y reglas para elegirlos siguen pendientes. No asumir que todos se cambian a la vez.

Regeneración sin cambios conserva el prompt exacto según [[reglas/regeneraciones-literales]].
Una variación de texto/música en montaje no equivale a regenerar un clip.
Cambiar el fondo exige normalmente editar o generar imagen/vídeo: no basta una
plantilla de texto. Son rutas de coste y validación diferentes.

## Criterios aún NO definidos

- Qué cifras, edad del post y comparación por cuenta significan «viralizó».
- Qué resultado de la regeneración confirma «vuelve a funcionar».
- Qué hacer si no confirma, cuántos intentos y cuándo abandonar/esperar.
- Si prioriza visualizaciones, comentarios de intención, clics o ventas atribuibles.
- Volumen diario, presupuesto de generación, presupuesto de pruebas y techo de reintentos.
- Catálogo completo de pilares, secuencia, restricciones y música autorizada.
- Qué aprobaciones puede delegar; las actuales siguen vigentes hasta nueva orden.

## Diseño propuesto, no activado

Publicación identificada → métricas por antigüedad → regla versionada → propuesta
de trabajo → generación/edición según ruta → revisión y entrega → resultado enlazado.

Conservar métricas crudas, variante, plantilla/versionado, prompt/hash, costes y
motivo de decisión en base de datos. Obsidian contiene reglas, decisiones explicadas,
experimentos y lecciones enlazados a las evidencias; no millones de notas de métricas.

Supervisión técnica propuesta: detectar errores y esperas, crear caso reproducible,
preparar parche aislado, ejecutar regresiones y comparar calidad/tiempo/coste. Activar
solo cambios de bajo riesgo con límites y reversión previamente acordados. No
autoeditar fuentes aprobadas, ampliar gastos ni suprimir verificadores.

No confundir correlación con causa: un vídeo exitoso no prueba que un texto concreto
lo causó. Experimentos comparables, por cuenta y red, con datos suficientes; ausencia
de métricas se conserva como desconocida, nunca como cero ni como fracaso.

Véase [[sistema/lecciones-aprendizaje-forzado]], [[sistema/techos-de-coste]] y
[[reglas/produccion-por-rondas]].
