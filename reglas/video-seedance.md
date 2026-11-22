# Vídeo con Seedance 2.5

Reglas para escribir el prompt del clip y para preparar las referencias que lo acompañan. Las órdenes del dueño llevan su fecha. Los apartados marcados como «criterio de la investigación del 22/11/2026» vienen de las notas de investigación sobre Seedance 2.5 y se apoyan en guías de la comunidad y en las plantillas del propio Higgsfield: son criterio de trabajo, no órdenes de Emmanuel ni garantías del modelo.

## Configuración del clip
Seedance 2.5 a 480p, con `bitrate_mode` en `high`, formato 9:16 y modo `omni_reference`, por orden de Emmanuel (07/09/2026). La aplicación fija esos parámetros, la duración y el audio: no escribirlos en el texto del prompt. La resolución NO se sube jamás para «mejorar».

Por qué `bitrate_mode` en `high`: la web de Higgsfield daba mejor calidad que la API «con los mismos parámetros», pero no eran los mismos. La web envía `bitrate_mode=high` (8,1 Mbps medidos con ffprobe el 01/09/2026) y la API por defecto usa `standard` (5,1 Mbps), ambos a 720×1280. Un 60 % menos de datos por segundo es la textura lavada que se veía. Método que lo encontró: comparar los parámetros de TODAS las generaciones del historial y buscar el campo que varía, sin generar nada.

## Escala de producto con mano (orden de Emmanuel, 05/11/2026)
En las generaciones Seedance, las imágenes de referencia de producto deben mostrar el producto comparado con una mano humana, para fijar la escala real. Una imagen aislada sin escala no basta. Conservar también el asset canónico original.

Para variantes creadas a partir de un producto existente, observar primero el producto sostenido por una mano en el vídeo o la foto real de la cuenta de referencia. Transferir esa proporción a la nueva variante, conservando el diseño propio aprobado. Indicar la fuente, el fotograma o el tiempo y qué se observó; no inventar centímetros ni tratar una estimación visual como una medición física certificada. La mano y el artículo deben estar en el mismo plano y perspectiva, con agarre y contacto naturales, tamaño adulto coherente y diseño visible. Si la aplicación no entrega una foto del artículo en una mano, decirlo; no suplirla con una escala inventada.

Calendarios de adviento: una referencia individual de cada uno de los tres charms exactos con mano de escala, junto al embalaje exacto y los demás inputs necesarios, respetando los límites reales del modelo. No usar la ilustración de la caja como autoridad de detalles del charm ni transferir números de puertas a las figuras.

HoofHolly: Emmanuel aprobó el resultado Seedance V2 en edición, movimiento y calidad, pero pidió corregir las referencias de tamaño: tres imágenes de los caballos aprobados con la escala de mano observada en la cuenta de referencia. Su aprobación de calidad no borra los defectos registrados (número 20 en palomino y extracción negra omitida).

Seedance siempre con producto exacto y escala real en mano. Producto, embalaje y variante exactos; luz, escala, perspectiva y contacto integrados.

## Sin texto en pantalla (orden de Emmanuel tras WichtelWitz, 30/10/2026)
Las imágenes y los clips nuevos no deben incluir captions, subtítulos, emojis ni interfaz copiados de la referencia. Conservar los textos físicos de embalajes y señales. Revisar el prompt final y el resultado real antes de editar. Los textos editoriales se añaden después como capas separadas con fondo transparente, en la edición. Prohibido cubrir un texto incrustado con paneles negros, rectángulos opacos o parches sin petición expresa. Si el resultado generado conserva texto, registrar el defecto y resolverlo sin ocultarlo ni declarar el final verificado.

## Personas y vestuario en las réplicas
Personas y vestuario distintos en las réplicas salvo conservación expresa. Animales: variar raza y aspecto sin cambiar de especie salvo orden expresa. Adjuntar las referencias de identidad requeridas a la imagen y al vídeo.

## La imagen: primer fotograma o referencia contextual (orden de Emmanuel, 08/09/2026)
En los clips simples, la imagen aprobada es el primer fotograma. En los vídeos largos o de varias escenas, la imagen aprobada se usa como referencia contextual y no como primer fotograma obligatorio. Esta imagen debe mostrar a la vez:
1. El artículo de la cuenta, con proporciones fieles a la referencia física disponible.
2. El avatar entregado por Emmanuel, reconocible; no inventar otra cara.
3. Una interacción comprensible entre ambos: sostener, usar, instalar o mostrar su uso.
4. El contexto y el fondo de la acción, rediseñados con cambios concretos.
5. Una foto creíble de iPhone: piel y texturas reales, luz coherente y manos correctas.

Es una escena coherente, no un collage de fichas ni un panel de caras y productos. Si la historia necesita contextos diferentes o detalles en las escenas finales, preparar referencias adicionales específicas. Una referencia no garantiza por sí sola la fidelidad de todas las tomas.

Corrección de Emmanuel, 09/09/2026: en un POV no se adjunta un retrato para representar unas manos. Si una composición buena ya incluye a las personas que deben mantenerse, se usa esa misma identidad, sin retratos adicionales ni un intento rechazado como base. Esto no autoriza a omitir personas visibles ni a inventar una cara.

En el prompt de un vídeo de varias escenas, explicar que la imagen es una `contextual reference` (referencia contextual); describir por separado la escena inicial y todos los movimientos y cortes. Si había una frase de «exact first frame», sustituirla explícitamente por esa explicación. Los clips simples conservan el modo de primer fotograma.

