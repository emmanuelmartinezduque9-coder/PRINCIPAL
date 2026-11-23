# Nuevo producto desde un enlace, mockup gris, marca y nichos con datos (23/11/2026)

Pedido de Emmanuel para la pantalla «Nuevo producto»:

1. Crear un producto pegando **solo un enlace** (reel o cuenta de Instagram/TikTok, o un producto de
   AliExpress) y eligiendo el **país**. Sin nombre, sin «qué hace» y sin fotos obligatorios.
2. Recursos automáticos: **mockup del producto sobre fondo gris** y **nombre de marca** corto,
   memorable, que dé confianza y con sentido para el producto o el nicho. La mejor opción, sin avisos
   de marca.
3. Botón **«Buscar nicho / ángulo / audiencia diferente»** con datos reales (vistas, anuncios
   activos, tiendas que lo venden). Decide el usuario.
4. Basarse en su material antiguo (motor de Codex en `/Volumes/T7/AUTOMATIZACION SEGA`).

## Cómo lo hacía el motor antiguo (revisado antes de diseñar)

- No había código de análisis: el panel mandaba un texto largo a un **agente de Codex** que seguía
  «skills» en markdown (`nuevo-producto`, `nombres-marca-emmanuel`, `angulos-de-venta`), con el
  navegador (Instagram con sesión), yt-dlp y Higgsfield. Era el patrón caro (≈500 $/mes).
- **Producto**: el agente miraba reels, fotogramas y la tienda. Regla clave: «el nombre de usuario
  no basta para saber qué vende».
- **Mockup** = asset `articulo`: Nano Banana 2K **1:1**, fondo gris neutro medio **#929396**, 3/4
  frontal, luz de estudio, sombra de contacto, sin manos/props/texto. Prompt validado en
  `docs/reglas-origen/disenos/mockup-gris-eiswerk.json`.
- **Marca**: una sola, sin votación; idioma del mercado; «palabra 1 = producto o beneficio»; que
  suene a marca real y dé confianza; sin Shop/Store/Pro; ejemplos EisWerk, HaarZauber, WärmePlatz,
  Nailuna, ZauberSchirm…
- **Ángulos**: comprador × usuario × momento × motivo × utilidad real; niveles de evidencia (ventas
  verificadas / señales / hipótesis). Los datos reales se limitaban a lo que el agente veía en el
  navegador; **no había Biblioteca de anuncios de Meta, TikTok Creative Center ni APIs**.

Todo eso queda en tres reglas nuevas, editables en «Reglas»: `alta-de-producto`,
`nombres-de-marca` y `nichos-con-datos` (junto a las de ángulos que ya había).

## Decisiones

### La IA se consulta en pasos fijos (no un agente que lo conduce todo)
Igual que el resto de PRINCIPAL (`docs/superpowers/specs/2026-11-22-plataforma-y-motor-angulos-design.md`):
el programa hace lo mecánico (traer el vídeo, sacar fotogramas, leer la tienda, enviar a
Higgsfield) y Claude se llama **una vez por alta** y **una vez por búsqueda**, con entradas y salidas
fijas, con tope de gasto y apunte en el libro.

### Datos reales: búsqueda web de Claude (servidor de Anthropic)
- La pasarela (`src/llm/gateway.ts`) admite ahora `web: { searches, fetches, country }`: añade las
  herramientas del servidor `web_search_20260209` y `web_fetch_20260209` (Sonnet 5.5), buscando
  desde el país del producto.
- **Coste**: cada búsqueda 10 US$/1000 = 0,01 US$ (se apunta aparte en el libro, `webSearches`);
  leer páginas no se cobra aparte (solo sus tokens). La reserva previa cuenta el peor caso de lo que
  pueden añadir los resultados. Un alta ≈ 5 búsquedas + 3 páginas; una búsqueda de nichos ≈ 10 + 4.
- Con búsqueda, el JSON se pide **al final del texto** (no con `output_config.format`, porque el
  texto lleva citas y resultados intercalados) y se valida igual con el esquema.
- Las llamadas con búsqueda se piden **en flujo** (`messages.stream`): sin flujo, la conexión se
  cortaba a los ~60 s mientras Claude buscaba en silencio (comprobado en la prueba real del
  23/11/2026; con flujo, búsquedas de 61 s y 80 s terminaron bien).
- `pause_turn` (el servidor pausa a mitad de las búsquedas): se continúa hasta 2 veces, cada vuelta
  con su propia reserva y su apunte.
- **Contra cifras inventadas**: la pasarela devuelve las direcciones que de verdad salieron en los
  resultados (`webSources`). Cada prueba o fuente cuya dirección no esté ahí se guarda y se enseña
  como **«sin comprobar»**.
- Valorado y no elegido ahora: Apify/ScrapeCreators (de pago, otra clave), Meta Ad Library API
  (necesita identidad verificada y token). Si la búsqueda web se queda corta para vistas de
  Instagram, el siguiente paso es uno de esos servicios.

