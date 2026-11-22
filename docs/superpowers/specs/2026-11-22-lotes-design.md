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
