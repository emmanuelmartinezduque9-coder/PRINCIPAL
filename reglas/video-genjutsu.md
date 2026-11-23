# Vídeo con Genjutsu y Wan 3.0 Prime

Reglas para escribir el prompt del clip cuando la réplica se genera editando el vídeo original: Genjutsu Motion Transfer, Genjutsu Object Swap o Wan 3.0 Prime. Copiadas de la skill de Genjutsu y de las órdenes del dueño que la acompañaban; cada orden lleva su fecha. Los prompts van en inglés; el habla que se pida, en el idioma de la cuenta.

## Qué elige la tarjeta (regla fija de Emmanuel, 24/11/2026)
Por defecto, la réplica se hace con Genjutsu Motion Transfer (ya era su orden del 29/10). Si Emmanuel elige otro modelo en la tarjeta del vídeo o en el grupo del lote, se usa ese; se conserva el modelo elegido y nunca se cambia para ahorrar créditos. Si Genjutsu no puede, lo resuelve la aplicación sola: un tramo de menos de 3 s va con Seedance, y un clip bloqueado por el filtro de Higgsfield rehace primero la imagen inicial sin cuadros ni pósteres con personas. La aplicación fija los parámetros (resolución 480p por defecto, el vídeo fuente entero, la duración entera del tramo en Wan, créditos normales): no escribirlos en el prompt.

## Objetivo
Adaptar un vídeo real al producto y avatar de la cuenta, preservando acciones, ritmo y lógica del original. Redactar instrucciones de edición, no inventar un guion nuevo.

## Los modos
- **Object Swap:** cambiar elementos identificados (persona, producto, ropa, fondo) y conservar el resto. Preferirlo cuando importe la fidelidad de producto y de la escena.
- **Motion Transfer:** recrear la escena con referencias nuevas conservando movimiento, cámara y tiempos. Mayor margen de cambio visual; comprobar especialmente color, forma y escala del producto. Usar Motion Transfer normal salvo selección expresa.
- **Wan 3.0 Prime:** vídeo fuente con referencias de imagen y prompt corto. Genera su propio audio.
- Respetar el modo elegido. No convertir automáticamente a Motion Transfer por pedir varios cambios visuales.

## El frame inicial es obligatorio (orden de Emmanuel, 29/09/2026)
«Los vídeos con Genjutsu no se hacen sin el frame inicial». Todo envío lleva una apertura limpia, derivada de la apertura original y adaptada a los assets y cambios autorizados, aprobada visualmente y adjuntada de verdad como referencia de imagen, identificada en el prompt. El proveedor no ofrece un parámetro de primer fotograma con referencias: no inventarlo ni prometer un anclaje exacto. El frame define la apertura visual; el vídeo fuente sigue definiendo acciones, cortes y tiempos. Un frame limpio no garantiza por sí solo que desaparezcan los textos de todas las tomas.

## Cómo se escribe el prompt
1. El vídeo fuente es la autoridad de todas las acciones, movimientos de cámara, cortes y duración. Decirlo al principio.
2. Relacionar cada imagen con su papel, citándola como «image [N]» con el número real que le da la aplicación: frame inicial aprobado, avatar, artículo, embalaje o entorno. Los números tienen que coincidir con el orden enviado, no con el orden de un ejemplo. Un avatar aporta identidad, no el fondo de su foto. No adjuntar ni citar imágenes que no existen.
3. Orden: fuente y acción que permanece → sustituciones y referencias → alcance en TODAS las tomas → invariantes → textos y audio.
4. Acciones que se conservan: describirlas con sus tiempos reales («keep every original cut and timing: …»). Si la mano vierte ingredientes, deben entrar por la abertura real, sin deformar la tapa para acomodar el gesto. Mantener los cortes y la geometría del artículo.
5. Producto: el artículo y el embalaje exactos de la cuenta y la variante, con su forma, piezas, colores y escala real en mano en cada aparición, también en los planos posteriores y parcialmente tapados. Si el artículo o la caja aparecen después y no se ven en el frame inicial, igualmente se adjuntan y se citan (orden de Emmanuel, 29/10/2026): conservar el vídeo fuente no exime de esa referencia. Mantener artículo y embalaje como papeles distintos. Mantener el producto legible a la escala de la mano original, sin añadir zooms ni primeros planos.
6. Personas y animales (orden de Emmanuel, 06/11/2026): en réplicas, sustituir las personas por la identidad elegida y mantenerla entre tomas; cambiar el vestuario con lógica del nicho y del entorno. Un perro real pasa a otro perro de raza distinta; un gato, a otro gato de raza y color distintos; no cambiar de especie salvo orden expresa. Si solo hay manos o POV, cero instrucciones de identidad. Sin sustitución, conservar las personas originales.
7. Textos: quitar desde el primer hasta el último fotograma todos los rótulos, subtítulos, emojis e interfaz de la fuente, reconstruyendo el fondo que tapan; conservar las letras físicas del producto y del embalaje. Terminar con «No text overlays, no captions.». Los textos nuevos se añaden después, en la edición.
8. Audio: en Genjutsu, pedir que se conserve el audio completo generado para la edición. Si la fuente tiene habla, conservar su sentido y sus turnos en el idioma nativo de la cuenta, sin inventar diálogo nuevo.
9. Estética: textura natural de vídeo de móvil, piel y pelo realistas, luz del lugar compartida y sombras de contacto; entorno legible con la profundidad de un móvil.

