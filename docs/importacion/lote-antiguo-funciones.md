# Pantalla de lote del sistema antiguo: inventario funcional

Estudio del 22/11/2026, solo lectura en el Mac del dueño: no se modificó nada ni se ejecutó ningún programa del sistema antiguo. Las únicas escrituras fueron extractos de texto en `~/.principal-sync/`.
Sirve para rehacer la pantalla, mejorada, en PRINCIPAL. Las etiquetas entre «» son literales de la interfaz.

## 0. Qué versión es la buena

Hay **dos versiones** de la pantalla, y no son iguales:

| | Versión antigua | **Versión viva** (la que generó el pedido 54) |
|---|---|---|
| Página | `PANEL/lote.html` + `PANEL/lote.js` (63 KB, 18/11) | `local-lotes.html` + `local-lotes.js` (367 KB, 21/11) |
| Ruta | `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/PANEL/` | `~/Library/Application Support/SEGATOM/code-packages/test-hook-selection-20261102/app/PANEL/` |
| Título | «Tu próximo lote» | «Prepara tu próximo lote» |
| Tipos de tarjeta | 4 | 7 (5 tipos guardados y 2 modos) |

- En `PANEL/` no hay ningún `local-lotes.js`. La copia viva está en el paquete de SEGATOM. La misma versión está en `EDITOR/patches/instructions-multiline-20261121/`.
- Los campos del pedido 54 (`avatar_selection_mode`, `video_edit_mode`, `body_auto_mode`, `product_variant_key`…) solo existen en la versión viva. **Este inventario describe la versión viva** y señala lo que cambia respecto a la antigua.
- `product-tests.js` es otra pantalla («Testear productos»), no el lote. Se resume en el §7 porque comparte ideas: ganchos validados + cuerpo y audio original frente a canción.
- **Botones que se ven en el HTML pero están ocultos**: «Asignar música» y «Aprobar textos». En las dos versiones, un `<style>` les pone `#bulk-music,#approve-texts{display:none!important}`.
- **Funciones escritas pero sin pintar** en la versión viva: «Calidad de generación» (`videoResolutionFields`) e «Idioma del audio» (`audioLanguageFields`). No se llaman desde la tarjeta. Además, todos los textos de ayuda con la clase `card-hint` se borran al final de `card()`, así que el usuario no los ve.

Diseño (de `studio.css` y los estilos de la página):
- Cabecera con un selector de historial y «Nuevo lote».
- Barra con el nombre del lote.
- Panel «Añade vídeos al lote».
- Barra de filtros.
- Grupos plegables por cuenta (`<details class="account-group">`) con una rejilla de tarjetas plegables.
- Barra fija inferior con el recuento y las acciones.
- Galerías en diálogos modales con buscador.
- Cada tarjeta se divide en secciones de color: Generación (azul), Avatar (morado), Música (verde), Edición y cuerpo (rosa). Existe un estilo para Calidad (ámbar), pero no se usa.

## 1. Tipos de tarjeta

### Cómo se añade
Panel «Añade vídeos al lote»:
- «Producto / cuenta»: lista de cuentas. Unas 30 cuentas están ocultas en una lista fija (`hiddenBatchAccounts`). Cada cuenta lleva su emoji.
- «Tipo de los vídeos que vas a añadir».
- Si el tipo es «Adaptación de concepto», aparece además «Qué generar» (Vídeo completo / Solo gancho).
- Área «Pega uno o varios enlaces. Cada enlace crea una tarjeta.» y botón «Añadir al lote».
  - Para «Regenerar», «Adaptar», «Crear desde cero» y «Editar» el área de enlaces se oculta y se crea **una tarjeta vacía**.
  - Al añadir no se analiza nada: «Sin iniciar análisis».

Valores comunes al crear (`baseVideo` + `base`), salvo «Editar»:
- `method`:
  - `genjutsu` en general;
  - `auto` en regenerar y adaptar.
- `genjutsu_model=hf_mult_motion_control` (Motion Transfer), con `source:'default'`.
- `generation_resolution=480p`.
- `frame_mode`:
  - `none` en general;
  - `keep` en regenerar y adaptar.
- `avatar=''` con `avatar_selection_mode='reference_match'` (automático por referencia).
- `text_mode`:
  - `keep` en regenerar;
  - `source` si hay enlace;
  - `none` en el resto.
- `translate=true`.
- `music_mode='reference_auto'`, `music_number=null`, `music_start=0`, `music_rights_confirmed=false`.
- `video_edit_mode='post'`, `video_edit_policy_version='mandatory-post-v1'`, `post_edit_text_mode='reference'`.
- `persist()` vuelve a imponer los cuatro valores de edición (`video_edit_mode`, su versión de política, `post_edit_text_mode` y, en regenerar/adaptar, `method=auto` y `frame_mode=keep` si estaba en `none`) en cada guardado.

