# Mapa de paridad: motor antiguo frente a PRINCIPAL (23/11/2026)

Auditoría de solo lectura. Regla de trabajo: **primero igualar, después mejorar**. Este mapa dice, función por función, qué hacía el motor que manejaba Codex, dónde está en su código y si PRINCIPAL lo hace igual.

- Textos fijos copiados íntegros: `docs/paridad/origen/` (índice en `origen/INDICE.md`).
- Tres casos reales para comparar tarjeta → payload: `docs/paridad/casos/`.
- Amplía `docs/aprendizaje-encargos-antiguos.md` (no repite sus tablas de modelos ni sus casos emparejados).

## 0. Cómo funcionaba de verdad el motor antiguo

Lo que no se había entendido al construir PRINCIPAL desde un resumen de reglas:

1. **El motor no escribe prompts enteros con un modelo.** La app (`EDITOR/lote_app.py`) guarda las tarjetas, las congela en un JSON y despierta a Codex con un texto fijo de instrucciones (`origen/encargo-instrucciones-al-agente.md`). Codex mira la fuente y escribe **solo las frases propias de cada vídeo** (apertura, entorno, luz; acciones, cambios, producto) dentro de un guion por pedido (`prepare-openings.py`, `production_common.py`, `order6852_*.py`). El resto del prompt son **plantillas y párrafos fijos del código**, siempre iguales.
2. **Todo pasa por puertas de código** (`frame.py`, `frame_realism.py`, `lanzar.py`, `genjutsu.py`, `production_engine.py`) que comprueban adjuntos, índices, hashes y recibos antes de gastar. De 893 archivos Python, la mayoría son puertas, recibos y excepciones de pedidos concretos; lo que decide la calidad cabe en una docena.
3. **La réplica se hace con el vídeo original entero como autoridad del movimiento** (Genjutsu Motion Transfer en 525 de 572 tarjetas) y el frame aprobado como referencia de imagen. Seedance solo se usaba para ganchos hablados y cuerpos nuevos.
4. **La edición de una réplica no recorta ni reordena**: pone los rótulos alemanes en los mismos tramos de tiempo en que la referencia tiene texto, con el estilo 06B, y conserva el audio generado.

Dos copias del código: la de trabajo (`~/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/`, la más nueva en casi todo) y el paquete que sirve la app (`~/Library/Application Support/SEGATOM/code-packages/test-hook-selection-20261102/app/EDITOR/`, que tiene además `reference_music_match.py`, `body_catalog.py`, `batch_defaults.py`). Abajo, `ED/` es la primera, `LIVE/` la segunda, `ORD81/` la carpeta del pedido entregado el 20/11 (`/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194…-81/`).

## 1. Tabla de paridad

Estado: **IGUAL**, **PARCIAL** (qué falta) o **FALTA**. El estado de PRINCIPAL está comprobado en su código, no supuesto. Esfuerzo: S (≤ 1 día), M (2–4 días), L (una semana o más).

### A. Tarjeta y pedido

