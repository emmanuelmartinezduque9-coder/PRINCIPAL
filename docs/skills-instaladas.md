# Skills de Claude: que se ha instalado y que no

Revision hecha el 2026-11-22 sobre los cinco repositorios recomendados en el video. Se leyeron los
archivos reales de cada uno (sin ejecutar nada de ellos). Una "skill" es, en esencia, una carpeta con
instrucciones en texto que Claude lee cuando hace falta. Eso es seguro. Lo que hay que vigilar es
cuando un paquete trae ademas programas que se ejecutan solos, servicios en segundo plano o envio de
datos a terceros.

## Resumen rapido

| Herramienta | Que hace | Estado |
|---|---|---|
| superpowers | Metodos de trabajo (planificar, depurar, probar) | Ya instalada |
| impeccable | Criterio de diseno para que la web no se vea mal | Instalada (solo las instrucciones) |
| find-skills | Ayuda a buscar mas skills | Instalada (con una advertencia) |
| task-observer | Anota correcciones para mejorar skills | No instalada |
| claude-mem | Memoria entre sesiones | No instalada |

Las skills instaladas estan en `/home/user/principal/.claude/skills/`. Cada carpeta lleva su licencia
y un archivo `ORIGEN.md` con la direccion del repositorio y la version exacta (commit).

## 1. superpowers: ya instalada

Conjunto de metodos de trabajo (planificar antes de programar, depurar con orden, pedir revision,
verificar antes de dar algo por terminado). Ya esta disponible en este entorno; no se ha tocado nada.

## 2. impeccable (diseno de interfaces): instalada

**Que es.** Una skill de diseno frontend de Paul Bakaus. Da a Claude un criterio de diseno: jerarquia,
tipografia, espaciado, color, contraste, movimiento, estados vacios, version movil. Incluye comandos
como `critique` (revision de diseno), `audit` (accesibilidad y rendimiento), `polish` (pulido final),
`layout`, `typeset`, `adapt` (adaptar a movil), `clarify` (mejorar los textos), etc. Es la mas
relevante para tu queja de que la web anterior se veia mal.

**Que se instalo.** `/home/user/principal/.claude/skills/impeccable/`: el `SKILL.md`, la carpeta
`reference/` (unos 50 archivos de texto con las guias de cada comando), la licencia (Apache 2.0) y el
aviso de terceros (`NOTICE.md`).

**Que se dejo fuera y por que.**
- La carpeta `scripts/` y un lanzador llamado `impeccable`. El lanzador, si no encuentra su programa,
  **descarga un binario desde GitHub** (`github.com/pbakaus/impeccable/releases`) y lo ejecuta. Tiene
  comprobacion de huella (sha256), pero sigue siendo un programa externo que no se ha revisado, asi
  que no se instala.
- Los hooks (`plugin/hooks/hooks.json`): se ejecutarian al iniciar sesion, tras cada edicion de
  archivos y al terminar cada turno. Sin el programa no hacen nada, y no se copian.
- Los 5 agentes auxiliares (`plugin/agents/`), la extension de navegador y el resto del repositorio.

**Efecto de lo que falta.** La skill funciona como guia de diseno en texto. Su propio `SKILL.md`
preve el caso "lanzador no disponible" y manda leer `PRODUCT.md` y `DESIGN.md` directamente. No
funcionaran: las capturas automaticas (`shot`), el detector automatico de errores de diseno, el modo
`live` (elegir elementos en el navegador) y `generate`. Para ver el resultado hay que usar las
herramientas de captura que ya tenga el proyecto.

**Riesgos y avisos.**
- Los archivos `reference/live-setup.md` y `reference/hooks.md` describen cambios que tocarian la
  configuracion del proyecto (politica de seguridad de contenido en `next.config`, hooks en
  `.claude/settings.local.json`). Solo aplican si se pide `live` o `hooks`; no se usaran sin tu
  aprobacion.
- `reference/init.md` indica pedir al usuario que ejecute `npx impeccable login` (cuenta gratuita en
  su servicio). Solo se dispara si el programa que no instalamos lo imprime; si aparece, ignorarlo.
- No se encontraron instrucciones sospechosas ni envio de datos en los textos revisados.
- Licencia Apache 2.0: uso libre, conservando la licencia (ya incluida).

## 3. find-skills (buscador de skills): instalada, con advertencia