### Alta desde enlace (`src/server/product-intake.ts`, tabla `product_intakes`)
- Enlaces admitidos (`classifyLink`): reel/vídeo y cuenta de Instagram y TikTok (también YouTube y
  Facebook como vídeo), AliExpress (`*.aliexpress.*`, `a.aliexpress.com`, `ali.ski`) y cualquier
  tienda `https` pública. Países: los que ya admite la web (DE, AT, CH, IT); el idioma sale del país.
- El producto se crea **en el acto** con nombre provisional («Producto nuevo») y la persona va a su
  pantalla, donde el panel «Alta automática» enseña cada paso.
- **trayendo** (solo reels): el mismo camino que las referencias del montaje (`link-media.ts`):
  yt-dlp en la nube y, si no puede (Instagram), tarea `media_fetch` al **Mac del dueño**. Si el Mac
  no responde se dice claro («Enciéndelo y abre el agente de PRINCIPAL…») y, a los **10 minutos**,
  se sigue sin el vídeo (con aviso «se analizó sin ver el vídeo»). El agente del Mac no cambia.
- **Cuentas**: el agente del Mac solo baja vídeos sueltos; para una cuenta, Claude la busca en
  internet (su tienda, sus vídeos, AliExpress…). Si no puede identificar el producto, el alta queda
  «fallida» con el motivo y la sugerencia de pegar un reel concreto. Nunca se rellena a ciegas.
- **AliExpress/tienda**: el servidor lee la página (título, `og:image`, `imagePathList`) con un
  `fetch` protegido (solo `https`, nunca direcciones privadas, tope de tiempo y tamaño) y manda hasta
  3 fotos a Claude; Claude además abre el enlace con `web_fetch`.
- **analizando**: 8 fotogramas del vídeo y/o fotos de la tienda + reglas `alta-de-producto` y
  `nombres-de-marca` + las marcas que ya existen (para no repetir raíces). Devuelve producto, qué
  hace, mecanismo, nicho, audiencia, ángulo actual, emoji, **marca** (la mejor + 2 alternativas,
  con el porqué), qué imagen sirve de referencia y el **prompt del mockup**. Se guarda en el producto
  (nombre = marca, «qué hace», nicho, audiencia, ángulo, emoji) y la imagen de referencia como foto
  con papel «Otra». Una sola llamada pagada por alta (`runStep`).
- **mockup**: Nano Banana (el modelo de imagen elegido en Ajustes), **1:1, 2K**, 1 imagen, en el
  **Higgsfield de quien pidió el alta**, con la referencia. Se pide presupuesto antes: si cuesta más
  de **6 créditos** (lo normal es ~2) no se envía y la web enseña «Generar mockup (N créditos)» para
  aceptarlo. El resultado entra en las fotos con papel **«Artículo»**. Sin Higgsfield conectado: se
  avisa y queda el botón «Generar mockup». También sirve para productos creados a mano.
- Lo avanza la tarea programada **`producto.altas`** (cada minuto) y el trabajo `producto.alta`, que
  se lanza al crear. Cada alta se reserva 5 min (`lease_until`) para que dos procesos no la avancen.
- «Volver a analizar» crea otra fila (la anterior queda como historial).

### Nicho, ángulo o audiencia diferente (`src/server/product-research.ts`, tabla `product_research`)
- Pestaña **«Nicho y ángulos»** del producto: lo actual (nicho, audiencia, ángulo) y tres botones;
  una indicación opcional («el del Grinch está saturado en Alemania»).
- Claude (Sonnet 5.5, 10 búsquedas + 4 páginas) con las reglas `angulos-de-venta`,
  `angulos-ejemplos` y `nichos-con-datos`: primero mide la **situación actual** (saturación con
  pruebas) y después **3–5 propuestas** con por qué, cómo se vería en vídeo, 2 ganchos en el idioma
  del mercado, nivel de evidencia y **pruebas con cifra y enlace**. Las ya propuestas no se repiten.
- **Sin avisos de marca** (indicación del 22/11/2026).
- «Usar este nicho/ángulo/audiencia» lo guarda en el producto. Decide la persona.

## Prueba real (23/11/2026, Claude de verdad; base de datos de prueba local)
- **Cuenta `instagram.com/portablecoffees` sola**: Instagram no deja abrir el perfil sin sesión (ni a
  Claude ni al servidor; la API pública de perfiles da 404 hasta con la cuenta oficial). Resultado:
  «No se ha podido identificar el producto…» con el motivo. No inventó nada. 0,057 $.
- **AliExpress `de.aliexpress.com/item/1005010653623032.html` solo**: AliExpress devuelve un captcha
  a los servidores. Igual: lo dice claro. 0,051 $. → Por eso se añadió la **foto o captura opcional**
  en «Pegar un enlace».