| # | Función | Motor (archivo · función) | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 1 | Tipos de tarjeta | `ED/lote_app.py` · `normalize`, `KINDS=('regenerate','replicate','adapt','new')` + `edit`, modo `hooks_only` y `concept_adaptation` | Siete maneras de pedir un vídeo: replicar, regenerar un concepto guardado, adaptar a otra cuenta, crear desde cero, editar uno existente, generar gancho, adaptación de concepto | `src/server/videos/brief.ts` `VIDEO_KINDS = replicar, adaptacion_concepto, solo_gancho` | PARCIAL: faltan regenerar concepto guardado, adaptar a otra cuenta, crear desde cero y editar existente | L |
| 2 | Guardar la tarjeta | `ED/lote_app.py` · `save`, `normalize`, `normalize_cast` | 40 campos por tarjeta: `notes`, `url`, `product_variant_key`, `avatar_selection_mode`, `additional_avatars`, `genjutsu_model`, `genjutsu_references[{id,label,role}]`, `generation_resolution`, `music_mode/number/start`, `video_edit_mode`, `video_edit_reference_url`, `hook_test`, `attached_bodies`, `body_auto_mode`, `final_dubbing_mode`, `audio_language_mode` | `src/server/videos/batches.ts`, `videos.ts`, `src/components/batches/draft.ts` | PARCIAL: faltan modelo de vídeo, varias referencias con papel, avatares adicionales, test de ganchos, idioma del audio y doblaje | M |
| 3 | Congelar el pedido | `ED/lote_app.py` · `prepare`, `materialize`, `submit`; `ED/submitted_order_context.py` · `admitted` | `materialize` valida y congela cada tarjeta (variante, avatar, plan de edición, plan de música, Pinterest sí/no). `submit` escribe `app-<id>-<rev>.json` inmutable con el texto fijo del encargo, lo inscribe en el motor y avisa al agente. Reintentar devuelve el mismo recibo | `src/server/videos/lote.ts` · `sendBatch`, `quoteBatch`, `confirmBatch` | PARCIAL: el lote se confirma una vez, pero no queda una copia inmutable con hash de la tarjeta tal como se envió | M |
| 4 | Dudas juntas y presupuesto una vez | `AGENTS.md`, `memory/context/proactividad-y-preguntas-lotes.md` | Una sola consulta con todas las dudas; el envío autoriza el gasto del lote | `lote.ts` · `batchQuestions`, `answerQuestion`, `quoteBatch` | IGUAL | — |
| 5 | Referencia de generación ≠ de edición | `ED/edit_intent.py`; `ED/video_edit_policy.py` · `plan` (`reference.kind = explicit_url / generation_source`) | El enlace de edición manda en textos, ritmo y audio; vacío, hereda la de generación | `videos.ts` · `effectiveEditReferenceUrl`, `checkEditReferenceUrl` | IGUAL | — |
| 6 | Bajar y trocear la fuente | `ED/pipeline.py`, `ED/cortes.py` · `cortes`, `fotogramas`; `ORD/sources/<id>/ref.mp4`, `escenaNN.png`, `preparation-results.json` | yt-dlp, cortes con ffmpeg (umbral 0,2), una captura por escena, duración exacta que luego es la del vídeo | `intake.ts` · `processReference`; `agente-mac/lib.mjs` · `ytDlpArgs`; `analysis.ts` (`shots`) | PARCIAL: una sola captura (el primer fotograma); no hay captura por toma | M |

### B. Variante, artículo y embalaje

| # | Función | Motor | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 7 | Variante por ID de catálogo | `ED/submitted_variant_assets.py`, `LIVE/variant_packaging_binding.py`, `ED/product_reference_policy.py` | `product_variant_snapshot` con archivo y hash del artículo y de su embalaje oficial; la caja de otra variante no vale | `src/server/variants.ts`, `manifest.ts` · `ofVariant` | IGUAL | — |
| 8 | Bloquear si falta el archivo de la variante | `ED/frame.py` · `preparar` («hay varias imágenes… declara la variante», «MARCADO COMO INCORRECTO») | No se genera sin el archivo exacto | `lote.ts` (pregunta `variante` / `articulo`) | PARCIAL: no comprueba el embalaje cuando la toma lo enseña | S |
| 9 | Foto de «funcionamiento» | `ED/genjutsu_function_reference.py` · `attach`; tarjeta `product_function_reference` | Foto de lo que el producto hace o proyecta, adjunta tras el artículo | `src/lib/photo-roles.ts` (`articulo, embalaje, avatar, entorno, otro`) | FALTA | S |
| 10 | Frase de función física del producto | `ORD81/production_common.py` · `genjutsu(..., product_prompt)`; `motion_product_guard` | Frase por producto pegada en cada vídeo («milk enters the uncovered bowl; toppings… never land on the motor») más dos fijas de geometría y escala | — | FALTA | S |
| 11 | Declarar qué se ve del producto | `ED/frame.py` · `preparar` (`en_pantalla`, `sin_producto`, regex `OCULTO`) | Si el producto va tapado en la toma inicial, **no se adjunta su foto**; el embalaje solo si se ve o se revela | `manifest.ts` · `productRefs` adjunta siempre artículo (≤ 4) y embalaje (≤ 2) | FALTA | M |

### C. Avatares

| # | Función | Motor | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 12 | Biblioteca de avatares numerados | `ED/avatares.py` · `resolver`, `biblioteca_activa`, `seleccion_frame` | «mujer 12», «hombre 4»: retratos con número permanente | `src/server/avatars.ts` | IGUAL | — |
| 13 | Avatar automático por coincidencia | `ED/avatar_matching_policy.py` · `validate_task_decision` (`reference-avatar-match-v1`) | Se mira la fuente y los retratos; por cada persona visible, papel, sexo y edad aproximada, y el retrato compatible; sin personas, `sin avatar` | `src/lib/avatar-choice.ts` · `pickAvatar` con `personaRef` del desglose | PARCIAL: solo la persona principal | M |
| 14 | Varias personas con su papel | `ED/genjutsu_cast.py`, `ED/scene_identity_references.py`, `ED/submitted_reviewed_later_cast.py` | Avatares secundarios adjuntos antes del principal; personas que aparecen en tomas posteriores con su frase | — | FALTA | M |
| 15 | Sin sustitución / toma sin cara | `avatar_selector='sin avatar'`; `ED/genjutsu.py` · `prompt_estandar` | En POV solo manos no se adjunta identidad ni se pide cambiar personas | `videos.ts` (`avatarMode`), `manifest.ts` · `avatarRefs` | IGUAL | — |
| 16 | Nota de cuenta | notas de la cuenta en la tarjeta; `memory/context` | «ni ancianas ni canas, 35–50» se aplica a imagen y vídeo | `videos.ts` · `productNotesOf`, `withProductNotes` | IGUAL | — |

