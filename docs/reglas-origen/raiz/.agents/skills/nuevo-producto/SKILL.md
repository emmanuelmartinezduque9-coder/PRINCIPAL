---
name: nuevo-producto
description: >
  Da de alta un producto nuevo desde el enlace de la cuenta competidora y el mercado: elige automáticamente
  un nombre con nombres-marca-emmanuel, genera MARCA + EMBALAJE + ARTICULO + CARA y los guarda como assets
  fijos y abre la sección de la cuenta en el panel, lista para lotes de generación. Además entrega
  un quinto asset obligatorio, LOGO_WEB_HORIZONTAL, exclusivamente a Emmanuel y fuera del panel.
  Se dispara cuando Emmanuel encarga un producto mediante un enlace competidor; también admite imágenes.
  Incluye después del alta el primer test con Motion Transfer, avatar del público objetivo,
  edición posterior con Codex y entrega a Drive cuando exista carpeta asignada.
  También gestiona la retirada de un producto que se deja de testear (sacarlo del panel SIN borrar archivos).
---

# nuevo-producto — alta y baja de productos a testear

## Flujo final de tests aprobado — 25/10/2026
Leer obligatoriamente `/Volumes/T7/AUTOMATIZACION SEGA/REGLAS_EDICION/FLUJO_TEST_PRODUCTOS.md` antes de CADA producto, edición y entrega. Enlace → assets/alta → réplica con métricas → tres ganchos fijos (destape, café/sorpresa/escaparate, regalo) reutilizando cuerpo V1 → cuatro ediciones. Textos investigados adaptados por concepto/nicho y canciones elegidas por Emmanuel. Un único bloque inicial incluye dudas de edición. Consultar recetas FaltLiebling aprobadas sin heredar sus defectos ni inventar escucha. Registrar lectura, fuentes/hashes y revisión real. Sustituye notas antiguas de un solo vídeo o ganchos/textos pendientes. Documentación no acredita ejecución autónoma.


## DISPARADOR
Emmanuel encarga un nuevo producto pasando **el enlace de la cuenta competidora** y el mercado de destino.
Identificar el artículo desde las fuentes reales; no exigir una foto si se puede recuperar del enlace.
Las imágenes siguen siendo una entrada válida, pero ya no son obligatorias.
No hace falta que pida nada más: se ejecuta la secuencia entera.

### Producto real, identidad propia — aclaración 17/10/2026

Entrada habitual: enlace de producto o cuenta competidora + países de destino + breve
explicación de uso. Consultar la web enlazada y recuperar una foto real del artículo;
guardar su URL y procedencia. No exigir que Emmanuel descargue o adjunte esa foto.
Con el encargo de alta se eligen los nombres y se generan automáticamente los assets,
sin otra autorización rutinaria entre esas fases; las revisiones visuales se conservan.

Distinguir las referencias por su función:
- **Artículo:** usar la foto recuperada solo para preservar forma, componentes, colores
  y variantes reales. Crear una fotografía de catálogo propia, no cambiar el producto
  para diferenciarlo ni copiar el montaje publicitario, overlays o escenografía ajenos.
- **Marca, embalaje y logo web:** diseñar una identidad original para nuestra marca.
  No adjuntar logos, cajas, banners o capturas completas de la tienda competidora como
  referencias de estilo ni hacer un cambio superficial de nombre sobre sus diseños.
  Elegir paleta, tipografía, ilustración y composición propias. Puede usarse la referencia
  del artículo aislado para representarlo fielmente en la caja, no como plantilla gráfica.
- **Avatar:** usar la identidad propia seleccionada o biblioteca autorizada; no copiar
  al modelo o creador de la competencia.

Si la única foto mezcla artículo y diseño comercial, recuperar otra vista limpia o aislar
el artículo con las herramientas y skill de imagen vigentes antes de usarla. No confundir
rasgos impresos que forman parte del producto con overlays; ante duda material, aclarar.
La propuesta de embalaje no demuestra que el proveedor entregue esa caja personalizada.
Para varios países, preparar la localización de nombre/textos y ficha de cada mercado
solicitado sin asumir que uno solo cubre todos. No crear mercados adicionales.