La versión antigua forzaba además `text_mode='none'`, `music_mode='none'`, `editing_owner='capcut'` y `text_custom=null` al guardar, y mostraba «Textos y música: los editas en CapCut.».

### Qué produce cada tipo (en todos)
Todas las tarjetas producen:
- **frames** que se aprueban a mano en «Ver producción y aprobar frames» (`production.html`);
- **clips** en Higgsfield, a 480p y luego Topaz a 1080p;
- **edición posterior obligatoria** con textos, en CapCut para Emmanuel o con resultados de Higgsfield sin montar para Sebastián.

Los **textos** no se aprueban en el lote: el editor los saca de la referencia después (`reference_edit_pending`, `post_edit_text_mode='reference'`).

### 1.1 «Replicar vídeo nuevo» (`replicate`)
- **Qué es para el dueño:** copiar un viral (Instagram o Facebook) con su producto, su avatar y su idioma. Es el tipo más usado: 328 de 572 tarjetas guardadas.
- **Obligatorio:** «Enlace del vídeo».
- **Opcional:**
  - «Variante del producto»;
  - «Avatar»;
  - música;
  - «Referencias de Pinterest»;
  - en «Método y cambios»: «Método», «Motor de réplica», «Frames», «Fondos y referencias adicionales» y «Cambios específicos»;
  - en «Edición y cuerpo»: otro enlace de edición, versión en francés, variaciones de gancho y cuerpos ya generados que se añaden.
- **Por defecto:** Genjutsu Motion Transfer, 480p, avatar automático, música automática y audio original.
- **Produce:** frame inicial adaptado (producto, avatar y fondo), que se aprueba, y después un clip que replica la referencia.
  - Con Genjutsu se conservan el movimiento y el audio generado.
  - Con Seedance (B/A/C) se generan tomas nuevas.
  - Después: Topaz, edición con textos y canción o audio original.

### 1.2 «Editar vídeo existente» (`edit`)
- **Qué es:** rehacer solo la edición de un vídeo ya entregado, sin generar nada. Solo 4 usos.
- **Entradas:**
  - «Elegir vídeo editado de {CUENTA}»: biblioteca `/api/edit-variations` con buscador «Buscar lote o edición» y versiones anteriores agrupadas;
  - «Nuevo texto»;
  - «Cambios de emojis»;
  - «Enlace de referencia para textos»;
  - «Indicaciones de edición»;
  - «Música de esta edición», que ofrece «Conservar audio actual» o una canción de la biblioteca.
- **Opcional:** todo menos el vídeo de origen. «Los campos vacíos conservan el original. Se crea una nueva edición; no se generan imágenes ni clips.»
- **Produce:** una edición nueva.
- **Forma guardada:** `edit_source_id`, `edit_source_sha256` y `edit_changes{text, emojis, reference_url, instructions, music:{mode:'keep'|'replace', number, sha256}}`.

### 1.3 «Regenerar concepto» (`regenerate`)
- **Qué es:** volver a producir un concepto propio de la misma cuenta (C-número), con cambios.
- **Obligatorio:** «Elegir concepto», en una galería de conceptos de la cuenta con miniaturas por clip y buscador «Buscar por nombre o número».
- **Opcional:**
  - **Clips:**
    - casilla «Incluir» en cada clip (hay que dejar al menos uno);
    - en conceptos con recetas alternativas: «Elegir receta» / «Cambiar receta»;
    - «Añadir clip de otro concepto», con flechas ← → para reordenar y «Quitar».
  - **Frames:**
    - «Frames» (`frame_mode`);
    - por clip: «Elegir frame», «Subir captura» / «Cambiar captura» / «Quitar captura»;
    - «Referencias para cambiar los frames»;
    - «Referencia de nuevos frames (si es distinta)».
  - **Notas:** «Cambios de esta regeneración».
- **Por defecto:**
  - `method=auto`, con el texto «Motor: el guardado en cada clip del concepto.»;
  - `frame_mode=keep` («Conservar los guardados»);
  - avatar «Conservar el del concepto», o automático por referencia.
- **Produce:**
  - clips nuevos con el motor guardado en cada clip;
  - frames reutilizados o nuevos, según el modo;
  - la misma edición posterior que los demás.