### D. Fondos

| # | Función | Motor | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 17 | Varias referencias por tarjeta, con papel e instrucción | `ED/lote_app.py` `GENJUTSU_ROLES=('fondo','articulo','embalaje','avatar','otro')`; `ED/genjutsu_backgrounds.py`; `ED/submitted_background_selection.py` | Cada imagen subida guarda miniatura, papel, instrucción y orden; dos fondos = dos lugares | una foto `entorno` por vídeo (`environmentPhotoId`) | PARCIAL: una sola, sin instrucción | M |
| 18 | Fondo real de Pinterest por toma | skill `fondos-pinterest-por-toma`; `ED/lote_app.py` · `materialize` (`pinterest_search_enabled=False` si la tarjeta trae capturas); inventario `/Volumes/T7/AUTOMATIZACION SEGA/Referencias/Pinterest-seleccion-Emmanuel-20261117/inventario.json` | **Siempre hay foto real de entorno**: la subida o una elegida de la selección manual del dueño (casas, dm, Sephora, Aldi…) | — | FALTA | L |
| 19 | Un fondo por lugar real | `ED/genjutsu.py` · `prompt_estandar` (Object Swap); `ED/order6852_object.py` | Mapa toma → fondo; A/A/B/C/D = cuatro fondos, el mismo en las dos tomas de A | — | FALTA | M |

### E. Imagen inicial

| # | Función | Motor | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 20 | Foto de realismo, siempre la última | `ED/frame_realism.py` · `reference`, `PROFILES`; `REFERENCIA_CALIDAD/realismo-emmanuel-20261003/catalog.json` (posiciones 1, 2, 3, 4, 6; la habitual, `emmanuel-2.png`) | Foto real del dueño adjunta solo para textura | — | FALTA | S |
| 21 | Constructor del prompt en ocho párrafos | `ED/frame_realism.py` · `build`, `prepare_manifest`, `validate_prepared`; guion `ED/order6852_frame_preparation.py` l. 123–125 | 1 apertura (propio) · 2 identidad (fijo) · 3 producto (fijo) · 4 entorno (propio) + `NICHE_DIRECTION` · 5 luz (propio) + `LIGHTING_POLICY` · 6 realismo (fijo) · 7 y 8 cierre (fijos). Texto en `origen/imagen-parrafos-fijos.md` | `analysis.ts` · `analysisInstructions` punto 6: el modelo escribe el prompt entero | FALTA | M |
| 22 | Orden de adjuntos | guion: «composition, extras, supporting portraits, primary, realism»; `frame.py` valida índices | captura → artículo → embalaje → funcionamiento → fondos → avatares secundarios → avatar principal → realismo; el prompt cita `image [N]` | `manifest.ts` · `imageManifest`: captura → avatar → artículo → embalaje → entorno; cita `image N` | PARCIAL: otro orden, sin realismo ni funcionamiento | S |
| 23 | Modelo y parámetros | `ED/frame_model.py` · `command`, `DEFAULT='nano_banana_2_1'` | `--resolution 2k --aspect-ratio 9:16 --thinking-level high`, hasta 14 referencias | `frame.ts` (`nano_banana_2_1`, `2k`, `9:16`) | PARCIAL: no envía `thinking_level: high` | S |
| 24 | Puerta del prompt de imagen | `ED/frame.py` · `preparar`: `LISTA_NEGRA`, `SIN_OVERLAY`, `OCULTO`, frase «only that person», «realism reference only»; `ED/contrato.py` | Rechaza palabras de look publicitario, títulos en mayúsculas, falta de «sin texto encima», avatar sin frase de identidad. Texto en `origen/imagen-puerta-reglas.md` | `prompt-check.ts` · `checkImagePrompt`, `PROMPT_BLACKLIST` | PARCIAL: solo lista negra y etiquetas | S |
| 25 | Tope de intentos | `ED/frame.py` `TOPE_INTENTOS = 2` | Dos imágenes y se para | `lote.ts` · `stageOf`, `MAX_REGENERATIONS` | IGUAL | — |
| 26 | Envío con recibo | `ED/frame_transport.py` · `execute`, `upload_recovery_guard` | Un POST ambiguo no se repite; subidas reutilizadas por hash y espacio de trabajo | `generations.ts` · `submitGeneration`, `reconcileGeneration`; `ensureMedia` | IGUAL | — |
| 27 | Un frame por clip | `ED/lote_control.py` (items `vN-cM`); texto del encargo (`frame_requests`, `clip_execution_plan`) | Cada toma que se genera tiene su apertura aprobada | una imagen por vídeo | FALTA | L |
| 28 | Corrección añadida, no reescritura | `ED/lote_control.py` · `append_frame_variant`; guiones `*_correction.py` | Se conserva el prompt aprobado y se añade «IMPORTANT CORRECTION: …» | `frame.ts` · `rejectFrame` con motivo y nuevo desglose | PARCIAL: reescribe el prompt | S |
| 29 | Revisión técnica antes de enseñar | `ED/verificar.py`, `ED/integridad_previa.py` · `verificar`; `ED/frame_human_review_policy.py` | Otro revisor comprueba variante, caja, avatar, fondo y acción | — | FALTA | M |