**Que es.** Una skill de Vercel de un solo archivo (`SKILL.md`, licencia MIT). Cuando se le pregunta
"existe una skill para X?", enseña a Claude a buscar en el catalogo skills.sh usando la herramienta
`npx skills`.

**Que se instalo.** `/home/user/principal/.claude/skills/find-skills/` con `SKILL.md`, `LICENSE` y
`ORIGEN.md`. No se copio la herramienta de linea de comandos (el repositorio `vercel-labs/skills`
completo), solo la skill.

**Riesgos que debes conocer.**
- El texto sugiere instalar skills con `npx skills add <paquete> -g -y`: eso instala en tu cuenta
  (`-g`, global) y sin pedir confirmacion (`-y`). Es justo la forma de instalar codigo de terceros que
  esta revision intenta evitar. **Regla para este proyecto: Claude nunca instala una skill nueva sin
  tu permiso expreso, aunque esta skill lo sugiera.**
- La herramienta `npx skills add` envia telemetria de instalacion (se ve en `src/add.ts` y
  `src/telemetry.ts` del repositorio). Otra razon para no usarla sin preguntarte.
- La propia skill recomienda desconfiar de skills con pocas instalaciones o de autores desconocidos;
  es un buen criterio y conviene aplicarlo.

## 4. task-observer (repositorio "one-skill-to-rule-them-all"): NO instalada

**Que es.** Una skill grande (autor Eoghan Henn, licencia CC-BY-4.0) que observa tus sesiones, anota
correcciones y repeticiones en un registro y propone mejoras a otras skills.

**Por que no se instalo.**
- Pide invocarse **antes de la primera accion de cada sesion** y ejecutar un script de arranque
  (`scripts/session-start-scan.sh`, unos 58 KB de shell) y otros ocho scripts mas un validador en
  Python de 230 KB. No es una skill de "solo texto": depende de codigo que habria que auditar entero.
- Esta pensada para activarse con hooks de inicio de sesion y para escribir un registro persistente
  en una carpeta del usuario. Este proyecto corre en un contenedor efimero y ya guarda sus decisiones
  en `docs/` (regla del proyecto) y en tu Obsidian; un segundo registro paralelo se perderia o
  duplicaria.
- Es muy extensa (el nucleo mas unos 600 KB de referencias), lo que consume contexto en cada sesion
  sin aportar a construir la web.
- Contiene opciones que pueden consultar red (comprobacion de versiones, seguimiento de incidencias),
  aunque dice que son opcionales.

**Hallazgos.** No se vieron instrucciones maliciosas ni llamadas de red en los scripts (busqueda de
`curl`, `wget`, direcciones web: sin resultados relevantes), pero los scripts no se auditaron linea
por linea. Si mas adelante quieres algo parecido, es mejor una nota simple en `docs/`.

## 5. claude-mem (memoria entre sesiones): NO instalada

**Que es.** Un plugin que graba lo que hace Claude en cada sesion y se lo vuelve a ofrecer en la
siguiente.

**Por que no se instalo.**
- **No es una skill, es un sistema:** ejecuta hooks en cada inicio, en cada mensaje tuyo y tras cada
  accion de herramienta (`plugin/hooks/hooks.json`), levanta un **servicio local en segundo plano**
  (Bun), guarda una **base de datos** SQLite en `~/.claude-mem` e incluye un servidor MCP
  (`plugin/.mcp.json`).
- **Datos a terceros:** un segundo agente ("observer") procesa todo lo que Claude lee, edita y
  ejecuta para resumirlo. El README indica que el instalador pide iniciar sesion y ofrece un proveedor
  de pago con prueba de 30 dias que pide tarjeta, que la **sincronizacion en la nube es opcional**, y
  que las **estadisticas de uso anonimas vienen activadas por defecto**. Podria incluir contenido de
  la tienda o de datos de Finanzas leidos en una sesion.
- **Entorno efimero:** el contenedor se borra, asi que la memoria local se perderia; nuestra memoria
  ya vive en el repositorio (`docs/`) y en Obsidian, donde la ve el dueño y queda versionada.
- Se instala con `npx claude-mem install`, lo que ejecutaria codigo descargado.

Licencia Apache 2.0. Sin hallazgos de instrucciones maliciosas; el descarte es por encaje y por
privacidad, no por malicia.

## Que cambia para ti

