# Vídeo con Seedance 2.5

Reglas para escribir el prompt del clip y para preparar las referencias que lo acompañan. Las órdenes del dueño llevan su fecha. Los apartados marcados como «criterio de la investigación del 22/11/2026» vienen de las notas de investigación sobre Seedance 2.5 y se apoyan en guías de la comunidad y en las plantillas del propio Higgsfield: son criterio de trabajo, no órdenes de Emmanuel ni garantías del modelo.

## Configuración del clip
Seedance 2.5 a 480p, con `bitrate_mode` en `high`, formato 9:16 y modo `omni_reference`, por orden de Emmanuel (07/09/2026). La aplicación fija esos parámetros, la duración y el audio: no escribirlos en el texto del prompt. La resolución NO se sube jamás para «mejorar».

Por qué `bitrate_mode` en `high`: la web de Higgsfield daba mejor calidad que la API «con los mismos parámetros», pero no eran los mismos. La web envía `bitrate_mode=high` (8,1 Mbps medidos con ffprobe el 01/09/2026) y la API por defecto usa `standard` (5,1 Mbps), ambos a 720×1280. Un 60 % menos de datos por segundo es la textura lavada que se veía.
## Escala de producto con mano (orden de Emmanuel, 05/11/2026)
En las generaciones Seedance, las imágenes de referencia de producto deben mostrar el producto comparado con una mano humana, para fijar la escala real. Una imagen aislada sin escala no basta. Conservar también el asset canónico original.

Para variantes creadas a partir de un producto existente, observar primero el producto sostenido por una mano en el vídeo o la foto real de la cuenta de referencia. Transferir esa proporción a la nueva variante, conservando el diseño propio aprobado. Indicar la fuente, el fotograma o el tiempo y qué se observó; no inventar centímetros ni tratar una estimación visual como una medición física certificada. La mano y el artículo deben estar en el mismo plano y perspectiva, con agarre y contacto naturales, tamaño adulto coherente y diseño visible. Si la aplicación no entrega una foto del artículo en una mano, decirlo; no suplirla con una escala inventada.

Calendarios de adviento: una referencia individual de cada uno de los tres charms exactos con mano de escala, junto al embalaje exacto y los demás inputs necesarios, respetando los límites reales del modelo. No usar la ilustración de la caja como autoridad de detalles del charm ni transferir números de puertas a las figuras.

Una aprobación de movimiento y calidad no sustituye a las referencias de tamaño: aunque un resultado guste, las imágenes del producto deben llevar la escala de mano observada en la cuenta de referencia (así lo pidió Emmanuel con HoofHolly).

Seedance siempre con producto exacto y escala real en mano. Producto, embalaje y variante exactos; luz, escala, perspectiva y contacto integrados.

## Sin texto en pantalla (orden de Emmanuel tras WichtelWitz, 30/10/2026)
Las imágenes y los clips nuevos no deben incluir captions, subtítulos, emojis ni interfaz copiados de la referencia. Conservar los textos físicos de embalajes y señales. Comprobar que el prompt final no pide texto en pantalla. Los textos editoriales se añaden después como capas separadas con fondo transparente, en la edición. Prohibido cubrir un texto incrustado con paneles negros, rectángulos opacos o parches sin petición expresa: un resultado que conserva texto tiene un defecto y no se declara verificado.

## Personas y vestuario en las réplicas
Personas y vestuario distintos en las réplicas salvo conservación expresa. Animales: variar raza y aspecto sin cambiar de especie salvo orden expresa. Adjuntar las referencias de identidad requeridas a la imagen y al vídeo.

## La imagen: primer fotograma o referencia contextual (orden de Emmanuel, 08/09/2026)
**La aplicación indica en cada encargo qué modo corresponde a este clip; no lo decide el modelo.** Hay dos:
- `primer fotograma` (clip de un solo plano): la imagen aprobada es el fotograma de partida. En el prompt se describe solo el movimiento y la cámara, no lo que ya se ve en esa imagen.
- `referencia de contexto` (vídeo de varias escenas): la imagen aprobada es la primera de las referencias de imagen, no un primer fotograma obligatorio. En el prompt se explica que esa imagen es una referencia contextual (`contextual reference`), se describe por separado la escena inicial y se describen todos los movimientos y cortes. No escribir «exact first frame».

Esta imagen debe mostrar a la vez:
1. El artículo de la cuenta, con proporciones fieles a la referencia física disponible.
2. El avatar entregado por Emmanuel, reconocible; no inventar otra cara.
3. Una interacción comprensible entre ambos: sostener, usar, instalar o mostrar su uso.
4. El contexto y el fondo de la acción, rediseñados con cambios concretos.
5. Una foto creíble de iPhone: piel y texturas reales, luz coherente y manos correctas.

