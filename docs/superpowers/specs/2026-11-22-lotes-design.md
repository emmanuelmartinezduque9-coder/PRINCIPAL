# Lotes v1 — muchos vídeos a la vez (diseño)

Petición del dueño (22/11): «déjalo listo hoy para enviar todos los lotes». Un lote (antes «pedido») es una lista de
vídeos de uno o varios productos, cada uno con su vídeo de referencia y una indicación corta. Hoy la web hace un vídeo
cada vez (Referencia → Desglose → Imagen → Clip). Lotes v1 añade el trabajo en bloque encima de eso, sin tocar el
núcleo de dinero (Tarea 8): cada envío sigue siendo el mismo por vídeo, con su precio y su `expectedCredits`.

## Decisiones
1. **Datos:** tabla `batches` (id, name, created_by, created_at) y `videos.batch_id` opcional (FK, `on delete set null`).
   Un lote ve solo los vídeos de productos que la persona puede ver (mismo acceso que hoy).
2. **Crear un lote:** nombre + filas. Se arrastran varios vídeos de referencia de una vez; cada archivo es una fila con
   su producto (por defecto el del lote), su avatar (por defecto el primero del producto con papel «avatar»; si no hay,
   «no aparece nadie») y una indicación opcional de una línea (`videos.note`). Cada fila crea un vídeo normal y sube su
   referencia con la subida por trozos que ya existe (varias a la vez, máximo 2 simultáneas).
3. **Tablero del lote** (`/lotes/[id]`): una fila por vídeo con miniatura de la referencia, producto, avatar, estado de
   cada paso, coste y enlace al vídeo. Arriba, acciones en bloque que solo cuentan las filas que están listas para ese
   paso:
   - **Desglosar (N)** — pide el desglose de cada fila lista.
   - **Generar imágenes (N) · X créditos** — presupuesta cada fila, enseña la suma y el saldo, y con una sola
     confirmación envía cada una con su propio `expectedCredits`. Si una cambia de precio (409), esa fila se queda
     sin enviar y lo dice; las demás siguen.
   - **Revisar imágenes** — una pantalla con las candidatas de todas las filas, aprobar/rechazar con teclado.
   - **Generar clips (N) · X créditos** — igual que las imágenes, para las filas con imagen aprobada.
   - **Descargar clips** — descarga cada clip aprobado (o el último terminado) con un nombre claro.
   Los envíos en bloque van de uno en uno o de dos en dos, nunca todos a la vez.
4. **Menú:** «Lotes» para todos (cada uno ve sus lotes y los del dueño si es dueño).
5. **Fuera de v1:** montaje con canción (sigue en el Mac con el montador), Topaz, enlaces de Instagram (Tarea 13).

## Lotes v2 (tras leer el lote antiguo: `docs/importacion/lote-antiguo-funciones.md`)
Orden por uso real (572 tarjetas en 71 pedidos) y por lo que el dueño ha pedido:
1. **Tipo por fila** (como el lote antiguo, mejorado):
   - «Replicar vídeo» (lo de v1; motor Seedance 2.5, sin Genjutsu, por decisión del dueño del 22/11);
   - «Adaptación de concepto»: referencia + «Qué adaptación quieres» (≤ 12.000 caracteres) + imágenes de
     referencia; el desglose sigue `reglas/adaptacion-de-conceptos.md` con esa indicación;
   - «Solo gancho + cuerpo existente»: se genera solo el gancho (tramo inicial de la referencia) y se le pega un
     cuerpo ya generado (biblioteca de clips con vista previa). Necesita la biblioteca de clips.
2. **«Cambios específicos»** por fila: llega al desglose de Claude y a los dos prompts.
3. **Avatar**: elegido / «Sin sustitución» (conservar las personas del vídeo) / «No aparece nadie». Automático por
   referencia más adelante (biblioteca de avatares).
4. **Música por fila** (canción de la biblioteca con su drop) para el montaje; la canción elegida gana siempre.
5. Duplicar y quitar fila; filtro «Por revisar».
Fuera de v2: Genjutsu/Wan, Pinterest, doblaje, versión en francés, edición en la web (sigue el montador en el Mac).

