# Referencias de Pinterest

**Regla fija del dueño (23/11/2026). Por defecto, siempre:** cada imagen inicial que se genera con Nano Banana lleva fotos reales de Pinterest como referencia de entorno y realismo. También al regenerar una imagen rechazada. Dan mucho realismo y calidad, que es lo que el dueño busca.

**Única excepción:** si el dueño pone una referencia a mano en la tarjeta o en el vídeo, esa manda. Desde el 24/11/2026 se pueden subir varias imágenes en cada tarjeta de «Nuevo lote», en su grupo (vale para las tarjetas sin las suyas) y en la pantalla del vídeo, cada una con su papel: **fondo / sala** (por defecto), ambiente, ropa, realismo u otra. Con un fondo subido a mano no se elige nada del banco: ese fondo es la sala del método aprobado («Image N is the user-selected room background only, not product identity.», con sus elementos y su luz). Un ambiente o realismo a mano ocupa el hueco de la foto de realismo; la ropa u otra van adjuntas con su papel. Al aprobar la imagen, el fondo subido a mano entra en el banco de aprobadas.

**Orden expresa del dueño del 24/11/2026, vigente (sustituye a la del 23/11 de usar solo el banco): se busca siempre en Pinterest.** Cada imagen busca lo que pide su escena (el desglose, la tienda, el tipo de producto, el país) con los filtros que el dueño aplica a mano:
- solo fotos de **alta calidad y realistas, hechas con iPhone, verticales y orgánicas** (contenido de usuario);
- **nada** de fotos cuadradas u horizontales, de cámara profesional, de estudio, de stock, renders ni retocadas.

Los filtros se aplican tres veces: en las consultas (cada una lleva una palabra de foto de móvil: «iPhone Foto», «Handyfoto», «iphone photo», «pov», «real photo»; nunca «professional», «studio», «stock», «aesthetic»…), en el corte por medidas de la original (alto/ancho al menos 1,2 y lado largo al menos 1000 px; primero las verticales) y en la elección con visión (que ve las medidas de cada candidata). El **banco de referencias aprobadas** (44 del sistema anterior más las que se aprueban con fondo a mano) solo es el **respaldo** si Pinterest no da nada válido; entonces el registro lo dice («se usa el banco de respaldo»). El dueño no elige nada ni aprueba ningún paso.

**Excepción, orden del dueño del 24/11/2026: una tienda o un lugar concreto se busca en Pinterest.** Si la tarjeta, la nota, la adaptación o las indicaciones del lote nombran una tienda o un sitio concreto (dm, Rossmann, Sephora, Lidl, Aldi, Action, MediaMarkt, Zara…), la búsqueda es la de esa tienda: se buscan en Pinterest fotos reales del interior de esa tienda, en el país del producto (con su cartelería física, su mercancía y sus estanterías), se eligen con visión rechazando cualquier otra tienda o un supermercado genérico, y el prompt lo dice como el método aprobado, **sin escribir el nombre de la tienda ni de ninguna marca** (Higgsfield bloqueó una imagen de Sephora por el nombre): «The environment reference image N supplies the real [tipo de tienda] retail space in [país]: … and the genuine physical store signage exactly as in image N. Reproject this environment to the source checkout or aisle angle, preserving all actor positions, camera height and movement space. Keep merchandise varied, real store shadows and casually stocked surfaces; no showroom rendering.» y «Use the attached real store photograph (image N) as exposure authority». Con tienda concreta no hay respaldo del banco (no tiene esa tienda): si no sale nada válido, se reintenta.

El banco crece solo: cuando el dueño aprueba una imagen que llevaba una referencia de entorno puesta a mano, esa foto pasa al banco.

La aplicación lo hace sola: al terminar el desglose describe la escena, busca en Pinterest, elige con visión y adjunta. La imagen no se pide sin estas referencias. En la tarjeta se ven como «Referencias de Pinterest aprobadas».

## 1. Para qué sirve la foto

1. Aporta **lugar, luz y ambiente**: el sitio real, sus muebles, materiales, decoración, objetos de uso y el aspecto natural de una foto vertical de móvil. Su luz observada manda sobre la luz de toda la escena.
2. **No aporta** personas, caras, ropa, poses, producto, textos, rótulos, logos ni lo que salga en pantallas. La identidad sale solo del avatar; el producto, de sus fotos; el encuadre, la distancia, el ángulo, las manos y la acción, del fotograma original (image 1).
3. Va detrás de las demás referencias. El prompt dice su número real y su papel: «image N … is a real everyday phone photo found on Pinterest … Use it as the environment and realism reference … Its observed practical lighting is the authority for the light of the whole scene … Do not copy any person, face, text, logo, watermark or screen content».

## 2. Orden de decisión

Producto → acción de la toma → espacio → cámara. No elegir solo una habitación bonita.

