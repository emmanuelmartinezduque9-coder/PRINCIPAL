# Seedance largo: referencia de uso, no primer fotograma obligatorio

Orden de Emmanuel, 2026-09-08 21:48. Se aplica a futuros vídeos largos/multiescena de Seedance;
no se cambia ningún vídeo, frame aprobado ni prompt histórico por esta actualización.

La imagen que preparamos debe mostrar simultáneamente:
1. El artículo de la cuenta, con proporciones fieles a la referencia física disponible.
2. El avatar entregado por Emmanuel, reconocible; no inventar otra cara.
3. Una interacción comprensible entre ambos: sostener, usar, instalar o mostrar su uso.
4. El contexto/fondo de la acción, rediseñado con cambios concretos.
5. Una foto creíble de iPhone: piel/texturas reales, luz coherente y manos correctas.

Es una escena coherente, no un collage de fichas ni un panel de caras/productos. Si la historia
necesita contextos diferentes o detalles en escenas finales, preparar referencias adicionales
específicas cuando hagan falta. Una referencia no garantiza por sí sola la fidelidad de todas las tomas.

En `EDITOR/frame.py` declarar `uso_imagen: referencia_contextual`, los cinco textos de evidencia
en `criterios_referencia` (producto/avatar/interaccion/contexto/realismo) y `escena_inicial`.
Adjuntar artículo y cara reales por sus papeles cuando esa cara sea necesaria y visible.
Corrección de Emmanuel, 2026-09-09: en un POV no se adjunta un retrato para representar unas
manos. Si aporta una composición buena con las personas que deben mantenerse, se usa esa
misma identidad, sin retratos adicionales ni un intento rechazado como base. Declarar
`identidad_en_composicion` con `modo: pov`, `referencia` igual a `composicion`,
`autorizacion` y `representacion_visible`. Esto conserva las cinco evidencias y la revisión
visual; no autoriza a omitir personas visibles ni a inventar una cara. Mostrar la imagen
a Emmanuel para aprobación.

En `EDITOR/lanzar.py` el lote nuevo lleva `tipo_video: largo`, `uso_imagen: referencia_contextual`,
los mismos criterios y `escena_inicial`. `frame` sigue identificando la imagen aprobada por compatibilidad,
pero se envía como `image_references[0]`, NO como `start_image`. No adjuntarla otra vez como artículo.
El prompt explica en inglés que image [1] es una `contextual reference`; describe separadamente la
escena inicial y todos los movimientos/cortes. Si había una frase de «exact first frame», sustituirla
explícitamente y guardar la adaptación, sin reescribir la receta o la acción restante.

La regla de no adelantar un reveal rige el comienzo del VÍDEO, no esta referencia contextual que
debe mostrar el artículo. Los clips simples y Kling conservan su modo de frame inicial.
El modo contextual tiene validación para Seedance 2.5, resolución 480p y entrega escalada a 4K.
No convertir vídeos históricos al nuevo modo de manera implícita al regenerarlos.

La validación estructural no reemplaza la inspección visual: describir los cinco criterios no
demuestra que se cumplan. Las revisiones y límites de intentos existentes siguen aplicándose.

## Adaptación al nicho desde tutorial — 2026-11-05

Antes de nuevas réplicas Seedance con variante, consultar `/Volumes/T7/AUTOMATIZACION SEGA/MotorReplicaTests-20261105/tutorial-aplicacion.md`. Desglosar la acción completa por toma y adaptarla con referencias de entorno, vestuario y avatares congruentes con comprador, problema y mercado. Explicitar apertura, revelado, manipulación y presentación de las piezas exactas. Reservar espacio para textos posteriores 06B. Para nuevos tests prevalece la calidad vigente 720p y Topaz Theia 1080p con FPS originales sobre las cifras históricas anteriores.

## Escala de producto con mano — 05/11/2026
Leer `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/SEEDANCE_ESCALA_MANO_20261105.md`. En nuevas generaciones Seedance adjuntar referencias del producto con mano de escala, basada en evidencia real del producto original. Para calendarios, cada charm exacto con su propia referencia de mano; conservar originales. No inventar centímetros ni regenerar históricos.
