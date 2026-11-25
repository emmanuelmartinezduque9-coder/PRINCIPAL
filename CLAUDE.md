# Instrucciones para agentes

- Lee `README.md` y `docs/` antes de empezar.
- No modifiques el repositorio `finanzas-tiendas` (ni su base de datos) desde este proyecto salvo
  petición expresa del dueño. De Finanzas solo se leen datos.
- Nunca guardes secretos en el repositorio.
- Apunta las decisiones de diseño en `docs/`.

## Reglas fijas del flujo de vídeos (Emmanuel, 23/11/2026) — no se negocian

Emmanuel no lee análisis ni avisos: para eso están las reglas del motor (`reglas/`,
`docs/reglas-motor-del-dueno.md`). Cualquier cambio en vídeos o lotes tiene que cumplir esto:

1. **Flujo automático de principio a fin.** Referencia → desglose → imagen → clip → montaje se
   encadenan solos (`src/server/videos/autopilot.ts` para el vídeo suelto, `lote.ts` para el lote),
   dentro de los topes de gasto, el saldo y el presupuesto del lote que ya existen.
2. **Sin avisos.** Los «riesgos» del desglose son instrucciones internas que el motor aplica en los
   prompts: nunca se pintan como tarjetas ni paran nada (como mucho, plegados en «Detalles técnicos»).
3. **Sin botones de confirmar generación.** Nada de «Generar N imágenes · Esto cuesta X créditos»,
   «Generar clip», «Hacer el desglose», «Montar» o «Confirmar y generar» en el camino normal.
4. **Un solo frame por vídeo, siempre** (orden de Emmanuel, 25/11/2026; anula la del 24/11 de un frame por sitio).
   El frame es la apertura. Cada **entorno que ocupa varios clips** (p. ej., empieza en el súper y desde el 4.º
   clip hay varios en un salón) lleva una o varias **imágenes de referencia** de ese entorno dentro del único clip del vídeo,
   nunca otro frame. Las tomas cortas de un sitio propio (1 s sacando algo de la nevera) no llevan referencia: el
   prompt del clip pide cambiar su diseño o lo de dentro y conserva la acción y el sitio. Más candidatas de frame
   solo si él lo pide en la tarjeta (`videos.frame_count`) o en el lote (`batches.frame_count`).
5. **Solo preguntas obligatorias.** Se para únicamente con **una** pregunta concreta que solo él puede
   decidir (avatar obligatorio sin elegir, variante, canción, falta la foto del artículo, no hay
   saldo o se pasa del tope, Higgsfield sin conectar, un fallo que no se repite solo porque cuesta)
   y sigue solo en cuanto responde. Nunca preguntas por preguntar ni riesgos.
6. La única parada rutinaria es mirar la imagen (regla 2 del motor: «tras la aprobación visual,
   clips y ediciones sin otra ronda»); un rechazo se regenera solo dentro de sus rondas.

Las pruebas `tests/flujo-automatico.test.ts` fijan estas reglas: si una cambia, falla.

## Regla fija del dueño: localización al país del producto (24/11/2026)

La automatización tiene siempre presentes **el producto y el país al que va dirigido**. Todo lo de la
referencia que sea de otro país se adapta solo a su equivalente más conocido allí, aunque la tarjeta no
lo pida: lugares (USA → Berlin; «in den USA» → «in Berlin»), tiendas (Target → Action, Walmart/Costco →
Kaufland, supermercado → Lidl), moneda ($12.99 → 12,99 €), calles, matrículas, carteles, banderas y
marcas locales. Lo que ponga la tarjeta manda. Es un paso central: el desglose saca `localization` y la
usan imagen, Pinterest, clip, rótulos y doblaje (`src/server/videos/localization.ts`,
`reglas/localizacion-por-pais.md`, `tests/localizacion.test.ts`). No lo quites sin una orden suya.

## Regla fija del dueño: cada toma conserva su sitio (Emmanuel, 24/11/2026)

El defecto que más le molestaba en Codex. En las réplicas con Genjutsu o Wan (el vídeo fuente manda):

- Cada toma de la referencia tiene su sitio y su acción, y se respetan. Si una toma es «sacar algo de la
  nevera», la nevera se queda (puede cambiar lo de dentro, el color o el estilo); nunca se pone el salón
  del resto del vídeo y se saca algo de la nada.
