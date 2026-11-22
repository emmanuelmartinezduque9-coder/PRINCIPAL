# De una idea amplia a una escena comprobable

Leer al crear/adaptar conceptos, antes de escribir prompts. La idea literal de Emmanuel prevalece sobre cualquier plantilla o ejemplo.

## Traducción visual de la intención
Conservar la nota íntegra. Descomponerla en requisitos concretos, sin sustituirla por una sinopsis. Para cada requisito guardar: cita, interpretación, toma, estado inicial, acción/transición, estado final visible, encuadre necesario, referencia y criterio de cumplimiento. Distinguir `expreso`, `inferido` y `pendiente`; completar detalles incidentales compatibles por criterio propio. Solo preguntar ambigüedades esenciales no recuperables, todas juntas antes de frames.

Interpretar intención sin inventar una historia: «que se vea enorme» puede requerir escala respecto a personas y plano abierto, no agrandar artificialmente el artículo. «Que se ilumine toda» exige LEDs visibles distribuidos por toda la superficie, no un halo en un lado. «Empiezan juntas y se separan» exige desplazamiento de sus cuerpos desde el centro hacia lados opuestos, no solo extender brazos.

Para cada toma describir lo que ve la cámara, no adjetivos abstractos: quién está dónde, qué sostiene cada mano, hacia dónde se desplaza, qué distancia relativa recorre, qué objeto cambia y qué permanece. Conservar simultaneidad y orden. Definir el primer estado ANTES de la acción y el último DESPUÉS; no crear una imagen inicial que ya haya completado lo que debe suceder.

## Recuperar estructuras que funcionaron
Actualizar/consultar `scripts/index_approved_prompts.py --output /Volumes/T7/AUTOMATIZACION SEGA/ConceptosVisuales-20261110/prompts-aprobados.json`. El índice local recorre expedientes existentes, exige imagen y aprobación ligadas por hash, y conserva el texto del prompt. No envía generaciones. Es un índice de imágenes aprobadas, NO una certificación de éxito de vídeos ni de ventas. Ver la imagen y sus referencias antes de reutilizar un ejemplo. Comprobar correcciones posteriores del item: una aprobación histórica no invalida una queja posterior.

Seleccionar por semejanza de problema visual: número y papel de personas, apertura/revelado, manipulación, escala en mano, interior/exterior, relación cámara–acción, luz y contacto. No escoger solo por producto o por compartir palabras. Buscar en todo el índice, leer en detalle únicamente los mejores candidatos. Si no hay ejemplo pertinente, usar estructura propuesta y etiquetarla como no validada; no forzar uno incompatible ni afirmar que una plantilla nueva está probada.

Extraer la arquitectura del prompt, NO copiar su escena: tipo de plano → sujetos/relación espacial → producto/escala → estado y acción → entorno → luz/contacto/materiales → continuidad → exclusiones pertinentes. Mantener intacto el original y escribir una adaptación nueva. Mapear cada bloque heredado a la idea actual y justificar los cambios relevantes. No heredar personajes, lugares, iluminación, logos, acciones o negativas que contradigan la petición actual.

Guardar procedencia por ejemplo: order/item/job, prompt exacto y hash, imagen/hash, aprobación/hash, observación de qué funcionó y límite de reutilización. `aprobado por Emmanuel`, `observado técnicamente`, `inferido útil` y `éxito comercial` son estados diferentes.

## Dos prompts distintos
**Imagen inicial:** composición exacta de apertura, personajes y posiciones iniciales, manos, producto/embalaje/variante, fondo real, perspectiva y escala, luz/sombras de contacto, materiales y piel natural. Adjuntar referencias requeridas y aplicar nanobanana-pro-imagenes. No describir varias fases temporales como si ocurrieran simultáneamente en una foto.

**Vídeo:** conservar identidades/escena del frame aprobado; expresar trayectoria y progresión temporal de cada sujeto, manipulación física, cambio de estado y resultado final legible. Declarar por separado lo que permanece fijo (p. ej. cámara/fondo) y lo que debe moverse (p. ej. personas/cortina). Nunca traducir «cámara fija» a «personas inmóviles». Respetar el modelo elegido, su duración y la referencia efectiva; no inventar parámetros.

Orden orientativo adaptable, no un prompt mágico obligatorio:
1. Apertura y composición derivadas de la idea y referencias.
2. Sujetos, manos, producto exacto y escala física.
3. Acción observable con inicio, recorrido y final (solo vídeo).
4. Entorno, iluminación, sombras, perspectiva y texturas integradas.
5. Continuidad e invariantes compatibles con esa acción.
6. Restricciones específicas que evitan fallos pertinentes, sin listas genéricas.

## Contraste antes de generar
El responsable coteja cada requisito con prompt, referencias y frame inicial: ninguno omitido, ninguna contradicción, acción realizable y resultado visible dentro del plano. Especial atención a negativos heredados como «no cambiar posiciones» cuando se solicita movimiento. No añadir revisores creativos de frames ni aprobaciones intermedias. Presentar los frames juntos a Emmanuel; después continuar clips y edición sin nuevas preguntas rutinarias.

Guardar `visual_intent.json`: instrucciones originales, requisitos/mapeo por toma, interpretaciones, ejemplos recuperados con evidencia, bloques reutilizados/adaptados, prompts finales/adjuntos y comprobación de cobertura. Este documento no acredita por sí solo el resultado. Contrastar vídeo y edición reales con la idea original, no solo con el prompt; registrar omisiones y límites honestamente. No garantizar fidelidad perfecta del generador ni fingir escucha/aprobaciones.

## Caso comprobado: despliegue de cortina
En lote app-9a16867b53ca4493a3a4966387504b4b-27, el frame V3 aprobado mostraba dos mujeres juntas sujetando una cortina recogida. La imagen era útil como apertura. El primer prompt de vídeo añadía «without changing positions» y el resultado solo estiraba los brazos. La corrección ordenó pasos laterales de ambos cuerpos a extremos opuestos, ancho completo visible y pausa de resultado; la revisión visual verificó el despliegue. Evidencias: carpeta `correction-v2-v3-20261110` del expediente en SSD; `v3-generated-review-independent.json` y `v3-c1-unfold-r2.json`. Es evidencia visual de esa acción, no aprobación humana nueva ni garantía para otras escenas.