### 1.4 «Adaptar a otra cuenta» (`adapt`)
- **Qué es:** llevar un concepto de otra cuenta a esta: producto, avatar e idioma nuevos, con las mismas acciones.
- **Obligatorio:**
  - «Cuenta del concepto original». Por defecto, la primera otra cuenta con conceptos; el aviso dice «Elige la cuenta de origen y su concepto en la tarjeta.»;
  - «Elegir concepto».
- **Opcional:** lo mismo que en regenerar. El desplegable se llama «Cambios de esta adaptación».
- **Produce:** lo mismo que regenerar. El servidor exige `adaptation_engine_policy='saved_per_clip'` para dejar enviar.

### 1.5 «Crear desde cero» (`new`)
- **Qué es:** una idea propia, sin viral.
- **Entradas:** editor de clips «Clip 1…N», con un máximo de 100.
  - Cada clip tiene dos caminos:
    - «Referencia para el nuevo frame», con «Subir captura»;
    - «Elegir clip existente · todas las cuentas»: reutiliza un clip guardado. Si es de otra cuenta, se adapta. Desde ahí se puede volver con «Convertir en clip nuevo».
  - Botones: «Añadir clip», «Añadir clip de un concepto existente» y «Quitar clip N».
  - «Cambios específicos», con dictado por voz («🎙 Dictar») y el texto «Describe el inicio, las acciones y el resultado que quieres ver…».
  - «Imágenes de referencia por toma».
  - Si el método es Seedance B: «Imágenes para el vídeo completo · Seedance».
- **Produce:** frames nuevos para aprobar y clips. Guarda `new_clip_count` y `new_clip_sources{n:{account,concept,clip}}`.

### 1.6 «Generar gancho» (modo `hooks_only`, guardado como `regenerate`/`adapt`/`new`)
- **Qué es:** generar **solo el gancho** y pegarle un **cuerpo ya hecho**. Es la forma de trabajar que el dueño pide para la web. 100 tarjetas guardadas.
- **Entradas:**
  - «Fuente del gancho», con dos opciones:
    - «Gancho validado de biblioteca»: selector «Gancho ganador · biblioteca validada» + «Frame del gancho» (subir captura o «Elegir frame de referencia»);
    - «Gancho de un enlace de referencia»: «Enlace de referencia del gancho». Se observa el gancho de ese vídeo y se genera solo ese tramo.
  - «Modelo para generar el gancho». Opciones:
    - «Automático · selección actual»;
    - «Seedance»;
    - «Genjutsu · Motion Transfer»;
    - «Genjutsu · Object Swap»;
    - «Genjutsu Lite · Motion Transfer»;
    - «Wan 3.0»;
    - «Wan 3.0 Prime».
  - «Fondos y referencias adicionales» del gancho.
  - «Instrucciones de edición y unión».
  - **Cuerpo**, en «Fuente del cuerpo»:
    - «Cuerpo existente»: lista «Cuerpo · vídeos ya generados (opcional)», «Añadir cuerpo · vídeos de todas las cuentas», «Mover cuerpo antes/después», «Quitar cuerpo N», «Elegir otro cuerpo automático de esta cuenta».
      - El modo automático elige un cuerpo de la misma cuenta, `body_auto_mode='reference_match'`.
      - Tocar la lista lo pasa a `manual`.
    - «Generar cuerpo desde otro vídeo»: «Enlace del vídeo para generar el cuerpo».
- **Por defecto:**
  - hook `reference_url` si la tarjeta tiene enlace; si no, el primer gancho de la biblioteca;
  - `method=A`;
  - `frame_mode=keep`;
  - `text_mode=none`;
  - `hook_test={generation_mode:'hooks_only', hook_clip:1, reuse_body:true, capcut_copies:true}`.
- **Produce:**
  - un gancho, con su frame aprobado si procede, más los cuerpos existentes **sin regenerar**, en ese orden;
  - edición: gancho + cuerpos, con la canción elegida.
  - El snapshot dice: «PROHIBIDO generar cuerpos. Solo nodos hook_variant».
  - Gancho «1,2,3»: revelado máximo a los 6 s; la caja se ve como máximo 1 s.

### 1.7 «Adaptación de concepto» (modo, `concept_adaptation`)
- **Qué es:** adaptar la idea de un viral al producto, siguiendo la regla `reglas/adaptacion-de-conceptos.md`. 7 usos.
- **Entradas:**
  - «Vídeo viral que quieres adaptar»;
  - «Qué adaptación quieres para tu producto», hasta 12.000 caracteres;
  - «Imágenes de referencia de la adaptación»;
  - «Qué generar»: Vídeo completo / Solo gancho;
  - «Modelo para generar el vídeo» (o «…el gancho»).