## Lotes v2 — «Preparar lote» como el panel antiguo, mejorado (22/11, tras ver el panel vivo)
Visto en vivo (`127.0.0.1:8777/#replicar`, `lote.html` + `local-lotes.js`): el lote se agrupa por **cuenta**, cada
cuenta lleva sus «Indicaciones», y cada tarjeta tiene Generación · Avatar · Música · Edición y cuerpo · Cambios.
Abajo: Guardar borrador · Revisar selección · Preparar · Enviar.

**Qué hacía mal el sistema antiguo (y qué cambia):**
1. ~25 controles por tarjeta y casi todos se quedan como vienen (avatar automático en 438 de 572 tarjetas). →
   **Valores por producto** (avatar habitual, variante, canción): la tarjeta solo pide enlace, tipo y cambios; lo
   demás va plegado en «Más opciones».
2. Historial con ~95 lotes «Lote local · copia · copia…» porque duplicar era la única forma de reutilizar. →
   nombre automático (fecha + cuentas) y «Añadir otra cuenta» dentro del mismo lote.
3. Nada se analiza hasta enviar («Sin iniciar análisis») y los fallos salen al final (pedido 54: 4 de 12
   rechazados). → el **desglose corre al añadir** y avisa de riesgos (texto quemado, función que el producto no
   tiene) **antes** de gastar créditos; precio a la vista.
4. Codex montaba cada pedido escribiendo scripts (~270) y validando recibos: lento y caro. → código fijo; Claude
   solo en el desglose (céntimos por vídeo).
5. Reintentos sin tope por clip y trabajos terminados en Higgsfield sin descargar. → 2 regeneraciones con motivo y
   reconciliación con el historial.
6. La canción elegida se perdía en réplicas Genjutsu (V6, V9). → la canción elegida manda siempre.

**Alcance de v2 (por orden):**
A. Lote **agrupado por cuenta** con «Indicaciones para los vídeos de X» (llegan al desglose), duplicar/quitar fila,
   filtro «Por revisar», nombre automático, «Cambios específicos» largo (≤ 6.000) con dictado por voz.
B. **Valores por producto**: avatar habitual (modo y foto) y, más adelante, variante y canción.
C. **Desglose automático** al quedar lista la referencia (interruptor por lote, encendido).
D. **Pegar enlaces** (uno por línea → una tarjeta por enlace): los baja el agente del Mac (Tareas 12–13).
E. **Solo gancho + cuerpo existente** y **variaciones de gancho** sobre una **biblioteca de clips** (historial de
   Higgsfield de la persona, con miniaturas y vista previa).
F. **Canción por vídeo** (biblioteca con drop) y montaje con el montador vía agente del Mac.
G. **Proponer lote** (motor de ángulos): por producto, Claude propone ángulos × audiencias y qué concepto adaptar.

### v2-E — Biblioteca de clips y «Solo gancho + cuerpo» (diseño)
- **Biblioteca** (`/biblioteca`, menú para todos): los vídeos del historial de Higgsfield de la persona
  (`show_generations`, tipo vídeo, paginado por `cursor`), guardados en caché en la tabla `library_clips`
  (por persona: job id, miniatura `minUrl`, vídeo `rawUrl`, modelo, fecha) para que cargue al instante; botón
  «Actualizar» trae lo nuevo. Rejilla de miniaturas; al pasar el ratón o pulsar se reproduce el vídeo. Cada clip se
  puede marcar como **cuerpo** de un producto (`product_bodies`: producto, clip, nombre corto).
- **Tipo `solo_gancho`** en el vídeo: «Duración del gancho» (2–8 s, por defecto 4). La referencia se recorta a esa
  duración al prepararse (se fija antes de subir; cambiarla después pide subir de nuevo), el desglose y el clip son
  solo del gancho, y el vídeo lleva una lista ordenada de **cuerpos** elegidos de la biblioteca del producto
  (`videos.body_clip_ids`). La web entrega el gancho y los cuerpos; unirlos con la canción lo hace el montador
  (después, como tarea del agente del Mac).
- En el lote: el tipo «Solo gancho» en la tarjeta, con el selector de cuerpos (miniaturas del producto).
