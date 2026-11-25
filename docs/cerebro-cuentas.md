# Cerebro de cuentas (25/11/2026)

Encargo de Emmanuel, segunda parte del mismo cerebro que `aprendizaje-por-lote.md`, y sobre la misma base. Ese
cerebro aprende **cómo quiere él los vídeos**; este, **qué funciona en sus cuentas** y qué probar después.

**Solo mide vistas y comentarios, no ventas.** Es la orden de CEREBRO (`granja-de-videos.md`): «SOLO vistas y
comentarios para revisar redes». La vista lo avisa arriba.

## Datos

| Tabla | Qué guarda |
| --- | --- |
| `social_accounts` | Cada cuenta (`instagram` o `facebook`, `handle`, `kind`: `propia` o `competidor`, producto actual, país y `count_from`: desde cuándo cuenta). WollZauber cuenta solo sus 2 últimos vídeos. |
| `social_posts` | Cada reel: `shortcode` único por red, enlace, fecha de publicación, descripción. También el producto **de esa publicación** (una cuenta puede haber cambiado de producto: `siilvenaa` fue Nailuna y ahora es FalterPfote), el vídeo de PRINCIPAL si existe, de dónde sale (`perfil`, `importado`, `movil`) y su **ADN** (`dna`). |
| `social_metrics` | Cada lectura: cuándo se leyó, la edad del reel en horas, vistas, comentarios y me gusta si constan, la fuente y si el número estaba redondeado («36,4 mil»). Las ventanas de 24, 48 y 72 h son la lectura más cercana a esas edades (±8 h). Si una ventana no se leyó, no se inventa. |
| `split_tests` | Cada test: el reel base, el pilar que cambia, el paso (1 = gancho, 2 = texto…), el lote que lo produce, sus reels y el resultado. |

## De dónde salen

1. **Sus 4 cuentas de Instagram:** `eiswerrk` → EisWerk, `siilvenaa` → FalterPfote, `haarzauberr` → HaarZauber
   e `itswollzauber` → WollZauber.
   - **Lectura:** las lee el Mac con la lectura de perfiles que ya existe (`profile_fetch`, `agente-mac/perfil.mjs`):
     la cuadrícula da las vistas, y `yt-dlp -J` de cada reel da la fecha, los comentarios, los me gusta y la
     descripción.
   - **Frecuencia:** el barrido pide la lectura de las propias cada 6 h y la de los competidores de un producto una vez al día. Las cuentas que solo vienen del histórico no se vuelven a leer. `yt-dlp` lee uno a uno solo los 12 reels más recientes de cada lectura, para no cargar el Mac ni la sesión de Instagram. Así hay lecturas cerca de las 24, 48 y 72 h de cada reel
     nuevo.
   - **iPhone:** solo para lo que no es público (alcance, métricas internas). Los programas del móvil los hace
     Codex.
2. **Histórico de AUTOMATIZACION SEGA:** el importador `scripts/importar-cerebro.ts` lo hace Codex.
   - **Fuentes:**
     - el ranking de EisWerk (10 reels, vistas);
     - los `*.info.json` de `eiswerrk` y de las demás cuentas (fecha, comentarios y me gusta, sin vistas);
     - `profile-metrics.json` de `eiswerrk` y `haarzauberr`;
     - `ControlProductosCentral` (7 cuentas, 35 pares de reel y vistas);
     - las revisiones de SplitTesting (ZielAlarm `DfIDEW1sd8b`, la única asociación verificada);
     - los encargos `TEST_PRODUCTOS_APP/emmanuel/<UUID>.json`, para el ADN pedido: ganchos de los slots, canciones
       y fondos.
   - **Cada observación guarda su fuente y su edad real.** No se renombra una lectura de «≈44 h» como «48 h».
   - **Los encargos no prueban publicación:** su ADN solo se une a un reel cuando hay una asociación
     verificable.
3. **Lotes de PRINCIPAL:** cada reel se une a su vídeo por la cola de publicación (`publications`: cuenta, fecha y
   descripción) o, en los anteriores a esa cola, por la fecha y el parecido de la descripción.
4. **Competidores:** el `source_url` de cada producto es una cuenta `competidor`. Se lee igual y sirve de referencia
   de ángulos, no para el veredicto de las cuentas propias.

## ADN de cada vídeo

| Pieza | Valores |
| --- | --- |
| `angulo` | El gancho o ángulo en pocas palabras: «regalo de Navidad», «antes y después», «reacción»… |
| `fondo` | Tipo de sitio: calle, tienda, salón, cocina… |
| `texto` | El rótulo principal |
| `cancion` | La canción o «audio original» |
| `descripcion` | La descripción publicada |
| `producto`, `pais` | El producto y el país del reel |

- **Con vídeo de PRINCIPAL:** sale del desglose (`places`, el gancho y los rótulos propuestos), del montaje (los
  rótulos finales y la canción) y de la publicación.
- **Sin vídeo de PRINCIPAL:** Haiku lo saca de la descripción, del texto de la miniatura y del fotograma que da el
  perfil. Se marca `dna_source = 'estimado'`.
- **Normalización:** los valores de `angulo` y `fondo` se reducen a una lista corta, que Haiku reutiliza como los
  temas del aprendizaje. Así se pueden contar.

## Modelo

