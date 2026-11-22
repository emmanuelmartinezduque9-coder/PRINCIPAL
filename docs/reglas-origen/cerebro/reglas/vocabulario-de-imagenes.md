# Vocabulario de imágenes

Cada tipo de imagen tiene **un solo nombre**, y los nombres están elegidos para que **no compartan
ninguna palabra entre sí**. Ese es el punto: «caja de producto» y «producto» sí la compartían, y por
eso se confundían una con otra. Ver [[2026-09-01-nombres-que-no-se-parecen]].

| nombre | qué es | cuándo se usa |
|---|---|---|
| **EMBALAJE** | la caja de venta **cerrada** | cuando en pantalla se ven **cajas** (estantes, reveals, bultos bajo una tela) |
| **ARTICULO** | el **producto solo**, la imagen de producto limpia | cuando se ve **el producto en sí** |
| **ARTICULO_EN_MANO** | el producto sujetado, recortado | cuando hay que enseñar cómo se ve en manos reales |
| **ARTICULO_ORIGINAL** | la foto original del fabricante | referencia de construcción; nunca se elige sola |
| **CARA** | el avatar | cuando se sustituye la persona |
| **MARCA** | el logotipo | rótulos y packaging |
| **ESCENA / FRAME** | una imagen generada del panel | **nunca se adjunta**: un frame no es una referencia |

## `mockup` no existe

El **mockup** es el primer paso para *generar* la imagen de producto limpia. Una vez generada es la
**imagen de producto** y nunca se le vuelve a llamar mockup. Emmanuel ya lo había dicho una vez y
volví a meter «mockup» como categoría: por eso queda escrito aquí, donde lo leen las puertas.

## Las imágenes no se eligen: se deducen

En el lote se declara **qué se ve**, no qué adjuntar:

```
"en_pantalla": ["embalaje"]              -> el sistema adjunta la caja
"en_pantalla": ["articulo"]              -> adjunta el producto
"en_pantalla": ["embalaje", "articulo"]  -> los dos
"en_pantalla": []  + "sin_producto"      -> ninguna, con motivo
```

`EDITOR/lanzar.py` lo **coteja contra el prompt en los dos sentidos**:
- declaro artículo y el prompt solo habla de cajas → **para**
- el prompt enseña el producto y no lo declaré → **para**
- el prompt dice que va tapado y declaro que se ve → **para**

Para equivocarme tendría que mentir sobre lo que sale en el vídeo, y eso choca con
[[contrato-de-escena]].

## Color de la variante

Sale del **frame**, no de mi criterio (`EDITOR/variantes.json`). Los grupos se llaman igual que el
sufijo de la imagen: `rosa` · `azul` · `menta`.

⚠️ El producto **azul** de EisWerk/Gelatovivo **se ve verde menta en foto**: en el prompt se describe
como *mint*, pero la imagen que se adjunta es la **azul**. No es el **menta** de EisMeister, que es
otro producto distinto. El grupo se llamaba `menta_azul` y el sistema pedía una imagen «menta» que en
esas cuentas no existe. Ver [[variante-de-color]].

Relacionado: [[referencia-de-producto]] · [[una-sola-puerta-para-video]] · [[no-adelantar-el-reveal]]