### F. Presentación y aprobación

| # | Función | Motor | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 30 | Ronda completa y decisión agrupada | `ED/lote_control.py` · `present`, `record_group_frame_decision`, `can_approve`; `ORD81/present-frames.py` | Todas las imágenes juntas, por vídeo y cuenta; no se aprueba una ronda a medias; rehacer una conserva las demás | `src/components/batches/review-images.tsx`; `frame.ts` · `approveFrame`, `rejectFrame` | IGUAL | — |

### G. Vídeo

| # | Función | Motor | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 31 | Elegir el modelo en la tarjeta | `ED/genjutsu.py` · `modelo`, `DEFAULT_NEW_MODEL='hf_mult_motion_control'`; `ED/genjutsu_defaults.py`; `ED/submitted_genjutsu_model_selection.py` | Motion Transfer (por defecto), Object Swap, Lite, Wan 3.0, Wan 3.0 Prime, Seedance | solo Seedance 2.5 (`clip.ts`) | FALTA | M |
| 32 | Adaptador Motion Transfer | `ED/genjutsu.py` · `parametros`, `reservar`; `ED/genjutsu_cli.py` · `arguments` | `hf_mult_motion_control --resolution 480p`, vídeo fuente en `video_references`, imágenes en `image_references` | — | FALTA | M |
| 33 | Adaptador Object Swap | ídem, `MODEL='hf_mult_replace_object'` | Igual, hasta 9 imágenes | — | FALTA | S |
| 34 | Adaptador Wan 3.0 / Prime | `ED/genjutsu.py` · `parametros`, `wan_requested_duration`; `ED/wan_reference_partition.py` | `duration` entera 4–30, `aspect_ratio auto`, `generate_audio true`, `enable_thinking false`; nunca `start_image` con vídeo | — | FALTA | M |
| 35 | Adaptador Seedance 2.5 | `ED/lanzar.py` · `video_command`; `ED/calidad_seedance.py` · `politica` | `--start-image`, `--mode omni_reference`, `--bitrate_mode high`; 480p, o 720p con caras alejadas; **sin vídeo de referencia y con audio** en ganchos hablados | `clip.ts`: `omni_reference`, `bitrateMode high`, `@Video1` siempre, `generate_audio: false` | PARCIAL: no puede hacer el gancho hablado (sin audio y con el vídeo original adjunto) | S |
| 36 | Prompt de Motion Transfer | `ORD81/production_common.py` · `genjutsu`; `ED/genjutsu.py` · `prompt_estandar`; `ED/order6852_motion.py` | Un párrafo: autoridad del vídeo → identidad → frame aprobado → acciones en orden → cambios de fondo → producto y función → fijas. Texto en `origen/video-genjutsu-plantillas.md` | — | FALTA | M |
| 37 | Prompt de Object Swap | `ED/genjutsu.py` · `prompt_estandar` (dos párrafos «MANDATORY OBJECT SWAP…» y «Replace EVERY original environment…»); `ED/order6852_object.py` | Lo anterior más mapa de fondos por toma y borrado de textos | — | FALTA | M |
| 38 | Prompt de Wan | `ED/video_edit_policy.py` · `short_wan_prompt`, `validate_prompt` | Frases cortas: solo los cambios. Texto en `origen/video-wan-plantilla.md` | — | FALTA | S |
| 39 | Prompt de Seedance | prompts de `BIBLIOTECA_PROMPTS.md`; `ED/order6852_hooks.py`; `ED/lanzar.py` `HABLA` | Gancho hablado con frase literal, quién la dice y tiempos; cuerpo en un párrafo con «Then cut to…» | `reglas/video-seedance.md` + `analysis.ts` (`videoPrompt`) | PARCIAL: la plantilla de PRINCIPAL dio dos vídeos aceptados; faltan los ganchos hablados | M |
| 40 | Frame aprobado como referencia, no como primer fotograma | `ED/genjutsu_initial_frame.py` · `attach`, `require` (`papel_enviado='image_references'`) | En Genjutsu y Wan el frame va en `image_references` con la frase «human-approved clean opening frame» | `manifest.ts` · `clipManifest` (`start_image` o referencia, solo Seedance) | FALTA (va con 32–34) | S |
| 41 | Recortar la fuente al gancho | `ED/reference_hook_policy.py`; `selected_source_segment` | El vídeo fuente se corta al tramo exacto del gancho | `videos.ts` · `segmentMsFor`, `hookTiming` | IGUAL | — |
| 42 | Idioma del audio | `ED/video_audio_policy.py` · `instruction` | Solo Wan Prime: conservar, traducir o no añadir voz, según lo que se oye en la fuente | — | FALTA (va con 34) | S |
| 43 | Resolución por tarjeta | `ED/video_resolution.py` | 480p por defecto desde el 07/11 | `videos.ts` (`clipResolution`) | IGUAL | — |
| 44 | Envío único y recuperación por ID | `ED/genjutsu.py` · `reservar`, `reclamar`, `recibir`; `ED/video_recovery.py`; `ED/production_receipt_lookup.py` | Ticket antes de enviar; tras un corte se recupera el mismo trabajo; los inciertos no se reenvían | `generations.ts` · `submitGeneration`, `pollGeneration`, `reconcileGeneration`, `sweepGenerations` | IGUAL | — |
| 45 | Reintento tras fallo sin salida | `ED/genjutsu_retry_policy.json` (`max_retries: 1`); `ED/seedance_retry.py` | Un reintento autorizado de antemano | `lote.ts` · `stageOf` | IGUAL | — |
| 46 | Cola y concurrencia | `ED/production_engine.py` (dos grupos de 4 hilos; plan `rounds_append_only`) | Los vídeos avanzan a la vez; un nodo ya registrado no cambia | pg-boss (`src/jobs/`), `lote.ts` · `advanceBatch` | IGUAL | — |
| 47 | Quitar los textos del original | frase fija en todos los prompts; segunda pasada «TEXT REMOVAL ONLY» (`origen/video-genjutsu-plantillas.md` §5) | Si el resultado conserva rótulos, pasada de Object Swap sobre el vídeo aprobado nombrando los rótulos literales | exclusión en el prompt de Seedance | PARCIAL: falta la segunda pasada | M |
| 48 | Revisar el vídeo antes de upscale | `ED/encuadre_video.py` · `veredicto_valido`; `ORD/EDITOR/revisiones_video/` | Se abre el resultado y se compara con notas y fuente | — | FALTA | M |
| 49 | Cuenta atrás y destape | `ED/countdown_guard.py`; `EDITOR/COUNTDOWN_REVEAL_HOLD.md`; `editorial_requirements.hook_limits_by_concept` | La tela tapa hasta acabar la frase; 1 s de cajas tras el destape; máximos 3 s (regalo, café) y 6 s (1, 2, 3) | `analysis.ts` riesgo `reveal_adelantado`; `hookSeconds` | PARCIAL | S |