Revisar los assets obtenidos: producto fiel, identidad propia y ausencia de branding ajeno
copiado. Conservar procedencia y resultados; los reintentos y correcciones siguen las
reglas de aprobación vigentes. Esta distinción no cambia la norma de vídeos sin mockup
adjunto por defecto.

---

## PASO 1 — Nombre elegido automáticamente (orden 17/10/2026)

Leer y aplicar `/Users/emmanuelmartinezduque/.codex/skills/nombres-marca-emmanuel/SKILL.md`.
Elegir un solo nombre basado en sus preferencias, comunicarlo brevemente y continuar sin votación
ni aprobación rutinaria del nombre. Conservar un nombre explícito si Emmanuel ya lo indicó.
Si falta el mercado o el perfil ofrece varios productos sin selección inequívoca, pedir solo ese dato.
Registrar el perfil competidor y la publicación usada en la ficha del alta y el registro existente.

### Patrón validado (aprendido de sus marcas reales)
| Marca | Producto / país | Construcción |
|---|---|---|
| **ZielAlarm** | alarma · Alemania | *Ziel* (objetivo, DE) + *Alarm* |
| **EisWerk** | máquina de helados · Alemania | *Eis* (helado) + *Werk* (taller/fábrica → oficio, calidad) |
| **GelatoVivo** | máquina de helados · Italia | *Gelato* + *Vivo* (vivo, fresco) |
| **FastLuxus** | bolso con impresión humorística · Alemania | *Fast* (casi, DE) + *Luxus* |
| **WärmePlatz** | asiento calefactor · Alemania | calor + lugar de uso |
| **Nailuna** | manicura · Alemania | nombre inventado, suave y memorable |
| **TargetAlarm** | alarma que dispara · USA | *Target* + *Alarm* |

**Reglas del patrón:**
1. Preferir nombres breves y legibles; compuestos como EisWerk o nombres inventados como Nailuna.
2. **En el idioma del país** donde se testea (DE→alemán, IT→italiano, US/UK→inglés, ES→español, FR→francés).
3. **Palabra 1 = el producto o su beneficio** (Eis, Gelato, Alarm, Kuschel).
4. Un refuerzo puede evocar calidad, función, emoción o humor pertinente; no copiar personajes/marcas.
5. Corto y fácil de pronunciar; admitir caracteres nativos como ä en WärmePlatz.
6. **Suena a marca real del país**, no a traducción. Debe generar confianza (oficio, tradición, seguridad).
7. Evitar nombres genéricos y conflictos evidentes; raíces internacionales no se excluyen si suenan naturales.
La skill de nombres prevalece sobre esta tabla orientativa; no es un patrón rígido de dos palabras.

---

## PASO 2 — Con el nombre seleccionado: 4 assets fijos + 1 logo horizontal para la web

Para imágenes aplicar únicamente la skill `nanobanana-pro-imagenes` vigente, con referencias
reales recuperadas de la fuente del producto; no inventar imágenes que no se hayan inspeccionado.
La selección automática del nombre no equivale a aprobación visual de los assets.

Generar y **guardar** con `nano_banana_pro` 2K (son **4 assets**, con los nombres oficiales de
`CEREBRO/reglas/vocabulario-de-imagenes.md`: **marca** · **embalaje** · **articulo** · **cara_fija**):

1. **MARCA (logo)** — un **EMBLEMA ILUSTRADO con carácter**, no un icono de línea con el nombre
   debajo. Forma de emblema (normalmente circular con borde), una **ilustración rellena y a color**
   del producto o de su mundo, con ambiente, y el nombre en una **tipografía con personalidad**
   (script, retro, serifa ornamentada) integrada en el emblema. Paleta rica, acorde al producto.
   ⚠️ **NUNCA texto debajo del nombre de la marca**: ni eslogan, ni descriptor, ni línea de apoyo.
   Solo la marca. Referencias que dio Emmanuel: **Tannenklang** (emblema circular rojo con bosque
   nevado ilustrado y script ornamentado) y **Swirli** (emblema crema con helado ilustrado a color
   y script retro con contorno). Ver `CEREBRO/lecciones/…-logos-con-caracter-y-cajas-de-verdad.md`.
