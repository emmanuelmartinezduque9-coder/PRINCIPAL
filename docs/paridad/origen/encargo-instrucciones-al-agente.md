Origen: /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/lote_app.py (submit), video_edit_policy.py, video_resolution.py, video_audio_policy.py, music_auto_policy.py

# Texto fijo del encargo que la app entregaba al agente (Codex) al enviar un lote

El envío congela `batch.prepared` en un JSON (`_LOTES_APP/owners/<dueño>/orders/app-<id>-<rev>.json`), lo inscribe en `production_engine` y despierta al agente con este texto seguido del JSON de las tarjetas preparadas.

## Cabecera y condicionales (`lote_app.submit`)

```
Encargo de producción enviado por Emmanuel en la app; autoriza el gasto normal del lote sin permisos repetidos. Mostrar el plan y seguir las puertas de generación y aprobación visual de frames. Respetar rondas completas y prompts literales. Si hay frame_requests, son capturas de REFERENCIA por clip: seguir clip_execution_plan, NO reutilizar el frame antiguo de ese clip ni usar la captura como start_image. Crear el nuevo frame por EDITOR/frame.py y esperar aprobación en la ronda global. No modificar los otros clips ni el concepto original.

```


```

Wan 3.0 seleccionado: usar motor=genjutsu como familia interna y genjutsu_model=wan3_0 como modelo real. Vídeo fuente en video_references y frame aprobado en image_references; nunca start_image/end_image junto al vídeo. Duración entera explícita de 4–30 segundos, sin relleno ni recorte automático. Conservar aprobaciones, recibos, cuenta y deduplicación normales.
```


```

Wan 3.0 Prime seleccionado: conservar genjutsu_model=wan3_0_prime y resolution=720p por defecto (o resolución explícita guardada). Familia interna genjutsu, vídeo fuente en video_references y frame aprobado en image_references. No sustituir por Wan 3.0 ni cambiar referencias, aprobaciones o deduplicación.
```


```
 En regeneración con regeneration_engine_policy=saved_per_clip o adaptación con adaptation_engine_policy=saved_per_clip, usar el motor y configuración de CADA clip de concept_snapshot, incluido video_fuente y genjutsu_model del clip si es Genjutsu. item.method=auto significa HEREDAR, no elegir otro motor. En adaptación conservar estructura y acciones y adaptar producto, avatar e idioma a la cuenta destino; no tratarla como regeneración literal ni editar el concepto fuente. Solo en otras rutas con item.method=genjutsu, usar genjutsu_model y genjutsu_references_snapshot del item como referencias de edición de vídeo, no como Frames aprobados. En otros métodos, genjutsu_model y genjutsu_references del item son controles inactivos conservados del borrador: NO usarlos en generación.

```
## Edición posterior obligatoria (`video_edit_policy.instructions()`)

