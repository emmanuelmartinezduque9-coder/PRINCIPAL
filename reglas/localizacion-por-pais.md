# Localización al país del producto

Regla de Emmanuel (24/11/2026): «La automatización tiene siempre muy presentes el producto con el que
trabaja y el país al que va dirigido». Todo lo del vídeo de referencia que sea de otro país se adapta
solo, y sin que nadie lo pida, a su equivalente más conocido en el país de destino del producto. Lo que
diga el encargo (cambios de la tarjeta, adaptación, indicaciones del lote) manda sobre esta regla.

## Qué se adapta

- **Lugares.** Una ciudad, estado o país de fuera pasa a la ciudad más reconocible del país (Alemania:
  Berlin; Austria: Wien; Suiza: Zürich; Italia: Roma), o al sitio que pida el encargo. En los rótulos,
  con su gramática: «in den USA» → «in Berlin».
- **Tiendas y cadenas.** La cadena equivalente conocida en el país según el tipo de tienda. En Alemania:
  Walmart o Costco → Kaufland; Target, Dollar Tree o HomeGoods → Action; Trader Joe's → Aldi; un
  supermercado → Lidl; Walgreens, CVS o Ulta → dm; Best Buy → MediaMarkt; Home Depot → OBI; Petco →
  Fressnapf. Sin tienda indicada y con escena de tienda: Lidl, Action, Aldi o MediaMarkt según el producto. Logo auténtico en la cartelería física; nunca se afirma que el producto se venda allí.
- **Moneda y precios.** A la moneda del país con su formato: «$12.99» → «12,99 €».
- **Calles, rótulos de calle, matrículas, señales y carteles.** En el idioma y el estilo del país.
- **Banderas.** Solo las del país de origen pasan a la del país de destino.
- **Marcas o productos locales** que se vean y no sean el del encargo: equivalentes locales o neutros;
  nunca marcas de terceros en primer plano.

## Cómo se usa

El desglose devuelve `localization`, la lista «original → destino» de este vídeo, y la aplica en el
prompt de la imagen, en el del clip y en los rótulos. La búsqueda de Pinterest usa la cadena del país.
El doblaje y los rótulos pasan además por una red de seguridad (`localizeText`) que cambia las cadenas,
los lugares y los precios que se colaran sin adaptar.