- **La misma cuenta + la foto del artículo de KaffeeBild**: identificó «cámara retro de plantillas
  para estampar dibujos en la espuma del café», marca **SchaumKunst** (alternativas KaffeeMotiv,
  LatteKlick), nicho/audiencia/ángulo con fuentes de Amazon comprobadas, la foto subida como
  referencia y un prompt de mockup gris detallado; mockup enviado (2 créditos, Higgsfield simulado
  en esta prueba). 0,069 $.
- **Buscar nicho / audiencia diferente** para ese producto: 4 propuestas cada una (Halloween y
  Adviento, anfitriones de Kaffeetafel/brunch, oficina, cafés pequeños, familias con chocolate
  caliente) con pruebas de tiendas alemanas y suizas y Amazon.de, todas comprobadas; ganchos en
  alemán. 0,19–0,25 $ por búsqueda, 60–80 s.

## Cuentas de Instagram y TikTok por el Mac (23/11/2026, después del fallo de @frozenglow.us)

Emmanuel pegó solo el perfil `instagram.com/frozenglow.us` (producto 55) y el alta falló pidiendo
un reel o rellenarlo a mano. Eso no vale: él pega la cuenta y el país y el sistema lo resuelve solo,
como Codex (que usaba un navegador con su sesión).

- **Instagram y TikTok pasan siempre por el agente del Mac** (programa **1.5.0**, `puede:
  ["enlace_medio", "perfil"]`). Tarea nueva `profile_fetch` (tabla `link_profiles`,
  `src/server/link-profiles.ts`): el Mac entrega un JSON con la cabecera del perfil (nombre y
  biografía), sus enlaces (la tienda) y hasta 15 reels con sus vistas, texto y miniatura.
- **Cómo lee Instagram el Mac** (`agente-mac/perfil.mjs`): un **Brave sin ventana** con una carpeta
  de perfil temporal (nunca la de Emmanuel) y las cookies de Instagram de
  `~/.principal-agente-cookies.txt`; abre `instagram.com/<cuenta>/reels/` y lee la cuadrícula.
  Comprobado el 23/11: la extracción de perfiles de yt-dlp está marcada como rota, la API pública de
  perfiles da 404 y la API web con sesión da 429 a programas; el HTML ya no trae los reels. Solo un
  navegador de verdad los ve.
- **TikTok**: yt-dlp `tiktok:user` con `--flat-playlist --playlist-items 1-15 -J` (trae vistas).
- **Sesión**: el agente arranca con launchd y macOS no le deja leer las cookies de Brave; el archivo
  `~/.principal-agente-cookies.txt` que tenía **no llevaba la sesión iniciada** (`sessionid`).
  `agente-mac/exportar-sesion.sh` (desde el Terminal) la copia de Brave con yt-dlp; repetirlo si
  Instagram cierra la sesión. El agente avisa con un código: `[aviso]`, `[sin_sesion]`, `[sin_brave]`.
- **Después del perfil**: se eligen los **2 reels más vistos** y se traen por el camino de siempre
  (`media_fetch`; los de Instagram, directos al Mac, sin perder minutos con yt-dlp en la nube). Claude
  recibe el perfil, las miniaturas de los 4 más vistos (con sus vistas), los fotogramas de esos reels
  y, si el enlace de la biografía es una **tienda Shopify**, sus productos de `/products.json` con
  sus fotos (también para una tienda pegada directamente). La foto de referencia del mockup puede
  ser de la tienda, un fotograma o una miniatura.
- **Si el Mac no responde**: la pantalla dice solo «Esperando a tu Mac para leer Instagram…» y se
  reintenta sola cada minuto, **sin rendirse ni pedir rellenar nada**. Si el Mac no puede leer el
  perfil, se vuelve a pedir cada 5 minutos (hasta 6 veces) con un mensaje claro según el motivo.
  Los fallos de análisis se muestran con una frase corta («No se ha podido identificar el producto.
  Pulsa «Volver a analizar»…»), sin el texto técnico.
- «Volver a analizar» una cuenta vuelve a leer su perfil.

**Bloqueo encontrado en la prueba real (23/11/2026)**: la cuenta de Instagram de Emmanuel enseña un
aviso de seguridad («Es posible que tu correo electrónico no sea seguro — Actualizar dirección de
correo electrónico») que tapa todas las páginas. Mientras siga, ningún programa puede leer perfiles
con su sesión (el agente lo detecta y lo dice: `[aviso]`). Solo lo puede resolver él en Instagram.

## Pendiente / siguientes pasos
- Países e idiomas nuevos (FR, ES, EE. UU., Reino Unido): hoy la web solo admite DE/AT/CH/IT.
- Si Emmanuel quiere también **marca (logo)** y **embalaje** automáticos como en el motor antiguo,
  van con el mismo patrón que el mockup.
- Medir si la búsqueda web trae suficientes cifras de Instagram/TikTok; si no, un proveedor de datos
  (Apify o similar) como fuente adicional para la investigación.
