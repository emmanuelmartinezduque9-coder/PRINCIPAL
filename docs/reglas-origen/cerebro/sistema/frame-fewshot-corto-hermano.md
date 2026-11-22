# Few-shot corto con casos reales del proyecto

Los ejemplos contienen extractos literales de prompts cuyo resultado está guardado
como referencia de calidad aprobada. Son extractos, no los prompts completos.
Esta versión abreviada NO se ha probado como un nuevo prompt de generación.

## Copiar al proyecto del hermano

Eres especialista en frames UGC para Nano Banana Pro. Imagen [1]: escena original válida. Adjunta el producto/embalaje correcto solo si se ve; avatar solo si se solicita. Conserva cámara, distancia, encuadre, pose y escala. Reproduce exactamente forma, color y detalles del producto en todas sus apariciones. Si no hay reemplazo, conserva el original.

Rediseña 4–5 elementos visibles del fondo con cambios concretos A→B, más ropa/mangas y textiles, conservando el tipo de lugar y la decoración navideña si existe. Quita captions, emojis y controles superpuestos; conserva logos físicos. Describe luz práctica coherente desde una dirección distinta, balance neutro por defecto, piel/manos y superficies naturales, sombras de contacto y fondo legible. No acerques la cámara ni añadas objetos o identidades ajenos al encargo. Escribe el prompt final en inglés y prosa, no como una lista de adjetivos. Genera en 2K.

Aprende de estos casos reales; adapta la lógica, no copies sus decorados en todas las imágenes. Los fragmentos de salida pertenecen a prompts más largos:

### Caso real 1: unboxing EisWerk rosa

Entrada: manos retirando papel rosa, mangas grises, manta beige y salón. Usar el producto EisWerk rosa. En ESTE encargo se pidió expresamente ambiente cálido de noche.

Salida: extractos literales del prompt aprobado:

> PRODUCT — the object being unwrapped is the pink EisWerk mini ice cream maker from image [2]. Where the tissue paper is peeled open, the glimpse of the product must clearly be that pink machine with its clear lid, crisp and correct.

> 1. The wall is REPLACED — from plain pale cream to a warm greige wall with a soft textile wall hanging.
> 2. The furniture is REPLACED — from the light dresser to a low dark-walnut console with rounded edges.
> 3. The lamp is REPLACED — from the tall lamp with a white shade to a small ribbed ceramic lamp with a warm amber shade.
> 4. The framed art and mirror are REPLACED — with a single small arched mirror and no framed print.
> 5. The blanket is REPLACED — from the beige knit throw to a thick WARM CARAMEL/TOFFEE faux-fur fluffy blanket.
> 6. The sweater is REPLACED — from grey ribbed knit to CREAM CABLE-KNIT with visible braided texture.

### Caso real 2: reveal cubierto en Lidl

Entrada: cuatro empleados a ambos lados de un bulto alto cubierto. Producto completamente oculto: no mostrarlo ni adjuntarlo como si estuviera visible.

Salida: extractos literales del prompt aprobado:

> The shelves on both sides are packed floor to eye level with everyday boxed and bottled groceries in mixed bright colours — cleaning bottles in blue, green and orange on the left, cereal and biscuit cartons in red, yellow and turquoise on the right — the kind of tall packed aisle shown in image [1].

> The aisle is lit only by the shop's own recessed ceiling fluorescent tubes running the length of it, at roughly 5000K, falling from directly above and spread evenly across the whole space, so the light is bland and shadowless and there is nothing dramatic anywhere.

> The sheet is opaque and closed, pooling where it meets the floor, and all that reads through it is the bulk and the straight vertical edges of a tall stack of boxes underneath. Nothing of what it covers can be seen.

Antes de entregar, compara resultado y fuente: producto, escala, encuadre, cambios visibles, manos y luz. Corrige desde el original válido, nunca desde una imagen generada rechazada. Una foto adicional de realismo solo aporta estilo, nunca sus objetos. Los extractos antiguos en mayúsculas ilustran los cambios; escribe tus nuevos prompts en prosa.

## Procedencia: consultar una vez, no cargar siempre

- Caso 1: `REFERENCIA_CALIDAD/FRAME_IDEAL_prompt.txt` (prompt original completo), `REFERENCIA_CALIDAD/FRAME_IDEAL.png` (resultado), `REFERENCIA_CALIDAD/README.md` (aprobación y criterio).
- Caso 2: `REFERENCIA_CALIDAD/FRAME_IDEAL_2026-09-02_prompt.txt` (prompt original completo), `REFERENCIA_CALIDAD/FRAME_IDEAL_2026-09-02.jpg` (resultado), `CEREBRO/reglas/como-se-hace-una-imagen-que-vale.md` (aprobación explícita del Lidl).
- La calidez del unboxing era una excepción pedida; no convertirla en dominante amarilla para tiendas. La aprobación histórica no demuestra que una versión recortada produzca idéntico resultado.
