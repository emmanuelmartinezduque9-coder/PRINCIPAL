# si-el-producto-ya-esta-en-el-frame-no-se-adjunta

**Fecha:** 2026-09-03 · **Ámbito:** GLOBAL
**Qué pasó:** El 2026-09-03 Emmanuel vio en el clip de la receta de EisMeister la foto de catalogo del producto PEGADA dentro del video: «porque pones esta imagen en la generacion de la receta si ya habias puesto el frame validado y el img complemento». Al medirlo aparecieron ONCE clips con el mismo fallo. La causa: en_pantalla significaba «que se ve» y el sistema adjuntaba la foto siempre, tambien cuando el producto YA venia dentro del frame de partida.
**Regla:** La foto del producto solo se adjunta cuando el producto APARECE o CAMBIA durante el clip (un reveal, abrir la caja, algo que entra en cuadro). Si el producto ya se ve en el frame de partida, el frame ya lo lleva clavado y su foto NO se manda: mandarla hace que el modelo pegue la foto de catalogo dentro del video. Ya esta tapiado en lanzar.py, que lo deduce solo de lo que se declaro al generar ese frame; para las excepciones reales hay que declarar «producto_aparece_durante».

> ⛔ **RETIRADA el 2026-09-04.** Esta lección era FALSA: Emmanuel corrigió que el MOCKUP del producto se manda SIEMPRE, aunque el producto ya se vea en el frame. Lo que sobraba era la tercera imagen (articulo_en_mano), no el mockup. La lección buena es «2026-09-03-la-tercera-imagen-no-va-nunca». Sin bloque `datos` a propósito: ninguna puerta la aplica.