2. **EMBALAJE (caja de producto)** — packaging **diseñado**, no una foto del producto pegada dentro
   de un recuadro. El producto se **integra** en el arte de la caja: composición propia, jerarquía
   tipográfica, color y formas de marca, con el logo mandando. Texto en el **idioma del país**,
   bullets de beneficios. Vista 3/4 sobre fondo gris neutro, aspecto de caja real de tienda.
   ⚠️ Un marco con una imagen dentro es exactamente lo que Emmanuel rechazó el 2026-09-02.
3. **ARTICULO** — **foto del producto SOLO sobre fondo gris neutro, calidad e-commerce
   profesional** (tipo ficha de Amazon/Shopify): el producto exacto de la imagen que pasó Emmanuel, ángulo
   3/4 frontal, luz de estudio suave y uniforme, sombra de contacto limpia debajo, enfoque nítido en todo el
   producto, alta resolución, sin props, sin manos, sin texto.
   ⚠️ El «mockup» es solo el paso de generarla; el asset se llama **`articulo`** y nunca «mockup». Es el que
   conserva como asset de catálogo. Por defecto NO se adjunta a generaciones de vídeo ni sustituye
   las variantes de la fuente; solo hacerlo si Emmanuel lo solicita expresamente.
   La imagen recuperada del enlace (o aportada por Emmanuel) es la referencia para generarlo.
4. **AVATAR** — seleccionar de la biblioteca activa la identidad acorde al cliente ideal
   (edad aproximada, género/presentación pertinente y papel), sin default de mujer joven.
   Reutilizar su foto e ID verificados, no generar otra cara ni duplicar un asset existente.
   Aplicar la lógica de [primer vídeo de test](references/primer-video-test.md).
   Foto realista tipo UGC para usarla como identidad fija en frames. Ver principio D del
   `maestro_fondo_realismo_fewshot_corregido.md` (el avatar es la única fuente de rostro).

Los cuatro assets anteriores se **descargan** a `NanoBanana/[CUENTA]/_assets/` y después:
1. Se **redimensiona a 1400 px** el lado mayor (un PNG de 2048² pesa hasta 8,5 MB y la app tarda
   en pintarlo; a 1400 baja a 0,5-2,7 MB sin perder nada útil).
2. Se **sube con `higgsfield upload create`** y se guarda **ESE** media_id.
   ⚠️ **El id del job que generó la imagen NO es un media_id.** Los dos son UUID y se parecen, pero
   el CDN de medias devuelve **403** con un id de generación: los assets no cargan en la app y
   cualquier generación que los pase como referencia falla. Pasó el 2026-09-02 con FlauschNest.
3. Formato: **1:1 para marca, embalaje y articulo** (son fichas de producto). El 9:16 es de los
   frames de vídeo. El avatar sí va vertical, porque es un selfie.

### Quinto asset obligatorio — LOGO_WEB_HORIZONTAL (orden 2026-09-08)

Después de tener la marca base, crear su adaptación horizontal para la cabecera de la web:
- Mismo nombre, identidad y paleta; símbolo a la izquierda y nombre legible a la derecha.
  Recomponer, no estirar el emblema cuadrado. Sin eslogan ni descriptor adicional.
- Proporción aproximada 3:1–4:1, texto reconocible en móvil y escritorio, buen contraste y
  márgenes ajustados. Priorizar claridad y confianza; no prometer una mejora de ventas demostrada.
- PNG con transparencia real si el flujo la permite: comprobar el canal alfa, no entregar
  un damero dibujado como si fuese transparente. Si no se obtiene, avisar del fondo real.
- Guardar en `NanoBanana/[CUENTA]/_web/logo_horizontal.png`, con prompt exacto y ficha
  de procedencia. Entregar a Emmanuel mediante enlace al archivo, separado de los cuatro fijos.