- **Por defecto:**
  - vídeo completo: `kind=replicate`, `method=A`, `frame_mode=new`;
  - las notas llevan el prefijo «[Adaptación de concepto · skill adaptacion-de-conceptos]».
- **Produce:** frames nuevos y clips, o solo el gancho + cuerpo.

## 2. Opciones y controles de cada tarjeta

| Control (etiqueta exacta) | Qué controla | Valores |
|---|---|---|
| Casilla «Seleccionar vídeo N» y título «Vídeo N» + insignia de estado | Si la tarjeta entra en Preparar/Enviar | sí/no (`batch.selection`) |
| «Qué generar» | Vídeo completo o solo gancho | «Vídeo completo» / «Solo gancho» |
| «Tipo de vídeo» | Tipo guardado (`kind`) | Las 5 etiquetas de `kinds`. Cambiarlo borra el concepto, los clips y los frames, y reinicia los modos |
| «Variante del producto» + mosaico «Elegir variante por imagen» | Qué variante del artículo se usa (`product_variant_key`) | «Producto habitual» o una clave (`articulo_fresa`, `articulo_rosa`, `articulo_azul_turquesa`…) |
| «Cuenta del concepto original» (adaptar) | Cuenta de origen | Lista de cuentas |
| «Elegir concepto» / «Cambiar concepto» | Concepto de la galería «Conceptos · {CUENTA}» | C-número; muestra «C78 · nombre» y la miniatura |
| «Frames» | `frame_mode` | «Conservar los guardados» (`keep`) / «Elegir un frame por clip» (`select`) / «Crear nuevos» (`new`). También existe `none` (sin frame, réplica Genjutsu) |
| «Elegir frame» (por clip) | Frame de la biblioteca para ese clip | «Conservar · …» o un frame |
| «Subir captura» (por clip) | Captura de referencia que genera un frame **nuevo** | PNG/JPG/WebP ≤ 12 MB (20 MB en la versión antigua). «Nuevo frame pendiente; no se ha generado nada.» |
| «Incluir» (por clip), «Elegir/Cambiar receta», «Añadir clip de otro concepto», ← → «Quitar» | Qué clips entran y en qué orden (`clips`, `clip_sequence`) | Lista ordenada de `{account, concept, clip}` |
| «Enlace del vídeo» | Referencia viral | URL de Instagram o Facebook |
| «Método» | Motor general | «Automático» / «Seedance · vídeo completo (B)» / «Clips separados (A)» / «Híbrido (C)» / «Genjutsu · editar original» / «Wan 3.0 · replicar original» / «Wan 3.0 Prime» |
| «Motor de réplica» (si el método es Genjutsu) | Modelo concreto | «Genjutsu Lite · Motion Transfer» (`hf_mult_motion_control_flash`; referencia de 4–15 s y frame aprobado) / «Genjutsu · Object Swap» (`hf_mult_replace_object`) / «Genjutsu · Motion Transfer» (`hf_mult_motion_control`, **por defecto**) / «Wan 3.0 · replicar con vídeo de referencia» (4–30 s) / «Wan 3.0 Prime · vídeo de referencia». En la versión antigua: «Genjutsu Lite · recrear la escena» / «Object Swap · cambiar elementos y entorno» / «Motion Transfer · recrear la escena» |
| «Fondos y referencias adicionales» / «Referencias para cambiar los frames» | Imágenes extra (`genjutsu_references`, `regeneration_frame_references`, `seedance_video_references`) | Hasta 8 imágenes, que se pueden arrastrar o pegar. Cada una tiene «Usar como»: «Fondo / habitación» / «Otra referencia», y «Qué debe cambiar» (≤ 200 caracteres). «El producto y la caja se toman de los assets de la cuenta» |
| «Referencias de Pinterest» | Buscar fondos en Pinterest | «Sí, buscar imágenes en Pinterest» / «No, regenerar sin buscar en Pinterest». Se desactiva solo si la tarjeta lleva imagen propia. Se guarda como marca dentro de `notes` |
| **Avatar**: botón «Elegir avatar» (galería) | Identidad de la persona (`avatar`, `avatar_selection_mode`) | «Automático · según referencia» (`''` + `reference_match`; se elige por género y edad observados), «Conservar el del concepto» (regenerar) / «Habitual de la cuenta», **«Sin sustitución de avatar»** («Conservar las personas del vídeo», `avatar='sin avatar'`), o un avatar de la biblioteca global («mujer 12», «hombre 4»…). Elegir uno pone `manual` |
| «Usar selección automática según referencia» | Vuelve al modo automático | — |
| «Añadir otro avatar», «Papel del primer avatar», «Papel del avatar N», «Cambiar avatar N», «Quitar avatar N» | Varias personas, cada una con su papel (`additional_avatars[{selector, role}]`, `avatar_role`) | Hasta 8 personas. Papel en texto (p. ej. «mujer a la derecha») |
| **Música**: «Música de este vídeo» | Tipo de audio (`music_mode`) | «Automática · identificar canción de referencia» (`reference_auto`, **por defecto**; en réplicas Genjutsu acaba en `generated_original` = audio generado/original) / «Pendiente» / «Conservar audio» (`keep`) / «Sin canción añadida» (`none`) / «Usar canción elegida» (`song`) |
| «Elegir canción de la biblioteca» | Canción concreta (`music_number`, `music_start`) | Biblioteca «Canciones, reproducción y drops», con carpetas. El drop va guardado **en la canción** (marcador humano), no en la tarjeta. El segundo de inicio sale del `start` guardado de la canción (valores reales: 2,53 y 14,35) |
| «Importar archivo nuevo…», «Continuar importación», «Quitar canción» | Subir una canción solo para este vídeo | MP3, WAV, M4A, AAC, FLAC, OGG o AIFF; ≤ 180 MB y ≤ 20 min |
| «Doblaje del diálogo» | Doblar la voz después de generar (`final_dubbing_mode`) | «No traducir después de generar» (`none`) / «Separar música y doblar al idioma de la cuenta» (`account_language`, gasta créditos) |
| «Idioma del audio» *(no se pinta)* | Voces con Wan 3.0 Prime (`audio_language_mode`) | «Automático · recomendado» / «Traducir al idioma de la cuenta» / «Conservar el idioma original» |
| «Calidad de generación» *(no se pinta)* | `generation_resolution` | «Automática · según motor» / 480p / 720p / 1080p |
| **Edición**: «Edición posterior obligatoria con Codex» (fijo) | `video_edit_mode='post'` | Siempre `post` al guardar. Tras el envío muestra «Edición enviada: …» |
| «Otro enlace de edición (opcional)» | Vídeo de referencia de **edición** (`video_edit_reference_url`) | URL. Si está vacío, usa la referencia de generación o el enlace del gancho |
| «También versión con textos en francés» | Entrega extra con solo los textos traducidos (`additional_edit_languages`) | `[]` / `['fr-FR']` |
| «Variaciones adicionales de gancho» | Ganchos extra sobre la base (`hook_test.variants`) | «Sin variaciones» o 1–20 («N variaciones · N+1 vídeos en total») |
| «Qué generar» (variaciones) | `hook_test.generation_mode` | «Vídeo base + variaciones» (`base_and_variations`) / «Solo variaciones · reutilizar vídeo existente» (`variations_only`) |
| «Gancho variación N» | Gancho de la biblioteca o propio | ids `countdown` («1, 2, 3 · Destapar»), `coffee` («Café · Sorpresa»), `gift_delivery` («Regalo POV»), `coffee_window`, `couple`, `gift_surprise`, `checkout`, `reference_url`, o «Crear mi propio gancho» |
| «Qué pasa en el gancho», «Duración total (segundos)» | Gancho propio | Texto ≤ 8000 caracteres; 0,1–60 s (cuentas «1,2,3»: máximo 6 s) |
| **«Cambio concreto de esta variación (opcional)»** | Indicación para esa variación (`variants[].notes`) | Texto |
| «Subir captura de referencia» / «Elegir frame de referencia» (galería con el subtítulo **«Crear otro frame adaptado a la cuenta»**) | Base para un frame **nuevo** del gancho (`reference_capture` / `reference_frame`; una sustituye a la otra) | Imagen o frame de la biblioteca. «No se anima directamente; requiere aprobación visual» |
| «Ver prompt guardado» | Muestra el prompt del gancho de la biblioteca | — |
| Cuerpos: ver §1.6 | Cuerpos ya generados que se reutilizan (`attached_bodies` o `clip_sequence`) | Lista ordenada |
| «Cambios específicos» + «🎙 Dictar» | Notas libres del vídeo (`notes`; antes «Cambios especiales») | Texto. Junto con la nota de cuenta, ≤ 6000 caracteres |
| «Revisar textos» / «Aprobar textos de este vídeo» / «Corregir y ver cambios» / «Revisar textos aprobados» | Aprobación de los textos leídos de la referencia (diálogo «Revisar textos», «Guardar y aprobar») | Solo aparecen si el servidor devuelve `text`. Hoy los textos van a la edición posterior |
| **«Edición · solo este vídeo»** (diálogo) | Textos de una edición de referencia cambiados solo para esta tarjeta (`text_mode='edition'`, `text_custom{job_id, revision, captions}`) | «Guardar solo para este vídeo». Es un camino heredado: `edition` siempre aparece vacío en los datos |
| «Elegir zona de lectura» / «Zona de lectura elegida» | Recorte de la zona de texto de la referencia (`region_box`, `expected_texts`) | Solo con `text_mode` `source`/`other`. Heredado |
| «Duplicar», «Eliminar» (+ «Deshacer») | Copia o borra la tarjeta | — |
| Plegar tarjeta | Vista | Recordado por lote |