**Vistas.** Para comparar reels de distinta edad, cada reel usa sus vistas a 72 h. Si no hay lectura cerca de las
72 h, usa la más cercana entre 24 h y 7 días, corregida por la curva media de su cuenta (proporción de vistas a esa
edad frente a las 72 h). Al principio, sin curva propia, se usa la global.

**Éxito.** Un reel es un **éxito** si supera la mediana de su cuenta en las mismas condiciones. Con menos de 5 reels
en la cuenta, su mediana se mezcla en escala logarítmica con la de su producto (o la global), en proporción a los reels
que tiene (`baselineFor`). Las cuentas van de cientos a cientos de miles de vistas: comparar una cuenta pequeña con la
mediana global la haría parecer viral sin serlo. Los comentarios
llevan la misma cuenta aparte: comentarios por cada 1.000 vistas frente a la mediana.

**Por pieza de ADN.** Para cada valor (p. ej. `angulo = regalo`), en tres niveles con reparto de fuerza (beta-binomial
jerárquico):

- **global:** `θ_g ~ Beta(1 + éxitos_g, 1 + fallos_g)`;
- **producto:** prior `Beta(k · m_g, k · (1 − m_g))`, con `m_g` la media global y `k = 4`, y se suman sus éxitos y
  fallos;
- **cuenta:** prior sacado de la media de su producto (o la global si no hay producto), con el mismo `k`.

Una cuenta nueva sin reels hereda el prior de su producto y del global. Se recalcula solo al llegar cada lectura
nueva, en el mismo barrido.

**Probabilidad.** Para cada valor se calcula `P(θ > 0,5)`: la probabilidad de que esa pieza supere la mediana, con
la función beta regularizada. Se recomienda un valor si `P ≥ 0,7` y hay al menos 2 reels. Se marca «a evitar» si
`P ≤ 0,3` con al menos 2 reels. Con menos datos, sale como «por probar».

**Textos ganadores.** Los rótulos de los reels con éxito, ordenados por su probabilidad, junto con sus variaciones
probadas en split tests.

## Split tests (regla de Codex, `SplitTesting-20261029/pilot-six/REGLA_FIJA.md`)

1. **Candidatos:** los reels propios con mayor `P(éxito)`, que superen 1,5 veces la mediana y tengan al menos
   48 h. Uno por reel original: dos vídeos son dos originales distintos, no dos variantes de una base.
2. **Pilar a cambiar:**
   - **Paso 1:** **solo el gancho**, regenerado con Genjutsu Motion Transfer. El texto, la canción y la edición
     son los de su propia referencia.
   - **Paso 2:** solo si el paso 1 vuelve a funcionar, es decir, si supera la mediana a 72 h. Entonces cambia
     **el texto**, con una variación mínima (otra redacción o emoji, mismo significado).
   - **Después:** el fondo y luego la canción, según resultados.
   - **Nunca** se sustituye el paso 1 por un cambio de descripción.
3. **Botón «Crear split test»** (es crear un lote, no confirmar una generación; regla 3 de vídeos). Crea un lote con
   el vídeo base:
   - **Con vídeo de PRINCIPAL:** lo duplica con su ADN.
   - **Sin vídeo de PRINCIPAL:** el enlace del reel es la referencia.
   - En los dos casos, la tarjeta lleva la indicación del paso: «Cambia solo el gancho: …; conserva texto,
     canción y edición».

   A partir de ahí el lote sigue solo, como cualquier lote, y el test queda en `split_tests`. Cuando sus reels
   tienen 72 h, el barrido decide si pasa al paso 2.

## Vista «Cerebro de cuentas» (`/cerebro`)

De arriba abajo:

- **El aviso:** «Mide vistas y comentarios, no ventas».
- **Por cuenta:** la mediana, los últimos reels con sus vistas a 24, 48 y 72 h y qué funciona allí.
- **Global:** los ángulos recomendados con su probabilidad, los fondos y las canciones.
- **Split tests:** los mejores candidatos, con el pilar que toca y el botón, y los tests en marcha.
- **Textos ganadores.**

Es limpia, sin confirmaciones.

## Reparto

- **Codex:** la ampliación de `perfil.mjs` (yt-dlp por reel), el importador del histórico, la migración, el barrido y
  las pruebas.
- **Claude:** este diseño, el modelo (`modelo.ts`, con sus pruebas), la vista y la revisión.

## Estado de la prueba real (25/11/2026)

- **Histórico cargado en producción** (`importar-cerebro.ts --cargar`, por `railway ssh`):
  - 267 reels, 421 lecturas y 50 cuentas;
  - antes se completaron en este Mac, con yt-dlp, la fecha, la descripción y los comentarios de 128 de los 131 reels
    propios que no los tenían.
- **ADN:** sacado por Haiku de la descripción. Pasaba por el Claude Code del Mac.
  - No se mandan miniaturas a la API: no puede abrir direcciones de Instagram por su robots.txt.
  - Se separan el ángulo (la idea), la CTA y el rótulo literal.
  - En el histórico no hay desglose: el fondo, la canción y casi todos los rótulos constan como «desconocido», y no
    se cuentan.
- **Lectura cada 6 h de las cuentas: bloqueada.** El agente del Mac (1.11.0, ya instalado) necesita la sesión de
  Instagram en `~/.principal-agente-instagram.txt`. Hoy falla con `sin_sesion`. Hay que exportarla con
  `agente-mac/exportar-sesion.sh`, con Instagram abierto en Brave. Eso es del dueño: el Mac no inicia sesión por él.