Es una escena coherente, no un collage de fichas ni un panel de caras y productos. Si la historia necesita contextos diferentes o detalles en las escenas finales, preparar referencias adicionales específicas. Una referencia no garantiza por sí sola la fidelidad de todas las tomas.

Corrección de Emmanuel, 09/09/2026: en un POV no se adjunta un retrato para representar unas manos. Si una composición buena ya incluye a las personas que deben mantenerse, se usa esa misma identidad, sin retratos adicionales ni un intento rechazado como base. Esto no autoriza a omitir personas visibles ni a inventar una cara.

Adjuntar el artículo y la cara reales por sus papeles cuando esa cara sea necesaria y visible. Nunca se adjunta otra vez la imagen aprobada como si fuera el artículo: ya va con su papel de primer fotograma o de referencia de contexto.

La regla de no anticipar un reveal rige el comienzo del VÍDEO, no esta referencia contextual, que debe mostrar el artículo. Describir los cinco criterios no demuestra que se cumplan: ni un aprobado automático ni la descripción en el prompt valen como comprobación; hay que mirar el resultado.

## Movimiento, tomas y entrada (guía de generación por idea)
- Usar el movimiento del vídeo de referencia solo cuando reproduce la acción necesaria. Si la mano debe usar el producto de otra forma, diseñar la toma con sus propias imágenes y describir la acción nueva.
- Una acción por toma, encuadre de móvil y fondos legibles.
- Entrar con el gesto ya empezado y cortar cuando el espectador entiende su consecuencia.

## Adaptación al nicho a partir de un tutorial (05/11/2026)
Antes de nuevas réplicas con variante, desglosar la acción completa por toma y adaptarla con referencias de entorno, vestuario y avatares congruentes con el comprador, el problema y el mercado. Explicitar apertura, revelado, manipulación y presentación de las piezas exactas. Reservar espacio para los textos posteriores.

## Cómo se escribe el prompt (criterio de la investigación del 22/11/2026)

### Etiquetas de referencia
- Seedance une los archivos subidos con su papel mediante etiquetas con `@`: `@Image1…`, `@Video1…`, `@Audio1…`.
- En Higgsfield la forma canónica es exactamente `@Video1` y `@ImageN`: distingue mayúsculas, sin espacio, nunca `@video1` ni `@image1`. La numeración sigue el orden en que la aplicación entrega las referencias. Nunca poner identificadores ni direcciones de archivos en el prompt.

Reglas para escribir el papel de cada referencia, coherentes en todas las fuentes leídas:
1. **Dar a cada referencia un único trabajo, con palabras.** «Referencia el movimiento de cámara de `@Video1`», nunca solo «referencia `@Video1`».
2. **Añadir exclusiones** para lo que pueda contagiarse: «No usar la identidad, la ropa ni la escena del vídeo». «No usar el fondo de la imagen».
3. **Atar cada sujeto por separado**; nunca «`@Image1`–`@Image4` son cuatro personajes respectivamente».
4. **No volver a describir lo que la imagen aprobada ya muestra** (personas, producto, entorno): describir solo movimiento y cámara. Esto no se aplica a las acciones del producto nuevo: se escriben siempre completas, porque la acción se reconstruye para ese producto (ver la regla «Adaptación de conceptos»). Del vídeo de referencia se dice qué atributos hereda (ver 7), nunca sus personas, su producto ni sus movimientos exactos.
5. **Repetir la etiqueta** de un recurso importante varias veces a lo largo del prompt: se dice que sube la precisión.
6. Puntos de estabilidad (atribuidos a la guía oficial): 1–5 sujetos por vídeo de referencia, **clip de referencia de 5–10 s**, 1–8 sujetos entre las imágenes, imágenes separadas por vista mejor que un collage.
7. La imagen manda sobre el aspecto completo (cara, pelo, complexión, ropa, accesorios); `@Video1` aporta solo el orden de los planos, el ritmo de los cortes, la cámara y el tipo de acción.