### H. Ganchos y cuerpos

| # | Función | Motor | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 50 | Biblioteca de ganchos validados | `ED/hook_library.py` · `ENTRIES`, `catalog`, `freeze`; `ED/hook_durations.json`; `BIBLIOTECA_PROMPTS.md` | Nueve ganchos con prompt congelado y duración confirmada (6, 4, 4, 5… s). Texto en `origen/video-seedance-y-ganchos.md` | — | FALTA | M |
| 51 | Gancho desde enlace + cuerpo | `ED/reference_hook_policy.py` | Se genera solo el gancho; el cuerpo se añade en edición | `solo_gancho` + `bodies.ts` | IGUAL | — |
| 52 | Biblioteca de cuerpos y cuerpo automático | `LIVE/body_catalog.py`, `LIVE/batch_defaults.py`, `ED/body_auto_delivery.py`; `/Volumes/T7/…/Motor/biblioteca-cuerpos` | Cuerpos revisados por producto; en automático se busca primero en la misma referencia y cuenta | `bodies.ts` · `listProductBodies`, `markBody` | PARCIAL: sin elección automática | M |
| 53 | Test de ganchos | `ED/hook_library.py` · `normalize` (1–20 variaciones); `ED/product_hook_flow.py` | Varias variaciones de gancho sobre el mismo cuerpo | — | FALTA | M |

### I. Montaje, textos y música