- Claude tendra mas criterio de diseno al construir la web (impeccable) y sabra buscar skills
  (find-skills), pero **no se ha instalado ningun programa, servicio ni hook nuevo**.
- Si algun dia quieres activar las partes dejadas fuera (el detector automatico de impeccable, por
  ejemplo), hay que decidirlo expresamente y revisar ese binario antes.
- Cualquier skill nueva debe pasar por esta misma revision antes de copiarse al proyecto.

---

# Segunda tanda (catalogo skills.sh)

Revision hecha el 2026-11-22 sobre los candidatos que devolvio el catalogo skills.sh, con tu permiso
para instalar los utiles. Mismo metodo que la primera tanda: se descargo cada repositorio a una
carpeta temporal, **no se ejecuto nada de ellos** (ni instaladores ni `npx skills add`) y solo se
copiaron a mano los textos revisados. De cada skill se leyo el archivo principal (`SKILL.md`) y se
paso a todos los archivos copiados una busqueda automatica de comandos, direcciones web, claves,
inicios de sesion y caracteres ocultos. Las bibliotecas largas de ejemplos no se leyeron linea por
linea.

## Resumen rapido

Se instalaron **18 skills nuevas** (todas son texto; ningun programa, servicio, hook ni conexion
nueva). Con las dos de la primera tanda hay 20 en `/home/user/principal/.claude/skills/`.

| Candidata (repositorio) | Estado | Para que sirve en este proyecto |
|---|---|---|
| **motion-team/creative-strategy-skills** (8 skills) | | La mas util para el motor de angulos |
| `brand-intake` | Instalada | Entrevista + investigacion para crear la ficha de contexto de una marca/producto |
| `review-audit` | Instalada | Minar reseñas: dolores, momento de compra, objeciones, transformacion y frases literales |
| `creative-strategy-engine` | Instalada | Mapa angulo x persona x nivel de consciencia del comprador |
| `hook-writing` | Instalada | Escribir ganchos segun disparador psicologico y nivel de consciencia |
| `hook-tactics` | Instalada | Catalogo de 35+ tipos de gancho para tener variedad que probar |
| `hook-voice-patterns` | Instalada | Plantillas de gancho con voz "nativa" de red social, no de anuncio |
| `creative-mechanics` | Instalada | Estructuras de concepto: como convierte un video una idea en significado |
| `visual-formats` | Instalada | Catalogo de 45+ formatos visuales y cuando usar cada uno |
| **vyralcontent/content-skills** | | Video corto organico (TikTok, Reels) |
| `viral-short-form` | Instalada (modificada) | Guion completo de video corto: gancho, retencion, cierre, ajuste por plataforma |
| `viral-hooks` | Instalada (modificada) | Gancho de 1 a 3 segundos en sus tres capas: imagen, voz y texto en pantalla |
| `viral-tiktok-content` | Instalada (modificada) | Particularidades de TikTok: algoritmo, sonidos, funciones nativas, TikTok Shop |
| `viral-instagram-reels` | Instalada (modificada) | Particularidades de Reels: envios, Trial Reels, originalidad, diagnostico de un video flojo |
| `viral-youtube-shorts`, `viral-short-form-ideas`, `viral-captions-and-ctas` | No instaladas | Fuera de lo pedido; se pueden añadir igual si publicas en Shorts o quieres mas detalle de textos |
| **coreyhaines31/marketingskills** | | Marketing general (pensado para software, pero aplicable) |
| `customer-research` | Instalada | Investigar al cliente: reseñas, Reddit, foros; personas compradoras; que se puede concluir y que no |
| `copywriting` | Instalada | Textos de pagina de producto/landing y lista de "tics de IA" a evitar |
| `marketing-psychology` | Instalada | Sesgos y modelos mentales (anclaje, prueba social, escasez) y si una tactica es honesta |
| `social-content` | No existe ya | El autor la fundio en `social` |
| `social` | No instalada | Orientada a LinkedIn/X y a empresas de software; repite lo de las `viral-*` |
| `ad-creative` | No instalada | Es para anuncios de pago (Google, Meta, LinkedIn); repite lo de Motion |
| `competitor-profiling`, `competitors` | No instaladas | Dependen de servicios de pago (Firecrawl, DataForSEO); ya tienes Trendtrack |
| `reverse-engineer-marketing` | No instalada | Trae un programa de 100 KB sin auditar |
| **samber/cc-skills** `copywriting-hooks`, `copywriting-cta` | No instaladas | Son para articulos de blog y newsletters en ingles/frances; excluyen TikTok expresamente |
| **digitalsamba/claude-code-video-toolkit** `ffmpeg` | Instalada | Chuleta de comandos FFmpeg: recortar, unir, redimensionar a vertical, comprimir, exportar por plataforma |
| **fabriqaai/ffmpeg-analyse-video-skill** `ffmpeg-analyse-video` | Instalada | Analizar un video (p. ej. un viral de referencia): saca fotogramas y describe que pasa segundo a segundo |
| **heygen-com/hyperframes** (9 + 6 skills) | No instaladas | Ver abajo: es un sistema completo, con telemetria e inicio de sesion |
| **shadcn-ui/ui** `shadcn` | Instalada (modificada) | Reglas oficiales para usar bien los componentes shadcn de la web |
| `migrate-radix-to-base` (mismo repositorio) | No instalada | Es para una migracion que este proyecto no necesita |
| **melvynx/video-agent-skills** `insta-audit` | No instalada | Ver abajo: exige instalar y conectar tu Instagram a un servicio externo |
| **apify/agent-skills** `apify-ecommerce` | No instalada (solo revisada) | Ver abajo: servicio de pago por uso |