## 3. Controles del lote

- **Historial:**
  - selector «Lotes guardados» («Elegir lote», cada entrada con nombre · N vídeos);
  - «Nuevo lote»;
  - «Creado: dd/mm/aaaa hh:mm · Hora de Madrid» (versión antigua);
  - al abrir, carga el último lote no enviado.
- **Nombre:** «Nombre del lote», con el estado de guardado «Cambios sin guardar» / «Guardado».
- **Guardado:**
  - «Guardar borrador»: «Borrador guardado. No se ha iniciado producción.»;
  - control de revisiones con reconciliación si la respuesta es dudosa; nunca se reenvía solo.
- **Duplicar:**
  - «Duplicar lote» copia todo a un borrador nuevo con el sufijo « · copia»;
  - por grupo de cuenta, «Duplicar lote a otra cuenta» elige la cuenta destino y las «Imágenes del duplicado»: «Generar imágenes nuevas» / «Conservar las imágenes del original». Los `regenerate` pasan a `adapt`;
  - «Quitar vídeos (N)» de una cuenta.
- **Notas por cuenta:** «Indicaciones para los vídeos de {CUENTA}» (≤ 4000 caracteres). Se insertan en `notes` de cada tarjeta pendiente entre `[Indicaciones de cuenta: X]…[/Indicaciones de cuenta]`.
- **Filtros:** «Todos» / «Por revisar» (estados error, textos por aprobar y procesando).
- **«Seleccionar todos»:** alterna todos y ninguno, sin contar los enviados.
- **«Asignar música»** (oculto). Diálogo «Música para los seleccionados»:
  - «Canción», con reproductor;
  - «Empieza en el segundo» (decimal; al elegir la canción toma su `start`);
  - «Aplicar a seleccionados». En las tarjetas de edición cambia `edit_changes.music`.