| # | Función | Motor | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 54 | Analizar la referencia de edición | `ORD81/review_edit_sources.py`; `post-edit/cue-boundaries.json`; `ED/edit_reference_review.py`; `ED/rhythm_edit.py` | Se baja el vídeo de edición y se anotan los bloques de texto con su inicio y fin, los cortes y el audio | `montador/analizar_referencia.py`; rea-video en `agente-mac` | PARCIAL: mide ritmo y cortes, pero no saca los tramos de cada bloque de texto para reproducirlos | M |
| 55 | Escribir los textos | `ORD81/prepare-edit-plan.py` (`TEXT`) | Un texto alemán por cada bloque de la referencia, con marca, tienda y emojis del nicho; el último se alarga hasta el final | `analysis.ts` `editTexts {main, cta}`; `edits.ts` · `editTextsFor` | PARCIAL: solo dos rótulos | M |
| 56 | Estilo 06B | `ED/order43_text06b.swift`; `video_edit_policy.plan` `text_style` | TikTokDisplay-Medium, blanco, borde negro 0,05 em, interlínea 35/31, caja x112 y287 886×318 sobre 1080×1920 | `montador/texto06b.swift`, `montador.py` `BOX` | IGUAL | — |
| 57 | CTA por cuenta | `ED/closing_cta.py`, `closing_cta_defaults.json`; `ED/edicion_politicas.py` · `account_cta` | Nombre de marca y emojis por cuenta; «Kommentiere „Marca“…» | `edits.ts` · `standardCta`; `montar_auto.py` · `cta_standard` | PARCIAL: un CTA genérico con un emoji fijo | S |
| 58 | Réplica: conservar cortes, ritmo y duración | `ORD81/edit-videos.py` · `render` | No recorta: mismos fotogramas y fps que el clip, rótulos superpuestos, `-c:a copy` | `montador/montador.py` · `decide_windows`, `plan_auto_shots` | PARCIAL: PRINCIPAL recorta ventanas con el «ritmo viral»; para una réplica el motor no tocaba el clip | M |
| 59 | Gancho + cuerpo | `ORD81/assemble14-final.py`; `editorial_requirements` | Gancho hasta su límite, cuerpos en su orden, sin el gancho antiguo | `montar_auto.py` · `construir_plan`, `rango_gancho` | IGUAL | — |
| 60 | Canción elegida con drop | `ED/music_mix_contract.py` · `contract` (R2); `ED/music_drop_sync.py`; `music_offset_rule: saved_drop_minus_observed_body_start` | Canción continua desde el fotograma 0, drop guardado en el inicio real del cuerpo, sin bajar el volumen sola, voz del gancho conservada | `src/server/songs.ts`; `montador.py` · `build_song_mix`, `measure_song_offset` | IGUAL | — |
| 61 | Elegir canción sola | `LIVE/reference_music_match.py` · `features`, `alignment`, `choose`; `ED/music_auto_policy.py` | Compara el audio de la referencia con los MP3 (8 kHz, 64 bandas); propone si puntuación ≥ 0,92 y margen ≥ 0,06; si no, pendiente. Código íntegro en `origen/musica-reglas.md` | — | FALTA | M |
| 62 | Réplica con su audio generado | `ED/genjutsu_audio_policy.py` | Una réplica completa de Genjutsu conserva su audio y no lleva canción externa | «Audio original» (`videos.ts` · `setVideoSong`) | IGUAL | — |
| 63 | Doblaje y voz en otro idioma | `ED/reference_dubbing.py`, `ED/final_dubbing.py`, `ED/dialogue_stems.py`, `ED/foreign_spoken_segments.py` | Doblar al alemán un gancho hablado; separar voz y música | `montador/separar.py` (solo separación) | FALTA | L |
| 64 | Auditar el MP4 final | `ED/cut_integrity.py`, `ED/edit_audio_integrity.py`, `ED/edit_delivery_gate.py` | Decodificación completa, cortes contra los rangos revisados, audio medido | `montador.py` · `self_check` | PARCIAL | M |
| 65 | Segunda versión en otro idioma | `ED/video_edit_policy.py` · `additional_deliverables` | Textos en francés desde el mismo máster, con su recibo | — | FALTA | M |

### J. Upscale, descripciones y entrega

