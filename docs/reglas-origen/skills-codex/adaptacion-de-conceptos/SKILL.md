---
name: adaptacion-de-conceptos
description: Adaptar el concepto de un vídeo viral de referencia al producto elegido por Emmanuel, conservando su lógica visual y comercial y reconstruyendo la demostración para el funcionamiento real del nuevo producto. Usar también para plasmar una idea propia mediante acciones visibles y estructuras de prompts con imágenes aprobadas, o trasladar una comparación, situación, gancho o estructura de otro producto; no confundir con réplica literal, variación de texto ni búsqueda de nuevos productos.
---

## Revisión de frames — orden posterior09/11/2026
Para trabajos de Emmanuel, no exigir revisores creativos de prompts o salidas de frames antes de mostrarlos: Emmanuel los aprueba. Preparar a partir de referencias reales y conservar controles técnicos, archivos y aprobación humana antes de clips. Esta orden sustituye requisitos anteriores de revisión creativa independiente de frames, pero no la revisión final de vídeo. Ver `memory/context/automatizacion-ligera-20261109.md` del proyecto.


# Adaptación de conceptos

## Idea visual y estructura de prompts comprobados
Cuando Emmanuel describa una idea amplia o detallada, leer [idea a prompt](references/idea-a-prompt.md). Convertir cada instrucción en estados y acciones visibles, recuperar estructuras de prompts con imágenes aprobadas y adaptar su arquitectura a la idea actual. Conservar la nota literal y un mapa de cobertura; no copiar escenas ni restricciones incompatibles. Esta capacidad también se aplica a Crear desde cero, junto a generacion-de-videos-por-idea, aunque no exista un vídeo viral.

## Qué se transfiere
El vídeo de referencia aporta una idea que el espectador entiende: contraste, problema–solución, sorpresa, ritual, regalo, antes/después u otra relación concreta. El producto elegido determina las acciones y el resultado. Adaptar no es sustituir un objeto o su nombre mientras se conserva una demostración incompatible.

Aplicar a cualquier categoría de producto, sin imponer trenes, Navidad, parejas, niños o una estructura fija. Respetar el concepto y las decisiones expresas de Emmanuel. Si se recibe referencia + producto, resolver el resto desde sus fichas y reglas, sin exigir que él escriba el guion. Leer [ejemplos reales y errores](references/ejemplos-reales.md) antes de la primera adaptación; distinguir lo observado, lo comunicado por Emmanuel y lo propuesto.

## Entender antes de preparar
1. Recuperar producto exacto, variante, cuenta, mercado, público, uso, assets y límites de la ficha vigente. Ver demostraciones reales cuando haga falta entender el mecanismo. No inventar funciones, transformaciones, eficacia o tiempos reales a partir de una generación anterior. Si la ficha y las instrucciones se contradicen en algo esencial, resolverlo antes de producir.
2. Si existe vídeo de referencia, verlo completo, incluyendo audio, texto, acciones y cierre. Para una idea propia sin vídeo, partir de las instrucciones y referencias disponibles; no exigir una URL ni inventar que se observó una fuente. Registrar URL, archivo/hash cuando se descargue, tiempos y evidencias. Una miniatura, transcripción o resumen no acredita análisis visual. Si no es accesible, recuperar una copia ya guardada; no afirmar que se vio.
3. Explicar internamente en una frase **qué hace comprensible y atractivo el concepto**. Ejemplo: «En la misma situación, una persona sufre el problema y otra lo resuelve con el producto». Separar ese mecanismo de los detalles incidentales: color de asiento, almohada concreta, ropa o país.
4. Identificar qué es necesario conservar para que siga siendo ese concepto: papeles de los personajes, contraste, simultaneidad o secuencia, gesto inicial, revelado, relación causa–resultado, ritmo y cierre. No reducir todo a “problema–solución” si la referencia funciona por otra lógica.

## Traducir la lógica en acciones
Preparar una tabla breve por momento del vídeo: **tiempo/función original → visual observado → equivalente para el producto elegido → acción física → resultado visible**. Marcar qué se conserva y qué cambia, y por qué. Los tiempos de origen orientan el ritmo; no obligan a comprimir una acción imposible.