## Motion Transfer: sujeto y entorno
El frame aprobado fija la apertura y la adaptación visual. Escribir instrucciones concretas sobre qué movimiento conservar y qué cambiar de fondo, identidad o producto. Aplicar la misma identidad y el mismo entorno nuevo de forma coherente en todas las tomas, también después de cada corte. Mantener una apariencia normal de vídeo de móvil, coherente con el nuevo entorno.

Plantilla (rellenar solo cambios autorizados y quitar lo que no aplique): «Use the source video to guide the movement, camera trajectory, shot sequence and timing. Recreate the scene with [subject] from image [N] and [authorized setting]. Apply the same subject identity and requested setting consistently across all shots, including shots after each cut. Preserve the exact [product] design and color from image [N], its scale and its interaction with the subject. Keep the original [specific essential action] complete from start to finish. Maintain an ordinary phone-video appearance consistent with the new surroundings. Remove added text overlays throughout; preserve physical product labels.»

## Object Swap adaptado al producto (preferencia de Emmanuel, 22/09/2026)
No limitarse a sustituir el producto: adaptar el entorno, la decoración, los textiles y el avatar elegido al contexto de la cuenta, con apariencia natural. Un encargo explícito «solo cambia X» prevalece y conserva todo lo demás. Resolver un mapa por toma:
- Producto visible → artículo o embalaje correcto, incluidas las apariciones posteriores.
- Protagonista → avatar elegido cuando corresponda; no cambiar identidades secundarias sin encargo.
- Entorno → lugar compatible con el producto y la acción; sustituir decoración ajena, mobiliario y textiles reconocibles por un conjunto propio coherente.
- Conservar → demostración, contactos, ocultación y destape, cámara y ritmo original.

«Cambiar todo» significa adaptar los componentes visuales relevantes, no inventar otra acción, alterar la forma del producto ni añadir personas. Navidad no implica oscuridad, saturación fuerte ni una dominante naranja.

Plantilla: «Use the source video as the reference for the original actions, camera, shot order and timing. Replace the visible [specific product] with the exact product in image [N] in every shot where it appears, including subsequent close-ups and partially occluded appearances. Preserve its reference color, shape and physically consistent scale relative to the hands. Replace [specific person] with the person in image [N]; use that image for identity only. Preserve the original gestures, gaze and interactions. Remove added captions and floating graphics throughout, while retaining the physical branding on the replacement product.»

## Fondos en Object Swap y Wan 3.0 Prime (orden de Emmanuel, 17–18/11/2026)
Sustituir todos los entornos originales, con una imagen de referencia por entorno distinto, compartida entre las tomas del mismo lugar: agrupar por lugar real, no por nombre de clip. La imagen de entorno aporta solo el lugar, no la posición de cámara ni los sujetos: conservar el ángulo de cámara, la escala del sujeto y la acción de la fuente, adaptando ese entorno en vez de copiar su encuadre fotográfico. La aplicación añade al final del prompt la frase que vincula la imagen de entorno elegida sola; no citarla antes de que exista.

## Wan 3.0 Prime: prompt corto (órdenes de Emmanuel, 15/10 y 18/11/2026)
Las mismas reglas de fondos y de eliminación de textos que Object Swap. Frases breves y directas con los cambios concretos: sujeto y sustitución, entorno, idioma, producto. No aplicar los bloques estéticos de Genjutsu o Seedance. Describir solo los cambios, no reconstruir el vídeo con listas de muebles, luces y colores. Sin petición específica, variar el diseño de los mismos escenarios y conservar los objetos necesarios para la acción (por ejemplo, la nevera); no convertir cocina, nevera y dormitorio en un único dormitorio. Acciones y cambios ordenados por toma, con la correspondencia exacta de adjuntos y lo que se conserva. Usar los assets de producto y embalaje cuando correspondan a lo que se ve. El habla existente se traduce al idioma nativo de la cuenta conservando sentido, tono y tiempos; no añadir diálogo.

Ejemplo que le funcionó a Emmanuel: «cambia el fondo por una habitación más moderna con decoración navideña». No convertirlo en plantilla universal.

## Casos que debe resolver
- Cambiar únicamente el perro: Object Swap; no cambiar el sofá ni añadir foto de fondo.
- Cambiar sujeto y habitación con Object Swap elegido: aplicar la adaptación de producto y las referencias de entorno; no cambiar de modo en silencio.
- Fondo cambiado solo en algunas tomas: declarar el alcance en todas y revisar cada corte, no solo la portada.
- Clip de cuenta atrás: conservar el gesto y la secuencia visibles en el vídeo; no importar por defecto el proceso de Seedance.

## Revisión
Comparar original y resultado en cada corte: misma acción completa, sujeto consistente, producto y escala, sustituciones en todas sus apariciones, fondo pedido, texto residual y audio real. Adjuntar referencias mejora el control, pero no garantiza la fidelidad. Una salida válida con defectos no se regenera por decisión propia: se describe el defecto y decide Emmanuel.