La regla de no anticipar un reveal rige el comienzo del VÍDEO, no esta referencia contextual, que debe mostrar el artículo. La descripción de los cinco criterios no demuestra que se cumplan: inspeccionar el resultado.

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
4. **No volver a describir lo que una referencia ya define.** Si `@Video1` define el movimiento, decir qué atributos hereda; describir de nuevo cada acción entra en conflicto con él. Con una imagen inicial, describir solo movimiento y cámara, no lo que ya se ve en el primer fotograma.
5. **Repetir la etiqueta** de un recurso importante varias veces a lo largo del prompt: se dice que sube la precisión.
6. Puntos de estabilidad (atribuidos a la guía oficial): 1–5 sujetos por vídeo de referencia, **clip de referencia de 5–10 s**, 1–8 sujetos entre las imágenes, imágenes separadas por vista mejor que un collage.
7. Regla de la casa de Higgsfield para referencias de persona: la imagen manda sobre el aspecto completo (cara, pelo, complexión, ropa, accesorios); `@Video1` aporta solo actuación, pose, bloqueo de escena, cámara, luz y tiempos.

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
- Marcadores de 2.5: música `( )`, efectos `< >`, diálogo `{ }`, títulos `【 】`. Prohibiciones fiables: «Vídeo puro, sin subtítulos, sin música de fondo.»

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
| Los cortes caen pronto o tarde | Esperar ±1 s; hasta 2,5 s tarde si el clip abre con el encuadre de la propia referencia. Reajustar en la edición o generar por plano. |
| El resultado acaba un poco corto; 24 fps | Cortar el audio al vídeo; pasar a 30 fps en la edición. |
| El modelo copia la referencia demasiado literal | Decir qué NO debe aportar `@Video1`; describir otro fondo y otro lugar; un plano cercano al lado, altura y tamaño del original vuelve como el original. |
| Referencia ignorada o movimiento distinto | Hacer explícita la instrucción de transferencia; acortar y simplificar la referencia a un solo movimiento legible. |
| Plano único cuando se pidieron cortes (o al revés) | Bloque de cortes al principio; o «Una sola toma continua, sin cortes de ningún tipo». 2.5 «peca por exceso» y puede cortar libremente. |
| Segundo ángulo de cámara no pedido hacia los 2,5–3 s | Usar los primeros segundos continuos; mantener cortos los clips de un solo plano. |
| Gemelos o caras mezcladas | Atadura por sujeto + «los movimientos no están sincronizados; sin clones idénticos». |
| Subtítulos o música aleatorios | «Vídeo puro, sin subtítulos, sin música de fondo», repetido al final. |
| Piel de plástico | «retaining real fine pores and skin texture». |
| Texto y etiquetas deformados | Mantener el texto pequeño o fuera de los primeros planos; añadirlo después. |
| Rechazo `nsfw` o `ip_detected` | No reenviar; cambiar la entrada. Pertinente cuando la referencia muestra marcas o caras conocidas. |
| Depuración | Cambiar una sola variable por reintento (movimiento, cámara, identidad, luz, audio). |

## Plantilla del prompt (clip de referencia como estructura)

Parámetros fijados por la aplicación: `seedance_2_5`, `omni_reference`, 9:16, duración, resolución y audio. Orden de las referencias: primero el vídeo de referencia (recortado al tramo, idealmente de 5–10 s) y después las imágenes. Los huecos entre llaves salen del desglose de la referencia.

```text
[Referencias]
`@Video1` define solo el orden de los planos, el ritmo de los cortes, la cámara y el tipo de acción.
No usar la persona, el producto, la ropa, la habitación, los colores, el texto ni los logotipos de @Video1.
@Image1 define a la mujer: cara, pelo, tono de piel, complexión y conjunto completo. Mantenerla idéntica en todos los planos.
@Image2, @Image3 y @Image4 definen el producto ({nombre del producto}): forma exacta, proporciones, colores, material,
tapa y colocación de la etiqueta. El producto es rígido; nunca se dobla, se derrite ni cambia de tamaño. No redibujar el texto de la etiqueta.
@Image5 define la habitación.

[Resumen]
Un vídeo vertical de producto, estilo UGC, de {L} segundos y {N} planos, con cortes secos en {t1} s, {t2} s y {t3} s. Aspecto de móvil en mano.
La mujer de @Image1 {historia en una línea} con el producto de @Image2.

[Planos]
Plano 1, 0,0–{t1} s: {objetivo o tamaño de plano}, {posición y altura de cámara}, {movimiento}: {qué llena el encuadre};
ella {una acción}. Estado final: {estado visible}.
Plano 2, {t1}–{t2} s: {…}: el producto de @Image2 {acción}; {un movimiento de cámara}. Estado final: {…}.
Plano 3, {t2}–{t3} s: {…}
Plano 4, {t3}–{L} s: héroe: el producto de @Image2 solo, en vertical, con la etiqueta hacia nosotros, y luego su mano lo levanta
hacia el objetivo. Estado final: producto centrado, nítido, quieto.

[Mantener]
La misma mujer, el mismo conjunto, el mismo producto y la misma habitación en todos los planos. Manos realistas, cinco dedos; el producto se mantiene
en su mano y nunca atraviesa los dedos. Movimientos parecidos, no idénticos. Siguen el ritmo de @Video1 pero son sus propios movimientos naturales.
Vídeo puro. Sin texto en pantalla, sin subtítulos, sin logotipos salvo la etiqueta propia del producto, sin marca de agua, sin música.
```