| # | Función | Motor | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 66 | Upscale Topaz | `ED/upscale.py` (`MODEL='topaz_video'`, `RESOLUTION='1080p'`, `enhancement {model:'thd-3'}`, `frame_interpolation None`) | Todo lo generado a 480p sube a 1080p con los fps originales, tras revisar el clip | — | FALTA | M |
| 67 | Descripciones | `ORD81/post-edit/descriptions/NN-Beschreibung-DE.txt`; `ORD81/package-edits.py` | Un `.txt` por vídeo e idioma con los rótulos, un bloque por párrafo | — | FALTA | S |
| 68 | Carpeta de entrega | `ORD81/package-edits.py`; `ED/submitted_delivery.py`; `ED/entregar.py` | `videos editados/<fecha>/<pedido>/<Cuenta - DE>/NN - <Cuenta> - DE.mp4` + descripción; manifiesto con hashes y recuento igual al de tarjetas | `edits.ts` · `saveEdit`, `editVideoResponse` (MP4 en la web) | PARCIAL: no hay paquete por cuenta ni comprobación de que están todos | S |
| 69 | Guardar como concepto al cerrar | `ED/completed_batch_catalog.py` · `publish` | El lote entregado entra en el catálogo de conceptos reutilizables | `library.ts` · `refreshLibrary` | PARCIAL: guarda resultados, no conceptos regenerables | M |

### K. Memoria y aprendizaje

| # | Función | Motor | Qué hace y constantes | PRINCIPAL | Estado | Esf. |
|---|---|---|---|---|---|---|
| 70 | Reglas leídas antes de generar | `AGENTS.md`, skills de `~/.codex/skills/`, `memory/context/` (74 notas), `REGLAS_EDICION/` | El agente lee las reglas vigentes de cada modelo antes de escribir | `src/server/rules.ts`; `reglas/*.md` (imagen, Seedance, adaptación, ángulos) | PARCIAL: faltan las reglas de Genjutsu, Wan, Pinterest y edición | M |
| 71 | Cada corrección se vuelve regla | `ED/lecciones.py` · `nueva`; `ED/cerebro.py`; `ED/guardia.py` (`correcciones_sin_leccion`); `memory/context/aprendizajes-lote81-20261120.md` | Una corrección del dueño no puede quedarse en la conversación: se escribe como nota con su comprobación | — | FALTA | M |

## 2. Recuento

71 funciones: **19 IGUAL**, **24 PARCIAL**, **28 FALTA**.

- IGUAL (19): 4, 5, 7, 12, 15, 16, 25, 26, 30, 41, 43, 44, 45, 46, 51, 56, 59, 60, 62.
- PARCIAL (24): 1, 2, 3, 6, 8, 13, 17, 22, 23, 24, 28, 35, 39, 49, 52, 54, 55, 57, 58, 64, 68, 69, 70 y 47 (solo falta la segunda pasada).
- FALTA (28): 9, 10, 11, 14, 18, 19, 20, 21, 27, 29, 31, 32, 33, 34, 36, 37, 38, 40, 42, 48, 50, 53, 61, 63, 65, 66, 67, 71.

Lo que PRINCIPAL ya iguala es la fontanería (gasto, envío único, cola, aprobación, variantes, 06B). Lo que falta es casi todo lo que decide cómo sale la imagen y el vídeo.

## 3. Orden de portado, de más a menos impacto en la calidad