- **«Aprobar textos»** (oculto): aprueba la revisión de textos de los seleccionados.
- **«Revisar selección»:** resumen «Selección que se enviará», con una línea por vídeo: cuenta · tipo · C-número · avatar.
- **«Preparar seleccionados (N)»:** el servidor valida y congela cada tarjeta (`prepared[]` con snapshots de avatar, música, cuerpos, edición…). Errores: «No se pudo preparar: …».
- **«Enviar seleccionados (N)»:**
  - solo se activa si todo lo seleccionado está `prepared` (en regenerar y adaptar, con motor «saved_per_clip»);
  - «Enviar a» fija el destino: «Emmanuel · editable CapCut» / «Sebastián · resultados Higgsfield». En la versión viva va bloqueado según la sesión;
  - después, «Consultar recepción».
- **Panel «Referencias y aprobaciones de mi lote»:** cada captura o referencia vinculada tiene «Aprobar referencia» / «Rechazar referencia» / «Quitar del lote».
- Enlaces a «Ver producción y aprobar frames →» y «Pruebas Q4».

## 4. Forma real de una tarjeta guardada (`batch.items[]`)

El pedido 54 tiene 12 tarjetas: `batch.status='prepared'`, `revision=54`, `execution_lane='emmanuel_capcut'`, `output_package.kind='capcut_editable'` y `codex_destination={id:'emmanuel', label:'Emmanuel · lotes de la aplicación', thread_id:<redactado>}`.

Tarjeta de gancho + cuerpo (V1):
```json
{
 "id": "46dd3bb28eae44c2b790490f124e3939", "account": "EISWERK", "kind": "regenerate",
 "source_account": "EISWERK", "concept": 78, "clips": null,
 "clip_sequence": [{"account": "EISWERK", "concept": 78, "clip": 1}], "body_auto_mode": "manual",
 "hook_test": {"generation_mode": "hooks_only",
   "variants": [{"hook_id": "countdown", "notes": "", "reference_capture": "1a762797…"}]},
 "method": "auto", "frame_mode": "keep", "frames": {}, "frame_reference": "",
 "genjutsu_model": "hf_mult_motion_control",
 "genjutsu_model_provenance": {"version": 1, "source": "default", "model": "hf_mult_motion_control"},
 "generation_resolution": "480p",
 "avatar": "", "avatar_selection_mode": "reference_match",
 "product_variant_key": "<clave de variante>",
 "music_mode": "song", "music_number": 2, "music_start": 2.53, "music_rights_confirmed": false,
 "text_mode": "none", "translate": true, "edition": "", "text_url": "", "expected_texts": null, "region_box": null,
 "editing_owner": "capcut", "video_edit_mode": "post", "video_edit_policy_version": "mandatory-post-v1",
 "post_edit_text_mode": "reference",
 "video_edit_reference_url": "https://www.instagram.com/reel/Df3y-iATZSE/",
 "url": "",
 "notes": "Quiero que el mantel tenga el diseño de Starbucks por Eiswerk…"
}
```