- **FUERA DE LA APP:** no añadir a `ASSETS`, `EDITOR/assets.json`, grupos de frames ni
  referencias de vídeo. Añadir su job_id y cualquier media_id derivado a
  `PANEL/overrides.json` → `hidden`, preservando las entradas existentes: el panel también
  recoge las generaciones automáticamente aunque no estén en ASSETS.
- No subirlo como referencia a Higgsfield salvo petición específica. Tampoco generarlo
  retroactivamente para cuentas antiguas sin encargo.

### Comprobación antes de cerrar un alta

No declarar un alta nueva completa hasta comprobar los cuatro assets habituales y el quinto
archivo horizontal: existe, abre correctamente, es más ancho que alto y lleva el nombre elegido.
Tras refrescar el panel, comprobar que los cuatro fijos aparecen y el logo horizontal no aparece
en sus assets ni en `PANEL/catalog.json`. Registrar su ruta en la sección «Entrega web privada»
de la ficha de cuenta, no en `imagenes_de_la_cuenta`. Si falta, informar «logo web pendiente»;
no dar por entregados cinco assets cuando solo hay cuatro.

## PASO 3 — Alta en el sistema (automático)
- **Lotes y puertas:** registrar también en `EDITOR/autoedit/store.py:ACCOUNTS`,
  `EDITOR/lanzar.py:ACTIVAS` y `EDITOR/frame.py:ACTIVAS`. Comprobar la cuenta en
  `/api/lote-app/catalog` servido por el proceso real, no solo en el HTML de Conceptos.
  Si requiere reinicio del servidor, conservar borradores y comprobar después el endpoint.
- `PANEL/generate_panel.py`: añadir la cuenta a **`ACTIVAS`**, a **`ASSETS`** (marca/embalaje/cara/articulo),
  a **`CUENTA_GRUPO`**, a **`EMOALL`/`GROUP_ORDER`** y a **`CONCEPTOS`** (aún sin conceptos).
- `registro.json`: nueva entrada de cuenta con mercado + media_ids.
- `CONCEPTOS.md` y `AGENTS.md` (lista de cuentas activas): actualizar.
- Crear carpetas `NanoBanana/[CUENTA]/`.
- Regenerar el panel y confirmar a Emmanuel que la cuenta ya está lista para lotes.

## PASO 3B — Primer test automático tras el alta

Leer y ejecutar [primer-video-test.md](references/primer-video-test.md) en todas las
nuevas altas encargadas por Emmanuel. Elegir el vídeo del producto con mejor rendimiento
observable de la cuenta competidora; preparar Genjutsu Motion Transfer con avatar del
cliente ideal, frame inicial aprobado, upscale si procede y edición posterior con Codex.
Entregar el MP4 final a la carpeta Drive confirmada del responsable de esa cuenta.
No terminar solo con «cuenta lista» si quedan pasos autorizados ejecutables; conservar
las revisiones y exponer dependencias concretas (métricas, frame, carpeta) sin inventarlas.

## PASO 4 — BAJA de un producto ("ya no voy a testear X")
- **Quitar la cuenta de `ACTIVAS`** en `PANEL/generate_panel.py` → desaparece del panel (conceptos y frames).
- Actualizar `AGENTS.md` / `CONCEPTOS.md` marcándola como retirada.
- **NUNCA borrar archivos, carpetas, assets ni medias.** Todo queda intacto por si se retoma.
  (Regla nº8 de AGENTS.md.)

---

## Notas
- Todos los prompts de imagen siguen la skill única vigente `nanobanana-pro-imagenes`.
- El idioma/mercado de la cuenta queda fijado desde el alta y se aplica solo en todas las generaciones.


Todos los mockups nuevos de productos, variantes y cajas deben usar el fondo de estudio gris neutro del mockup aprobado de EisWerk con fresas. Referencia visual exacta: /Volumes/T7/AUTOMATIZACION SEGA/Diseños/EisWerk/Fresa/Mockup gris.png. Conservar el contraste del contorno, las aberturas y el detalle del producto; incluir el gris en el prompt y revisar la imagen resultante.