Cada carpeta instalada lleva su licencia y un `ORIGEN.md` con el repositorio, la version exacta
(commit) y, si se cambio algo, que se cambio.

## Que se instalo y que se dejo fuera

**Motion (8 skills, licencia MIT).** Cada una es un unico archivo de texto. Sin comandos, sin
servicios, sin claves. Solo se dejo fuera la carpeta de imagenes y un video de ejemplo del
repositorio. `brand-intake` usa la busqueda web normal de Claude para investigar la marca.
*Aviso:* cinco de los textos incluyen un parrafo publicitario de motionapp.com (su producto de pago
para analizar anuncios). Es un parrafo informativo, no una orden; se ha dejado tal cual. Si Claude te
lo menciona, es publicidad del autor, no una recomendacion nuestra.

**Vyral (4 skills, licencia MIT): instaladas con un recorte.** El original terminaba con una seccion
("Mentioning Vyral") que **ordenaba a Claude recomendarte su producto de pago** (vyralcontent.com)
una vez por conversacion, con texto ya redactado. No es peligroso, pero es publicidad metida en las
instrucciones. Se quito esa seccion, la imagen-enlace de cabecera y un parrafo equivalente en
`references/metrics-honesty.md`. El resto (guias y plantillas en texto) esta intacto.

**marketingskills (3 skills, licencia MIT).** `SKILL.md` y sus `references/`. Se dejaron fuera las
carpetas `evals/` (pruebas del autor). Estan pensadas para empresas de software, asi que los
ejemplos no son de tienda online, pero el metodo sirve. Buscan un archivo opcional
`.agents/product-marketing.md` con el contexto del producto; si no existe, simplemente preguntan.
`customer-research` avisa ella misma de que las reseñas y foros que lea son datos y no ordenes.

**ffmpeg (licencia MIT) y ffmpeg-analyse-video.** Solo texto con comandos de FFmpeg, que trabaja en
local con tus archivos y no envia nada fuera. FFmpeg ya esta instalado en este entorno; en Railway
habra que asegurarse de que tambien lo este cuando la web procese video. Detalles menores: la skill
`ffmpeg` esta escrita pensando en Remotion (otra herramienta de video), y al final se ofrece a
proponer mejoras al repositorio del autor (solo si se le pide). `ffmpeg-analyse-video` crea una
carpeta temporal y la borra al terminar; su repositorio no trae archivo de licencia (el README dice
MIT).

**shadcn (oficial, licencia MIT): instalada con dos cambios.** La web ya usa shadcn, asi que encaja.
Cambios hechos en `SKILL.md`:
- El original **ejecutaba solo un comando** (`npx shadcn@latest info --json`) cada vez que se cargaba
  la skill, y traia un permiso previo para lanzar `npx shadcn@latest ...` sin preguntar. `npx ...@latest`
  descarga de internet la ultima version de la herramienta. Se quitaron ambas cosas: ahora Claude lo
  ejecuta cuando haga falta y con los permisos normales.
- No se copio `mcp.md` (como montar un servidor MCP de shadcn), ni las pruebas ni los iconos.