- Cambiar el problema por uno que el producto realmente aborde, con una señal visible que el comprador reconozca. El entorno debe hacer plausible ese problema y el uso del producto.
- Conservar los papeles narrativos. En una comparación simultánea, la persona con la alternativa sigue mostrando el problema mientras la otra demuestra la solución. No convertir ambas en usuarios del producto ni resolver el problema del personaje que sirve de contraste.
- Especificar entrada, contacto/manipulación, progreso y estado final de cada acción. Conservar identidad, manos, producto, orientación y objetos necesarios entre planos. La transformación debe ser legible y coherente con el uso; no aparecer por teletransporte.
- Mostrar el beneficio completo que se está prometiendo visualmente. Si es peinar toda una melena, dos mechones frontales no bastan; si es derretir chocolate, empezar ya con líquido oculta el mecanismo. Dedicar tiempo al resultado y eliminar gestos repetitivos que no aporten información.
- El resultado deseado no acredita capacidad real del artículo. No representar una velocidad, eficacia o uso no sustentado como demostración real. Distinguir un montaje condensado de un proceso instantáneo.
- Adaptar texto, guion y CTA solo donde cambie producto, función, marca, mercado o sentido. Conservar el gancho que siga siendo pertinente; no reemplazar un CTA probado por otro arbitrario. Texto y visual deben describir lo mismo.

Antes de prompts, comprobar: **si ocultamos el texto, ¿se entiende el mismo concepto con este otro producto? ¿Se ve cómo funciona y por qué interesa?** Si solo funciona leyendo una promesa, falta una demostración visual.

## Escena, referencias y motor
Usar `fondos-pinterest-por-toma` cuando corresponda a la selección: primero producto y propósito de la toma, luego fondo real coherente con país y situación. Una referencia aportada o conservación expresa prevalece. Cambiar personas, vestuario y entorno conforme a las reglas vigentes, sin perder la composición funcional. No inferir nacionalidad por rasgos físicos.

Usar `generacion-de-videos-por-idea` para desarrollar las nuevas acciones en tomas; esta skill aporta el mapa de adaptación, no crea otro ejecutor. Aplicar las skills de imagen/vídeo vigentes y adjuntar producto, embalaje, identidades y escala física cuando proceda, verificando el payload real.

Elegir motor por la acción: transferencia de movimiento cuando la acción original siga siendo válida; generación dirigida cuando haya que reconstruir el funcionamiento. Ejemplo: la comodidad de una almohada no contiene las acciones de peinarse; copiar ese movimiento con otro objeto no demuestra un cepillo. Respetar selección expresa y capacidades reales, sin cambios silenciosos de modelo. No fijar aquí modelos, resolución o tipografía que puedan quedar obsoletos.

Mantener estética orgánica de móvil: movimiento humano natural, fondo legible, luz del lugar, piel y contacto realistas. No confundir calidad con desenfoque cinematográfico. Frames y clips sin overlays editoriales; textos en edición. No acelerar o ralentizar el montaje para encajar texto: sincronizar el texto con la acción/habla y aplicar las reglas de ritmo de la cuenta.

## Ejecución y revisión
Consultar notas, música y archivos antes de preguntar. Reunir solo dudas esenciales no recuperables en un bloque inicial. Buscar la canción mediante comparación del audio real con la biblioteca cuando corresponda; respetar elecciones explícitas. No escoger por azar ni afirmar escucha a partir de una coincidencia técnica.

Encargo de concepto no autoriza automáticamente generar o publicar. Si la producción está encargada, utilizar el motor y expediente existentes, reconciliar solicitudes aceptadas/inciertas, presentar los frames requeridos según el flujo vigente y, tras aprobación, continuar clips, upscale y edición sin nuevas preguntas creativas. No crear colas alternativas. Aplicar el límite de reintentos vigente; conservar intentos y errores, sin declarar cumplido lo que falla.

Revisar el resultado real contra **referencia + instrucciones + funcionamiento**, no solo contra el prompt:
- ¿Se conserva la lógica que se quería adaptar y se reconoce el problema del nuevo producto?
- ¿Cada personaje mantiene su papel y el entorno ayuda a entender la situación?
- ¿Se ve el producto exacto, con escala, contacto y manejo coherentes?
- ¿El beneficio completo se ve y se mantiene en el cierre, sin volver al estado defectuoso?
- ¿Hay cortes, desapariciones, cambios de forma o tiempos muertos que rompan la demostración?
- ¿Texto, música, voz y CTA cumplen las reglas de edición y el mercado?

Registrar observaciones y limitaciones honestamente, incluidas las revisiones independientes exigidas por el proyecto. Una nota de “aprobado” del prompt no valida el vídeo. No inventar escucha, aprobación humana, viralidad ni ventas. Separar calidad creativa, aprobación del usuario y rendimiento comercial.

Guardar en el expediente: referencia original, mapa de adaptación, producto/variante/mercado, decisiones y fuentes, prompts y adjuntos finales con hashes, jobs, revisión de cada salida y enlace del final. Entregar por cuenta/idioma con descripción adaptada cuando esté encargada, conservando versiones anteriores. No modificar otros pedidos ni publicar sin autorización.