- Disfrutar en casa: salón. Preparar: cocina con encimera libre. Comprar: tienda real con mercancía. Usar herramientas de pelo: peluquería.
- Sacar algo del congelador exige un congelador abierto (su interior y su puerta). Un salón no sirve para eso aunque el resto del vídeo pase en un salón.
- Temporada solo si la escena la pide (si la escena es navideña, Navidad). Día o noche, los dos valen; manda lo que diga la tarjeta.

## 3. Cómo se busca (consultas que funcionaron)

Consultas cortas (3–7 palabras): tipo de sitio + punto de vista si importa + temporada si corresponde + palabras de foto cotidiana (gemütlich, Alltag, echtes Zuhause, Handyfoto, cozy, real). La primera, en el idioma del mercado; otra puede ir en inglés. Nunca «interior design», «luxury», «showroom», «architecture», «render», «aesthetic».

| Escena | Consultas que se usaron para escenas así |
|---|---|
| Salón navideño, sofá, tele | `Wohnzimmer Weihnachten Fernseher Sofa echtes Zuhause` · `Wohnzimmer Weihnachten Sofa Handyfoto` · `gemütliches Wohnzimmer Weihnachten Sofa Perspektive Couchtisch` |
| Salón con ventana o de día | `Weihnachten Wohnzimmer Fenster mein Zuhause` · `christmas living room sofa daylight` |
| Salón normal (sin Navidad) | `wohnzimmer wohnung alltag` · `cozy living room couch pov blanket tv` |
| Cocina | `Weihnachten Küche` · `christmas kitchen real home` · `Küche Arbeitsplatte Alltag Fenster Tageslicht` |
| Dormitorio | `Weihnachten Schlafzimmer SoLebIch` · `Bett Laptop Decke Fenster pov` |
| Rincón gamer o escritorio | `Christmas gaming setup room cozy` · `pastel blue pink cozy desk setup real room chair` |
| Casa por fuera de noche | `Einfamilienhaus außen Weihnachten nachts` |
| Calle o plaza con nieve | `Garmisch Partenkirchen Winter Marktplatz` · `germany snow street night` · `germany house entrance snow` |
| Congelador | `open home freezer kitchen eye level photo` · `Gefrierschrank offen Küche Alltag` |
| Supermercado / tienda | `Lidl innen` · `Action Weihnachtsdeko laden` · `Kaufhaus Haushaltswaren Deutschland` · `<cadena> <país o ciudad> interior checkout aisle photo` |
| Autoservicio, POV de coche | `McDrive Deutschland` · `mcdonalds drive thru car pov` · `car driver seat pov winter` |
| Peluquería | `Friseursalon Deutschland Innen` · `Friseursalon Deutschland Bedienplatz Spiegel Innenansicht Alltag` |
| Interior de coche | `Volkswagen Golf Innenraum` |
| Tienda de animales | `pet shop interior dog toys` |
| Tienda de nicho (caballos) | `tack shop shopping inside` |
| Camino o calle tranquila | `park path` · `Schleichweg` |

En Alemania, si la tarjeta no dice tienda, elegir con lógica de producto entre Lidl, Action, Aldi y MediaMarkt. Nunca una cadena de otro país (Target en una prueba para Alemania). El idioma del pin o la decoración no prueban el país.

## 4. Cómo se elige (con visión, mirando cada candidata)

Primero, los filtros del dueño: vertical de móvil, de alta calidad, realista, orgánica. Fuera las cuadradas u horizontales, las de cámara profesional, estudio, stock o catálogo, las retocadas y las de baja resolución. En el respaldo del banco todas valen: se elige por tipo de sitio y acción, época y decoración, luz y momento del día, punto de vista y, a igualdad, la misma cuenta.

**Vale** una foto que:
- es una foto real de móvil, o lo parece: casa o tienda habitada (mantas, tazas, mandos, zapatillas, platos), luz práctica del sitio, encuadre algo imperfecto, sin simetría de catálogo;
- es el mismo tipo de sitio que la toma y deja que la acción quepa (superficie, aparato, altura y dirección de cámara compatibles con el fotograma original);
- respeta la época y la luz pedidas.

**No vale** una foto que:
1. no es un lugar (producto, textura, collage, plano de detalle);
2. es un render, una imagen hecha con IA, un showroom, un catálogo, una foto de interiorismo demasiado perfecta o de una web de inmobiliaria o turismo;
3. lleva texto, frases, rótulos o marcas de agua encima;
4. está dominada por una persona con la cara visible;
5. es otro tipo de sitio que la toma, o una tienda sin mercancía a la venta;
6. tiene una perspectiva imposible para el encuadre o se ve mal.

Se eligen como mucho dos, de mejor a peor. Si ninguna vale, se reformula la búsqueda; nunca se sustituye por fotos de webs de turismo, inmobiliarias o páginas oficiales.

## 5. Guardar y reutilizar

Cada foto se guarda una vez, por su huella, en el almacén (`principal-medios`), con la consulta, el pin, la dirección de la imagen y el motivo de la elección. Se reutiliza al regenerar la misma imagen. Si Pinterest no deja buscar desde la nube, la búsqueda se hace desde el Mac del dueño.