### Varios planos y tiempos en una generación
- Marcadores de corte explícitos producen planos separados en un solo clip: `Plano 1.` / `Corte a.` / `Corte de cámara a.`
- Ventanas de tiempo: `0–3 s: …`. En 2.5 se respetan como tiempos.
- Reglas atribuidas a la guía oficial de 2.5:
  - Un rango es el **presupuesto de tiempo** de un suceso, no un punto de edición; rangos consecutivos y sin solaparse.
  - **Ventanas de 3 s o más**; las más cortas se ejecutan sin fiabilidad.
  - **Una acción central y un movimiento de cámara por ventana.**
  - Indicar el **estado final visible** de cada etapa.
  - Mejor un disparador que los segundos sueltos: «Tres segundos después de que pulse el botón…».
  - Duración, formato y resolución son parámetros de la API, **no texto del prompt**.
- En los clips virales de producto (plano mediano de unos 2,3 s) hará falta pedir planos de menos de 3 s y comprobarlos; es una inferencia, no una garantía.
- Guía anterior de 2.0: máximo unos 5 planos por generación; 2–3 planos por 5 s; dividir historias más largas en generaciones separadas.
- Bloque contra el «plano único continuo» para poner al principio del todo cuando los cortes salen emborronados: «Esto debe ser una secuencia claramente montada, de varios planos, con cortes visibles entre ellos. No generar una sola toma continua. Cada plano tiene un ángulo de cámara y un encuadre distintos.»
- Prohibición fiable: «Vídeo puro, sin subtítulos, sin música de fondo.»

### Cámara y acción
- Se entienden sin traducir: plano muy general / general / medio / primer plano / primerísimo primer plano; push in, pull out, pan, travelling lateral, seguimiento, órbita, dolly out, tilt, cámara en mano; picado, cenital, primera persona, plano secuencia.
- Para algo más raro: `término + sujeto + cambio visible + relación primer plano/fondo + dirección o velocidad`. Se admiten milímetros de objetivo, pero lo que dirige es el resultado visible en palabras.
- Por plano, la plantilla de Higgsfield especifica: **objetivo (mm), posición de cámara según el decorado y las personas (no «izquierda/derecha del encuadre»), altura, movimiento con dirección y velocidad, qué llena el encuadre, qué hay detrás del sujeto y el momento que recoge el plano.**
- Una órbita completa u otro movimiento grande necesita unos 4 s.
- Nunca nombrar el equipo de cámara ni «la cámara» como objeto de la escena: apareció un trípode en una prueba.
- Seedance empuja un ángulo más allá de lo escrito («tres cuartos desde detrás de su hombro» volvió como su espalda).
- Acción: una microacción por pulso, escrita como un hecho físico; encadenar consecuencias («la mano agarra el bote → la tapa realmente se desenrosca»). Añadir `realistic hands` al manejar el producto. No combinar caminar con una manipulación fina del producto en un mismo pulso.

### Conservar la geometría del producto y la identidad del avatar
- Fijar producto y persona **por separado**, cada uno con su(s) referencia(s). Descomponer el producto en partes (forma, tapa, posición de la etiqueta, material, color, proporciones).
- Dar varias vistas del producto como imágenes separadas (frontal, lateral, trasera, en mano a escala), y un primer plano del logo o de la etiqueta.
- Restricciones explícitas recomendadas: «mantener fija la posición del logo y las proporciones del envase; no inventar ni redibujar el texto de la etiqueta; sin reflejos deformados; rígido, sin deformación blanda; se mantiene pegado a la palma, sin atravesar los dedos».
- **No mantener un plano macro sobre el texto impreso de una etiqueta** ni pedir al modelo eslóganes o captions: la tipografía generada sale deformada. Dejar los planos limpios y añadir el texto después.
- Si dos referencias se contradicen, quitar la más débil en lugar de pedir al prompt que las concilie.
- El mismo sujeto en dos estados (antes/después) son dos huecos de imagen atados a rangos de tiempo; es la atadura más frágil.
- Los clips largos se desvían más: revisar el clip **entero**, no solo el primer y el último fotograma.
- Para el avatar: hoja de personaje (frente / espalda / retrato) como imágenes separadas; añadir «retaining real fine pores and skin texture».
- [Inferencia] El bloqueo de geometría más fuerte sigue siendo un primer fotograma correcto que ya contenga el producto real: el modelo solo tiene que conservar lo que ya está en pantalla.