```
EDICIÓN POSTERIOR OBLIGATORIA para nuevos borradores mandatory-post-v1: ejecutar video_edit_plan con Codex, incluidos regenerados. Edición posterior: TikTokDisplay-Medium06B blanco, borde exterior negro0.05em, interlínea35/31, recuadro1080x1920 x112/y287/ancho886/alto318. Adaptar significado y emojis al producto, público y nicho destino; no copiar emojis ajenos de la fuente. CTA con marca propia. Solo ganchos regalo pop y caída de café: máximo 3 segundos; cuenta atrás 1, 2, 3: máximo 6 segundos. No hay límite general. Réplicas conservan secuencia, visuales, cortes, ritmo y duración de referencia; nunca recortar cuerpos por estos límites. Adaptar el inicio musical al drop sin prolongar el gancho. El campo text_style prevalece sobre copiar la tipografía fuente. Wan nativo no garantiza fuente exacta. No desactivar ni usar edición nativa en nuevos borradores. Solo los snapshots históricos sin esta política conservan su selección congelada; no reinterpretarlos ni reejecutarlos. Resolver la referencia real usada en generación (video_fuente del clip guardado en regeneraciones) o el enlace de edición explícito, sin cambiar la fuente de generación. Analizar directamente textos, estilo, posiciones, tiempos, cortes y efectos; guardar evidencia y hashes. No usar Memories. Ruta wan_prompt solo con wan3_0_prime: adaptar textos al idioma de destino dentro de un prompt corto de cambios concretos, conservar edición visual; no pedir quitar todos los textos. Copiar video_edit_plan a task.video_edit antes de compilar. Ruta codex_post para todos los demás motores o selección posterior: generar sin overlays y editar después con Codex usando el generado y la referencia. Recuperar la canción del item original y su archivo/hash; conservar voz clara sincronizada, retirar música residual del cuerpo cuando hay canción seleccionada. Alinear el acento musical con el corte/producto observado en la referencia, tolerancia un frame; no copiar su audio mezclado. Usar edit_audio_integrity: voz clara normalizada sin saturar, preroll15-150ms sin cortar fonemas; Usar music_mix_contract R2: canción exacta continua desde frame0, drop guardado al cuerpo real, sin ducking automático. En gancho con cuerpo eliminar todo audio original del cuerpo y conservar solo habla separada del primer clip, sin música ni canto residual; exigir revisión auditiva independiente. Réplica Genjutsu completa sin cuerpo conserva solo su audio generado y no mezcla canción externa. Registrar final de voz separado del acento musical, fuentes/hashes, revisión independiente y recibo sobre el render final. Recortar espera antes de hablar sin cortar palabras. En cuenta atrás identificada, máximo1s de cajas tras el revelado revisado, sin freeze ni relleno; exigir control countdown_reveal_policy y cut_integrity. No repetir cortes/efectos ya presentes. No alargar el vídeo para textos ni regenerar para editar. Guardar receta y exportación aparte, verificar visualmente y por decodificación; no declarar completado sin salida editada verificada. En regeneración, la opción de edición autoriza adaptar solamente el prompt de edición nativa, no sustituir referencias, identidades o controles. Si cambia el prompt por edición nativa, usar la ruta normal de corrección con revisión del prompt, no la ruta de regeneración literal ni sus excepciones históricas. Prompts Wan 3.0/Prime: frases breves y directas, no bloques detallados de otros modelos. Prime: describir solo cambios, no reconstruir el vídeo. Variar el diseño de los mismos escenarios, conservando objetos necesarios para la acción, incluida la nevera cuando se usa; no imponer una habitación global ni inventar mobiliario, luces y colores. Analizar caras reales: en POV solo manos, omitir avatar, referencias de identidad y cualquier instrucción de cambiar personas. No heredar un avatar de la tarjeta. Conservar assets de producto visibles. Usar traducción final literal revisada, posición y tiempos revisados; en edición posterior usar06B y el recuadro vigente. Leer memory/context/wan-prime-cambios-minimos.md. No modificar trabajos aceptados. VERSIONES ADICIONALES: solo si video_edit_plan.additional_deliverables las solicita, crear una entrega adicional de textos en francés desde el MISMO máster de edición verificado antes de renderizar textos. Conservar la entrega y target_language originales. Reutilizar exactamente cortes, tiempos, efectos y audio del original; no doblar voces, no generar frames ni regenerar clips. No traducir sobre los textos alemanes ya quemados: si falta el máster/capas sin textos, dejar pendiente, sin regenerar ni sobrescribir. Guardar archivo/recibo propios por deliverable_id; vincular hashes del máster, plan visual y audio. Registrar en la fila de progreso row.delivery_variants["fr-FR"] con la misma estructura de recibo que la entrega primaria y language="fr-FR"; guardar revisión independiente vinculada al hash final en final_edit_variant_reviews[item]["fr-FR"], también language="fr-FR". No reemplazar receipt/review primarios ni acreditar el francés con la revisión alemana. Mantener pending_language_and_market_review y france_ready=false hasta revisar texto, voz observada y tienda/afirmaciones del mercado. Voz alemana o tienda/afirmación sin resolver impiden declarar listo para Francia. Esta opción solo traduce textos; no selecciona ni activa versiones de trabajos históricos. Contrato de revisión adicional: el recibo incluye language, deliverable_id, position, editor e independent_final_review={path,sha256}. Ese JSON independiente incluye verified=true, independent=true, reviewer distinto del editor, blocking_findings=[], order, item, position, language="fr-FR", output_sha256 y primary_output_sha256; text_language_verified=true, same_visual_edit_verified=true, same_audio_verified=true. Registrar voice_language_observed, shop_claims_status (resolved/unresolved), france_ready booleano y market_readiness_status (reviewed si France-ready; pending_market_review si no). Voz alemana conservada: localization_warning no vacío y france_ready=false; esto NO bloquea entrega ni revisión completa de textos, no exige doblaje ni autorización adicional.
```
## Calidad de generación (`video_resolution.instructions()`)

```
CALIDAD DE GENERACIÓN: conservar generation_resolution y generation_resolution_plan por posición. Copiar la selección explícita a cada task antes de compilar; aplica a todos sus clips seleccionados, también regeneraciones y adaptaciones. Automática conserva la política del motor. No confundir con upscale ni sustituir silenciosamente una resolución no admitida. No modificar trabajos ya enviados.
```
## Idioma del audio (`video_audio_policy.instructions()`)

```
IDIOMA DEL AUDIO (independiente del texto): copiar audio_language_plan a cada task. Solo se aplica a Wan 3.0 Prime; no cambiar otros motores. En auto, analizar directamente el audio de la fuente seleccionada antes de compilar, sin Memories. Guardar source_audio_analysis con source_sha256, has_speech booleano, languages (códigos BCP47 de todas las lenguas habladas) y observations reales. Si no hay habla no añadirla; si ya habla el idioma destino conservarlo; si habla otro traducir. No inventar idioma cuando no se pueda escuchar. translate solicita traducir solo el diálogo existente; keep conserva idioma y diálogo. Prompt breve, sin modificar selección de textos ni música. Después escuchar el resultado y verificar significado, idioma y sincronización; registrar límites y no afirmar validación solo porque el prompt lo pide.
```
## Música automática (`music_auto_policy.instructions()`)