| Orden | Qué portar | Funciones | Por qué va aquí | Esf. |
|---|---|---|---|---|
| 1 | Prompt de imagen con párrafos fijos y orden de adjuntos del motor | 21, 22, 23, 24 | Es la causa directa de la primera prueba fallida: el modelo escribe 4.900 caracteres donde el motor ponía 700–1.300 propios y el resto probado. Todo lo demás parte de esta imagen | M |
| 2 | Foto de realismo siempre la última | 20 | Un adjunto y un párrafo fijo; es lo que quita el aspecto de catálogo | S |
| 3 | Foto real de entorno siempre: varias referencias con papel y fondos de la selección de Pinterest | 17, 18 | Sin foto de entorno el motor no generaba; es la mitad del realismo y de la localización (dm, Sephora, Aldi) | L |
| 4 | Genjutsu Motion Transfer: modelo en la tarjeta, adaptador, plantilla y frame como referencia | 31, 32, 36, 40 | Es el motor del 92 % de las tarjetas y de 16 de los 18 vídeos entregados; hoy PRINCIPAL replica con otro modelo | M |
| 5 | Producto exacto en cada toma: qué se ve, foto de funcionamiento y frase de función física | 9, 10, 11 | Evita la caja equivocada, el producto revelado antes de tiempo y el uso imposible (ingredientes sobre el motor) | M |
| 6 | Object Swap con un fondo por lugar y pasada de borrado de textos | 33, 37, 19, 47 | Necesario cuando el producto del original es distinto; sin el borrado, los vídeos se rechazaban por los rótulos | M |
| 7 | Edición de réplica como el motor: textos bloque a bloque en los tiempos de la referencia, sin recortar, CTA por cuenta | 54, 55, 58, 57 | El montaje de PRINCIPAL cambia el ritmo de una réplica y solo pone dos rótulos; el dueño entregaba el clip intacto con los textos de la referencia adaptados | M |
| 8 | Ganchos validados de biblioteca con Seedance hablado | 50, 35, 39 | Los ganchos «1, 2, 3», café y regalo son los que el dueño ya dio por buenos; hoy no se pueden pedir ni generar con voz | M |
| 9 | Topaz 1080p, descripciones y carpeta de entrega | 66, 67, 68 | Sin esto no hay entrega equivalente: los vídeos salen a 480p y sin su texto | M |
| 10 | Varias personas con su papel | 13, 14 | Los ganchos de tienda tienen 2–4 personas; hoy solo se sustituye una | M |
| 11 | Un frame por clip y captura por toma | 27, 6 | Conceptos de varias tomas generadas por separado | L |
| 12 | Elegir canción sola | 61 | El código se puede portar tal cual; ahorra una pregunta por vídeo | M |
| 13 | Wan 3.0 Prime con idioma del audio | 34, 38, 42 | 23 de 572 tarjetas | M |
| 14 | Revisión automática de imagen y de vídeo; auditoría del MP4 | 29, 48, 64 | Reduce rondas, no cambia el resultado aprobado | M |
| 15 | Correcciones añadidas, bloqueo de embalaje, cuenta atrás | 28, 8, 49 | Ajustes pequeños | S |
| 16 | Tipos de tarjeta que faltan, test de ganchos, cuerpo automático, catálogo de conceptos | 1, 2, 3, 53, 52, 69 | Amplían lo que se puede pedir | L |
| 17 | Lecciones y reglas que faltan | 70, 71 | Para que una corrección no se repita | M |
| 18 | Doblaje y segunda versión en otro idioma | 63, 65 | Uso ocasional | L |

## 4. Casos de igualdad

Tres tarjetas del pedido `app-8082c194d416445a9cd108923e243156-81` (18 vídeos entregados el 20/11/2026, el único pedido con entrega comprobada). Cada JSON trae la tarjeta tal como se guardó y se congeló, el envío real de la imagen (modelo, parámetros, adjuntos en orden con su papel, prompt exacto), el envío real del vídeo (modelo, segundos, adjuntos, prompt, respuesta del proveedor), el plan de textos, la descripción y la fila de entrega.

| Archivo | Qué prueba |
|---|---|
| `casos/pedido81-v01-motion-transfer.json` | Réplica con Motion Transfer, variante fresa, fondo subido con condición, POV sin cara |
| `casos/pedido81-v09-tienda-avatar.json` | Cambio de tienda a Sephora, persona visible con avatar por coincidencia, nota de cuenta |
| `casos/pedido81-v12-object-swap.json` | Object Swap, foto de funcionamiento, seis fondos, corrección r2 |

Cómo usarlos: crear en PRINCIPAL la misma tarjeta (mismo enlace, notas, variante y fotos) y comparar con el JSON lo que PRINCIPAL enviaría: modelo y parámetros, número y orden de adjuntos, y el prompt párrafo a párrafo. La imagen es igual cuando los párrafos fijos coinciden letra por letra y los propios dicen lo mismo.

Límites: los ID de los adjuntos son del espacio de trabajo antiguo y no sirven para reenviar; el volcado recorta a 1.500 caracteres algunos campos auxiliares (`cambios_fondo`, `reference_bindings`), pero el `prompt` está entero. Los dos ganchos de Seedance que el dueño aceptó de palabra son del pedido 54, que no llegó a entregarse; su prompt está en `docs/aprendizaje-encargos-antiguos.md` §3.4.

## 5. Lo que no se leyó

- Las imágenes y los vídeos: se comparan textos y recibos.
- `EDITOR/production_engine.py`, `submitted_order_context.py`, `submitted_video_context.py` y `lote_control.py` (7.000 líneas de puertas y recibos) solo por su índice de funciones y sus cadenas largas.
- Unos 650 de los 893 archivos Python de `EDITOR/`: pruebas (`test_*`) y guiones de pedidos o cuentas concretos.
- `order43_finish.py` y `order43_text06b.swift` (el dibujante de rótulos original): se conoce su uso por `edit-videos.py`; no se comparó línea a línea con `montador/texto06b.swift`.
- `BIBLIOTECA_PROMPTS.md` más allá de los nueve ganchos validados.
- El inventario de la selección de Pinterest y el contenido de `Motor/biblioteca-cuerpos`.
- Los pedidos 46, 11, 31 y 34 más allá de lo ya anotado; el prompt de borrado de textos sí se sacó del 46.
- Ningún `.env`, credencial, cookie ni token; no se llamó a Higgsfield.