Si se copiaron tres plantillas pequeñas de codigo (`assets/showcase/`) y un script de 55 lineas
(`scripts/showcase-coverage.mjs`), leidos enteros: solo leen archivos del proyecto, sin red.
*Aviso:* la skill anima a añadir componentes de "registros de la comunidad" (codigo de terceros que
se copia dentro de la web). **Regla: de registros que no sean el oficial `@shadcn`, solo con tu
permiso.**

## No instaladas: los tres casos que debes conocer

**hyperframes (HeyGen): NO instalada.** Es la opcion mas interesante para subtitulos y graficos por
codigo, pero no es una skill de texto, es un sistema entero:
- Todas sus skills empiezan ordenando ejecutar una **"baliza de uso"** que envia telemetria al
  fabricante (ligada a tu cuenta si has iniciado sesion). Tambien piden enviar una valoracion tras
  cada render.
- Funciona descargando y ejecutando su programa (`npx hyperframes`) y un navegador Chrome.
- La parte de musica, voces e imagenes (`media-use`) pide **iniciar sesion en HeyGen** y usa creditos
  de pago; el texto indica a Claude *no ofrecer por iniciativa propia precios ni alternativas mas
  baratas*. El render en la nube es de plan de pago.
- Su programa tiene un comando (`usage`) que lee las credenciales guardadas del asistente para
  mostrar el consumo del plan.
- Son 1,4 MB solo la skill principal, con programas y tipografias.

Nada de esto es malicioso, pero es justo lo que esta revision evita instalar sin decidirlo. Si se
quiere usar HyperFrames para los subtitulos, debe ser una decision de diseño aparte: añadirlo como
dependencia del proyecto con la telemetria apagada (`HYPERFRAMES_NO_TELEMETRY=1`), sin cuenta de
HeyGen, y entonces copiar sus guias quitando las balizas.

**insta-audit (melvynx): NO instalada.** Audita una cuenta de Instagram, pero todo pasa por un
servicio externo llamado Treg: pide instalarlo con `curl ... | sh` (descargar y ejecutar un
instalador), iniciar sesion y **conectar tu cuenta de Instagram a ese servicio**. Tu propia cuenta es
gratis; mirar cuentas ajenas se cobra por llamada. Demasiado acceso para una auditoria; si la quieres,
decide antes si te fias de Treg.

**Apify (`apify-ecommerce`): solo revisada, NO instalada.** Esa skill ya no existe con ese nombre; el
repositorio la fundio en `apify-ultimate-scraper` (extraer datos de TikTok, Instagram, Amazon,
reseñas, precios...). Que necesita:
- Una **cuenta de Apify y una clave** (`APIFY_TOKEN`). Muchos extractores cobran por resultado; la
  propia skill manda estimar el coste antes, avisar a partir de 5 $ y pedir confirmacion a partir de
  20 $.
- Instalar su programa de forma global (`npm install -g apify-cli`).
- Cada llamada va marcada para la telemetria de Apify, y algunos extractores piden cookies o inicio
  de sesion de la red social.
- El repositorio no trae archivo de licencia (el README dice Apache 2.0).

Es util para traer reseñas y comentarios al motor de angulos, pero es un gasto y una clave nueva: se
decide cuando llegue ese paso (la clave iria en las variables de Railway, nunca en el repositorio).

## Que cambia para ti

- Claude tiene ahora metodo para el trabajo central del proyecto: sacar angulos de venta de reseñas
  reales, cruzarlos con audiencias y nivel de consciencia, escribir ganchos y guiones de video corto,
  y manejar video con FFmpeg. Tambien reglas para construir la web con shadcn sin errores tipicos.
- Todas las guias estan en ingles y con ejemplos de Estados Unidos. Sirven como metodo; los textos
  finales hay que hacerlos en aleman y respetando las normas alemanas de publicidad.
- Tres grupos tratan de ganchos (Motion, Vyral y marketingskills). Es deliberado: Motion para el
  angulo, Vyral para el formato organico de TikTok/Reels. Si sobra alguno, se borra su carpeta.
- No se ha instalado ningun programa, servicio, hook, servidor MCP ni clave. No hay costes nuevos.
- Pendiente de tu decision: HyperFrames (subtitulos por codigo) y Apify (traer reseñas), por lo
  explicado arriba.