Variantes que se ven en el mismo pedido:
- **Réplica Genjutsu con audio original** (V3): `kind:'replicate'`, `method:'genjutsu'`, `frame_mode:'none'`, `concept:null`, `url:'https://www.instagram.com/reel/Dft5FC5MjdN/'`, `music_mode:'reference_auto'`, `text_mode:'source'`.
- **Object Swap explícito con canción** (V9): `genjutsu_model:'hf_mult_replace_object'`, `provenance.source:'explicit'`, `music_mode:'song'`, `music_number:2`, `music_start:2.53`.
- **Gancho desde enlace + cuerpo** (V7):
  `hook_test={generation_mode:'hooks_only', hook_clip:1, reuse_body:true, capcut_copies:true, variants:[{hook_id:'reference_url', reference_url:'…/reel/DfzMrZlokCC/', notes:''}]}`.
- **Avatar manual + fondo** (V2): `avatar:'mujer 12'`, `avatar_selection_mode:'manual'`, y en la variante `reference_images:[{id, label:'cea00…jpg', role:'fondo'}]`.

Otros campos que aparecen en los 572 ítems de los 71 pedidos:

| Campo | Valores |
|---|---|
| `kind` | replicate 328 · regenerate 160 · new 44 · adapt 36 · edit 4 |
| `method` | genjutsu 309 · auto 203 · A 39 · B 20 · C 1 |
| `music_mode` | reference_auto 219 · pending 132 · song 128 · keep 58 · none 35 |
| `genjutsu_model` | motion_control 525 · wan3_0_prime 23 · replace_object 10 · flash 9 · wan3_0 1 |
| `generation_resolution` | 480p 268 · 1080p 17 · auto 15 · 720p 3 |
| `frame_mode` | none 279 · keep 248 · new 40 · select 5 |
| `text_mode` | source 312 · none 152 · keep 108 |
| `avatar` | vacío 438 de 571 |

Campos menos frecuentes:
- `attached_bodies` (46);
- `additional_avatars` (39);
- `frame_captures` (21);
- `duplicate_frame_policy{mode:'new'|'reuse', source_batch, source_item, source_account}` (18);
- `hook_generation_model` (seedance 8, motion_control 7);
- `automatic_body_selection`, `body_selection_plan`;
- `concept_adaptation{reference_url, instructions, reference_images}`;
- `final_dubbing_mode`;
- `audio_language_mode`;
- `generate_body_url`;
- `new_clip_count`, `new_clip_sources`;
- `text_custom`;
- `resolution` (Wan).

Lo que añade el servidor al preparar (`prepared[]`, por ítem):
- `state` (`prepared`/`attention`/`review`) y `error`;
- `avatar_matching_policy` (estado `pending_visual_match`) y `avatar_snapshot`;
- `music_snapshot` (con `drop_marker{seconds:9.32, song_sha256, origin:'human_saved_marker'}`);
- `music_auto_plan{mode:'generated_original'}`;
- `hook_body_sources[{path, sha256, source_clip}]`;
- `countdown_reveal_policy{countdown_reveal_hold_seconds:1}`;
- `video_edit_plan{audio:'preserve_generated', …}`;
- `audio_language_plan{target_language:'de-DE'}`;
- `pinterest_search_enabled`;
- `regeneration_engine_policy`.

En V6 y V9 (Genjutsu con canción) **no hay `music_snapshot`**: el sistema antiguo dejaba ganar el audio generado. El dueño decidió el 22/11 que la canción elegida manda siempre.

## 5. Estados de una tarjeta y del lote (texto de la interfaz)

**Tarjeta** (`itemState`):
- «Borrador»
- «Completar opciones» (error de preparación, con el detalle)
- «Esperando traducción»
- «Procesando textos»
- «Error en textos»
- «Textos por aprobar» («Los textos están listos. Falta tu aprobación; no es un error.»)
- «Preparado localmente» (en la versión antigua: «Listo para enviar»)
- «Enviado» (bloqueada)