- Una referencia de entorno que suba él (p. ej. un supermercado) solo vale para las tomas que en la
  referencia pasan en ese tipo de sitio. Las demás buscan su propio entorno en Pinterest, localizado al
  país de destino (calles de Berlín…). Caso real del lote 6: un FalterPfote con súper y calle salió
  entero en el súper.
- **Nunca clip por clip** (orden de Emmanuel, 25/11/2026): **un solo clip por vídeo**, un Motion Transfer con el
  vídeo fuente entero desde su único frame de apertura, y su Topaz. Nada de tramos por sitio ni por toma, ni
  empalmes de clips. El desglose sigue sacando los sitios (`places`) para escribir el prompt: los entornos de
  varios clips llevan sus fotos de referencia (Pinterest o la suya) en ese mismo clip y las tomas cortas se
  describen en el prompt. Código: `src/server/videos/tramos.ts`; diseño en `docs/sitios-de-la-referencia.md`;
  pruebas en `tests/flujo-automatico.test.ts` y `tests/tramos.test.ts`.
- **La imagen que él elige o sube a mano manda** (25/11/2026, vídeo 35 del lote 10): no se busca en Pinterest
  para ese entorno, se rotula como suya y en el resultado tiene que verse que el fondo es su imagen, conservando
  todo lo que tiene dentro.

## Regla fija del dueño: referencias de Pinterest (no olvidar)

- **Toda imagen inicial (Nano Banana) lleva SIEMPRE fotos reales de Pinterest como referencia**, también
  al regenerar una imagen rechazada. Solo si el dueño pone una referencia de entorno a mano en el vídeo o
  la tarjeta, no se busca. Lo pidió tres veces (22 y 23/11/2026).
- **Orden vigente (24/11/2026, orden expresa de Emmanuel; sustituye a la del 23/11 de usar solo el banco):**
  toda imagen inicial busca en Pinterest lo que pide la escena (el desglose, la tienda, el tipo de producto, el
  país) con sus filtros: fotos de alta calidad y realistas hechas con iPhone, verticales y orgánicas (de
  usuario); nada cuadrado ni horizontal, de cámara profesional, de estudio, de stock, render ni retocado.
  Los filtros van en las consultas, en el corte por medidas (`phoneShapedFirst`: alto/ancho ≥ 1,2 y lado
  largo ≥ 1000 px) y en la elección con visión. `BANK_ONLY = false` en `pinterest.ts`. El banco
  (`reference_bank`) solo es respaldo si Pinterest no da nada válido, y queda en el registro
  («se usa el banco de respaldo»). Con una tienda o un lugar concreto (dm, Sephora, Lidl…) se busca su
  interior en el país del producto (`scene.namedPlace`), con la redacción de tienda del método aprobado,
  y sin respaldo del banco.
- Está en código, no solo en texto: `src/server/videos/pinterest.ts` (búsqueda, elección con visión,
  almacén), `frame.ts` (la imagen no se pide sin ellas) y `reglas/referencias-pinterest.md` (qué buscar
  según la escena). No lo quites ni lo hagas opcional sin una orden expresa del dueño.
- **Lo que ya funcionaba en Codex (`/Volumes/T7/AUTOMATIZACION SEGA`) se copia tal cual y después se mejora.** Nunca se rehace desde cero ni se «compara»: prompts, skills de Nano Banana, referencias, montaje.

## Regla fija del dueño: delegar en Codex lo que consume (Emmanuel, 24–25/11/2026)

Todos los chats de este proyecto tienen Codex conectado (plugin `codex@openai-codex` y CLI
`~/.local/npm-global/bin/codex`, con el ChatGPT de Emmanuel) y **delegan en él por defecto** lo que
gasta mucho, para que el plan de Claude dure y el coordinador quede libre:

- **A Codex:** la ejecución. Programas del móvil, código acotado, revisiones de código (`/codex:review`
  antes de publicar cambios grandes), búsquedas largas en `/Volumes/T7/AUTOMATIZACION SEGA` y tareas
  mecánicas (subagente `codex:codex-rescue` o `codex exec --sandbox workspace-write -C <dir> -o <salida.md> "<tarea>"`).
- **A Claude:** la gestión, las decisiones, el diseño de la web, las conexiones y la revisión final de lo
  que entrega Codex. Lo de Codex se comprueba antes de decir «hecho».
- Al informar, decir qué se mandó a Codex.
