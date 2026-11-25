# EisWerk: variante rosa y 4 diseños de color (25/11/2026)

Encargo de Emmanuel: añadir a EisWerk (producto 2, Alemania) la variante rosa del molde actual (cubeta rosa,
tapa transparente, parte superior blanca) y 4 diseños nuevos con la misma forma, elegidos con datos de Alemania.

## Decisiones

- **Límite de fotos por producto: de 12 a 80.** Con 12 no cabían: EisWerk ya tenía 12 y cada variante necesita su
  foto de artículo y su caja. 80 cubre las 30 variantes que ya admite la app (60 fotos), más marca, logo vertical y
  avatares. `MAX_PHOTOS_PER_PRODUCT` (`src/server/photos.ts`) y `MAX_PHOTOS` (subida en la web) van iguales.
- **Mismo logo, sin recursos automáticos.** EisWerk no tiene filas en `product_brand_assets`: su logo viene de las cajas
  de Codex. Si se le añadieran, la tarea `producto.recursos` crearía un emblema nuevo y cajas para todas sus variantes.
  Por eso cada caja nueva se hace editando la caja de EisWerk con Nano Banana (se conserva el logo con sus colores y
  los textos en alemán) y se guarda directamente como «Embalaje» de su variante.
- **Texto pequeño de las cajas.** Nano Banana escribe mal el lateral («Lieferumfang»). Se corrigió una vez en la caja
  rosa y ese lateral se copió, alineado al píxel, en las otras cuatro (el diseño es idéntico).
- **Lisos, sin estampado.** La búsqueda (hecha con Codex) no encontró datos de que un estampado concreto guste o venda
  en pequeños electrodomésticos en Alemania; color y acabado sí tienen respaldo.
- **Lavanda en vez de azul pastel**, que proponía Codex: EisWerk ya tiene dos variantes turquesa y se parecerían.

## Los 5 diseños

| Variante | Diseño | Por qué (fuente) |
|---|---|---|
| Rosa y blanca | Cubeta rosa, aro y cúpula blancos | Foto de producto y real del proveedor. Su competidor más cercano en alemán (MIRAI, mini Eismaschine 500 ml) se vende en Mint y Rosa: https://de-mirai.com/products/mirai-mini-eismaschine |
| Verde salvia | Salbeigrün #A6B29B mate con textura fina; aro y cúpula blanco cálido | Informe de tendencias de cocina 2025 de la AMK (salvia, eucalipto, oliva): https://www.amk.de/pressemeldung/kuechen-und-wohntrends-2025/ · KitchenAid Spearmint, color de 2026 con textura: https://www.kochform.de/artikelbilder/dokumente/specsheet_coty2026_5ksm195psxsd_de_translations.pdf · Russell Hobbs Eden Pistazie: https://de.russellhobbs.com/eden-kettle-pistachio-27364-70 |
| Crema retro | Todo Vanillecreme #EFE2C6 brillante, estilo años 50 | Smeg vende en Alemania «Creme Hochglanz» y su línea 50's Style: https://www.smeg.com/de/wasserkocher · KitchenAid Crème: https://www.kitchenaid.de/farben · AMK: beige y greige cálidos |
| Amarillo mantequilla | Buttergelb #F1DEA0 satinado; aro y cúpula marfil | Butter, color KitchenAid de 2025: https://www.kochform.de/artikelbilder/dokumente/specsheet_coty2025_5ksm195psxbt_de_translations_1.pdf · AD Alemania sobre el amarillo mantequilla en la cocina (10/05/2025): https://www.ad-magazin.de/artikel/kueche-buttergelb |
| Lavanda | Lavendel #C9B8DD brillante; aro y cúpula blanco porcelana | Ninja Blast Max en Lavendel en Amazon.de: https://www.amazon.de/dp/B0DM6HR96T · SCHÖNER WOHNEN, combinación mantequilla y lavanda: https://www.schoener-wohnen.de/einrichten/wohnen-mit-farben/farbduos-die-wir-jetzt-lieben-14037926.html |

Lo que no se pudo comprobar: Amazon.de bloqueó los rankings de más vendidos y Meta Ad Library no cargó, así que no hay
datos de qué color vende más ni de qué colores se repiten en anuncios. Son señales de oferta y tendencia, no de ventas.