**Grupo de cuenta:** «N con error · N textos por aprobar · N procesando», «N seleccionados».

**Lote:**
- «Borrador · sin envíos»
- «Hay opciones que completar»
- «Preparado · listo para enviar»
- «Encargo guardado» (en la versión antigua: «Encargo enviado a Codex»)
- «N enviados · M pendientes»

**Aviso al destinatario:**
- «Aviso pendiente»
- «Aviso en cola · recepción pendiente»
- «Aviso sin confirmar · conservar el encargo»
- «Aviso no enviado · alta pendiente»
- «Recepción confirmada»

**Referencias:** «Pendiente de aprobación» / «Aprobada para este lote» / «Rechazada».

Después del envío, los frames se aprueban en otra pantalla (`production.html`). El lote no enseña ni el clip ni la edición.

## 6. Correspondencia con PRINCIPAL

PRINCIPAL ya tiene:
- productos con fotos por papel (`articulo`, `embalaje`, `avatar`, `entorno`, `otro`);
- un vídeo con referencia subida (o enlace a través del agente del Mac), desglose de Claude, imagen inicial con 2 candidatas y aprobar/rechazar, clip Seedance (`omni_reference`, 480/720/1080p) y descarga;
- el tablero Lotes v1 en construcción (`docs/superpowers/specs/2026-11-22-lotes-design.md`).

| Función antigua | En PRINCIPAL | Qué falta / propuesta |
|---|---|---|
| Lote con nombre, historial y filas | Lotes v1: tabla `batches` y tablero | Duplicar lote, duplicar a otra cuenta, «Seleccionar todos», filtro «Por revisar», notas por cuenta |
| Una tarjeta por enlace pegado | Una fila por archivo arrastrado; el enlace llega con la Tarea 13 | Pegar varios enlaces de Instagram o Facebook a la vez |
| Replicar (Genjutsu, Motion Transfer u Object Swap) | No: solo Seedance | Motores Genjutsu/Wan, o asumir que «replicar» = Seedance con referencia. **Decisión pendiente** |
| Regenerar / adaptar concepto (galería de conceptos y clips) | No | Biblioteca de conceptos y clips propios por producto (el inventario exporta 323 conceptos), con selector visual |
| Gancho + cuerpo reutilizado | No | **Prioritario para el dueño**: biblioteca de clips en la nube con vista previa ligera, elegir cuerpos en orden y generar solo el gancho |
| Biblioteca de ganchos validados | No | Lista de ganchos (countdown, café, regalo…) con su prompt |
| Crear desde cero (clips con captura por toma) | Parcial: la imagen inicial puede partir de una referencia | Varias tomas por vídeo y captura por toma |
| Editar vídeo existente | No (no hay montaje) | Depende del montador |
| Frame: conservar, elegir o nuevo; captura por clip | Imagen inicial nueva con 2 candidatas | «Conservar» y elegir un frame existente de la biblioteca |
| Variante del producto | Parcial: varias fotos `articulo` con etiqueta | Elegir qué foto de artículo usa el vídeo |
| Avatar automático por referencia / sin sustitución / elegido | Sí: avatar = foto con papel «avatar» del producto, o «no aparece nadie» | Modo automático; «Sin sustitución» ≠ «no aparece nadie» (conservar a las personas del original); biblioteca global de avatares (21 exportados); varios avatares con papel |
| Fondos y referencias adicionales (fondo/otro, qué cambia) | Parcial: foto `entorno` por vídeo | Varias imágenes con «Qué debe cambiar» |
| Pinterest sí/no | No | Opcional |
| Música: automática, conservar, sin canción o canción + segundo de inicio | No (el montaje sigue en el Mac) | Biblioteca de canciones con drop (`docs/importacion/datos/canciones.json`, 31 con drop) y elección por vídeo. Regla: la canción elegida manda; sin canción → audio original |
| Referencia de edición, versión en francés, doblaje | No | Llegan con el montador |
| Textos (lectura, traducción, aprobación) | No | El editor saca los textos de la referencia. Hoy en el lote viejo está oculto; no rehacerlo como paso del lote |
| Notas «Cambios específicos» + dictado | Lotes v1: indicación de una línea (`videos.note`) | Texto largo; el dictado es opcional |
| Preparar / Enviar a destino | No aplica: la web genera directamente, con presupuesto y confirmación | El destino CapCut o Higgsfield pasa a ser «quién hace el montaje» |
| Estados de la tarjeta | Estados por paso (referencia, desglose, imagen, clip) | Añadir «falta elegir…» como equivalente a «Completar opciones» |
| Calidad de generación | Sí (`clipResolution`) | Topaz/upscale |