```
MÚSICA AUTOMÁTICA: para music_auto_plan usar la fuente REAL de edición (enlace opcional de edición si existe; si no, fuente de generación). Comparar su audio con los MP3 de la biblioteca mediante reference_music_match.py, con manifiesto local {songs:[{number,path,sha256}]} obtenido de music_library. Ejecutar con /usr/bin/python3 fuera del servidor web: --reference FUENTE --library MANIFIESTO --output RECIBO_NUEVO. Una coincidencia acústica propone número/inicio; no acredita ritmo, escucha ni revisión final. Con voces fuertes, versiones aceleradas, coincidencias ambiguas o ausencia de audio: pendiente de análisis real, nunca canción aleatoria ni copiar audio mezclado de la referencia. Guardar selección y hashes en progress.music_auto_reviews[item] y vincular audio_plan al MP3 seleccionado. Exigir revisión independiente de canción, fragmento, alineación de acento/corte y voz/rampa sobre el final.
```
## Plan de edición que se congela por tarjeta (`video_edit_policy.plan`, literal)

```
def plan(item,prepared,language):
    options=normalize(item)
    if options['video_edit_mode']=='none':return None
    explicit=options['video_edit_reference_url']
    # Hook URL is independent of the saved body/concept and item.url.
    hook=item.get('hook_test') or {}
    hook_url=next((v.get('reference_url') for v in hook.get('variants',[])
                   if v.get('hook_id')=='reference_url'),'') if hook.get('generation_mode')=='hooks_only' else ''
    existing=item.get('kind') in ('regenerate','adapt')
    clips=prepared.get('concept_snapshot',{}).get('clips',[]) if existing else []
    rows=clips or [{'clip':1,'genjutsu_model':item.get('genjutsu_model') if item.get('method')=='genjutsu' else None}]
    result={'version':1,**options,**countdown_policy(item,prepared),'target_language':language,
        'audio_integrity_policy':'20261022-progressive-music-v1',
        'reference':{'kind':'explicit_url' if explicit else 'generation_source',
                     'url':explicit or hook_url or item.get('url') or '',
                     'verification':'resolve_and_verify_real_source_before_editing'},
        'text_style':{'preset':'06B','font':'TikTokDisplay-Medium','font_file':'TikTok-Display-Medium.ttf','fill':'#ffffff','outline':'#000000','outline_width_ratio':0.05,'line_height_ratio':35/31,'box':{'x':112,'y':287,'width':886,'height':318,'canvas_width':1080,'canvas_height':1920},'alignment':'center','exact_render':'codex_post'},
        'components':COMPONENTS.copy(),'copy_music':False,'audio':'preserve_generated',
        'clips':[{'clip':r.get('clip',n),'model':r.get('genjutsu_model') or r.get('motor') or 'resolve_from_plan',
                  'route':'codex_post' if explicit else route(options['video_edit_mode'],r.get('genjutsu_model'))}
                 for n,r in enumerate(rows,1)],
        'delivery':'separate_verified_edit_keep_original',
        'status':'pending_source_analysis'}
    import music_mix_contract
    import genjutsu_audio_policy
    generated_audio=genjutsu_audio_policy.contract(item,prepared)
    result['editorial_requirements']={
        'version':'emmanuel-20261115-concept-scoped', 'hook_max_seconds':None,
        'hook_limits_by_concept':{'gift_pop':3,'coffee_drop':3,'countdown_1_2_3':6},
        'hook_limits_scope':'identified_hook_only_never_body',
        'replica_timing':'preserve_reference_sequence_visuals_cuts_rhythm_and_duration',
        'music_offset_rule':'saved_drop_minus_observed_body_start',
        'extend_hook_to_fit_music':False,
        'emoji_source':'destination_product_and_niche',
        'product_function_review_required':True,
    }
    if item.get('account')=='RADBLINK':
        result['editorial_requirements']['product_function']='Active turn signal, visible directional projection on pavement and corresponding bicycle turn; dusk/night visibility.'
    if generated_audio:
        result['generated_audio_contract']=generated_audio
        result['audio']='preserve_generated_complete'
        result['effective_music_mode']='generated_original'
        result.pop('music_alignment',None)
    else:
        result['music_mix_contract']=music_mix_contract.contract(prepared.get('music_snapshot'))
    import post_edit_text_policy
    result['text_intent']=post_edit_text_policy.intent(item)
    if result['text_intent']['mode']=='none':result['components'].remove('texts')
    variants=additional_deliverables(item,result)
    if variants:result['additional_deliverables']=variants
    return result
```