### Fallos conocidos y arreglos
| Fallo | Arreglo |
|---|---|
| Los cortes caen pronto o tarde | Esperar ±1 s; hasta 2,5 s tarde si el clip abre con el encuadre de la propia referencia. Escribir cada plano con su disparador y su estado final. |
| El modelo copia la referencia demasiado literal | Decir qué NO debe aportar `@Video1`; describir otro fondo y otro lugar; un plano cercano al lado, altura y tamaño del original vuelve como el original. |
| Referencia ignorada o movimiento distinto | Dejar explícito que `@Video1` es solo estructura (orden de los planos, cortes, cámara y tipo de acción) y escribir completa la acción del producto nuevo. |
| Plano único cuando se pidieron cortes (o al revés) | Bloque de cortes al principio; o «Una sola toma continua, sin cortes de ningún tipo». 2.5 «peca por exceso» y puede cortar libremente. |
| Segundo ángulo de cámara no pedido hacia los 2,5–3 s | Usar los primeros segundos continuos; mantener cortos los clips de un solo plano. |
| Gemelos o caras mezcladas | Atadura por sujeto + «los movimientos no están sincronizados; sin clones idénticos». |
| Subtítulos o música aleatorios | «Vídeo puro, sin subtítulos, sin música de fondo», repetido al final. |
| Piel de plástico | «retaining real fine pores and skin texture». |
| Texto y etiquetas deformados | Mantener el texto pequeño o fuera de los primeros planos; añadirlo después. |
| Rechazo `nsfw` o `ip_detected` | No reenviar; cambiar la entrada. Pertinente cuando la referencia muestra marcas o caras conocidas. |
| Depuración | Cambiar una sola variable por reintento (movimiento, cámara, identidad, luz, audio). |

## Plantilla del prompt (clip de referencia como estructura)

Parámetros fijados por la aplicación: `seedance_2_5`, `omni_reference`, 9:16, duración, resolución y audio. Orden de las referencias: primero el vídeo de referencia (recortado al tramo, idealmente de 5–10 s) y después las imágenes, en el orden en que las entrega la aplicación. Los huecos entre llaves salen del desglose y de las fichas: `{avatar}` es la persona del avatar elegido, `{producto}` el producto del encargo, `{espacio}` el entorno elegido, `{modo}` el modo que indica la aplicación. Esta plantilla es un criterio de la investigación y no está aprobada por el dueño (estado `inferido útil`, no `aprobado por Emmanuel`).

El bloque `[Imagen aprobada]` depende de `{modo}`; escribir solo la variante que corresponda:
- `{modo}` = `primer fotograma`: «`@Image1` es el primer fotograma: `{avatar}`, `{producto}` y `{espacio}` ya están en la imagen y no se describen de nuevo. Describir solo el movimiento y la cámara a partir de ahí.»
- `{modo}` = `referencia de contexto`: «`@Image1` es una referencia contextual (`contextual reference`) de `{avatar}` con `{producto}` en `{espacio}`; no es un primer fotograma exacto. La escena inicial es: {escena inicial}. Describir aparte todos los movimientos y cortes.»

```text
[Referencias]
`@Video1` define solo el orden de los planos, el ritmo de los cortes, la cámara y el tipo de acción.
No usar la persona, el producto, la ropa, el espacio, los colores, el texto ni los logotipos de @Video1.
[Imagen aprobada: variante de {modo}, ver arriba]
@Image2, @Image3 y @Image4 definen el producto ({producto}): forma exacta, proporciones, colores, material,
tapa y colocación de la etiqueta. El producto es rígido; nunca se dobla, se derrite ni cambia de tamaño. No redibujar el texto de la etiqueta.
{espacio} se define con la imagen de entorno que entregue la aplicación.

[Resumen]
Un vídeo vertical de producto, estilo UGC, de {L} segundos y {N} planos, con cortes secos en {t1} s, {t2} s y {t3} s. Aspecto de móvil en mano.
{avatar} {historia en una línea} con {producto}.

[Planos]
Plano 1, 0,0–{t1} s: {objetivo o tamaño de plano}, {posición y altura de cámara}, {movimiento}: {qué llena el encuadre};
{avatar} {una acción}. Estado final: {estado visible}.
Plano 2, {t1}–{t2} s: {…}: {producto} {acción del producto nuevo, escrita completa}; {un movimiento de cámara}. Estado final: {…}.
Plano 3, {t2}–{t3} s: {…}
Plano 4, {t3}–{L} s: héroe: {producto} solo, en vertical, con la etiqueta hacia nosotros, y luego su mano lo levanta
hacia el objetivo. Estado final: producto centrado, nítido, quieto.

[Mantener]
Mismos {avatar}, conjunto, {producto} y {espacio} en todos los planos. Manos realistas, cinco dedos; el producto se mantiene
en su mano y nunca atraviesa los dedos. Movimientos parecidos, no idénticos. Siguen el ritmo de @Video1 pero son sus propios movimientos naturales.
Vídeo puro. Sin texto en pantalla, sin subtítulos, sin logotipos salvo la etiqueta propia del producto, sin marca de agua, sin música.
```
