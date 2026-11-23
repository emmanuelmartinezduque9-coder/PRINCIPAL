Origen: /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/video_edit_policy.py, /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/video_audio_policy.py, /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/genjutsu.py, /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/genjutsu_cli.py

# Plantilla del prompt de vídeo: Wan 3.0 y Wan 3.0 Prime

## `video_edit_policy.short_wan_prompt` y `native`

```
def native(task):
    if 'no_initial_frame_policy' in task:
        import genjutsu_no_initial_frame as N, genjutsu as G
        N.validate(task,G)
        return True
    edit=task.get('video_edit') or {}
    return (task.get('genjutsu_model')=='wan3_0_prime' and edit.get('video_edit_mode')=='auto'
            and not edit.get('video_edit_reference_url'))

def short_wan_prompt(task):
    language=(task.get('video_edit') or {}).get('target_language') or {'GELATOVIVO':'it-IT','TARGETALARM':'en-US'}.get(str(task.get('cuenta')).upper(),'de-DE')
    language={'de':'German','de-DE':'German','it':'Italian','it-IT':'Italian','en':'English','en-US':'English'}.get(language,language)
    text=['Use the source video. Keep its actions, framing, cuts and visual effects.']
    no_avatar=task.get('avatar_selector')=='sin avatar'
    prime=task.get('genjutsu_model')=='wan3_0_prime'
    if prime and task.get('caras_humanas') is False and not no_avatar:
        raise ValueError('Prime POV sin caras: preparar sin avatar ni referencia de identidad antes de compilar')
    if not (prime and no_avatar):
        text.append('Preserve the original people, identities and faces.' if no_avatar else 'Replace the main person with the person in image [1].')
    for n,role in enumerate(task.get('en_pantalla') or [],1 if no_avatar else 2):
        label={'embalaje':'closed packaging','articulo':'product','articulo_en_mano':'product in hand'}.get(str(role).split(':')[0])
        if not label:raise ValueError('Referencia visible desconocida')
        text.append(f'Replace the {label} with image [{n}].')
    changes=task.get('wan_changes',task.get('cambios_fondo') or [])
    if not isinstance(changes,list) or any(not isinstance(x,str) for x in changes):raise ValueError('Cambios Wan: lista de frases sencillas')
    text.extend(changes)
    if prime and not changes:
        text.append('Refresh the decor of the same locations; keep the objects used in the action.')
    text.append(f'Translate the on-screen text into native {language}; keep its style, position and timing.' if native(task) else 'No text overlays or captions.')
    audio_instruction=video_audio_policy.instruction(task)
    text.append(audio_instruction if audio_instruction is not None else f'Keep sound and translate existing speech into native {language}.')
    return ' '.join(text)

def validate_prompt(task,prompt):
    video_audio_policy.validate(task,prompt)
    if 'no_initial_frame_policy' in task:
        import genjutsu_no_initial_frame as N, genjutsu as G
        N.validate(task,G,prompt=prompt)
        return
    if native(task):
        lower=prompt.lower()
        if 'no text overlays' in lower or 'no captions' in lower:raise ValueError('Edición Wan nativa contradice quitar los textos')
        if 'translat' not in lower and 'traduc' not in lower:raise ValueError('Falta adaptación del texto en el prompt Wan Prime')
```
## Frase de audio (`video_audio_policy.instruction`)

```
def instruction(task):
    policy = task.get('audio_language_plan')
    if task.get('genjutsu_model') != 'wan3_0_prime' or not policy:
        return None  # Historical jobs and other engines retain their original policy.
    mode = normalize(policy)['audio_language_mode']
    if policy.get('version') != 1 or policy.get('engine') != 'wan3_0_prime':
        raise ValueError('Política de idioma del audio desconocida')
    target = policy.get('target_language')
    if not isinstance(target, str) or not target:
        raise ValueError('Falta idioma de destino del audio')
    if mode == 'auto':
        evidence = task.get('source_audio_analysis') or {}
        source = task.get('video_fuente') or {}
        if (not source.get('sha256') or evidence.get('source_sha256') != source['sha256']
                or type(evidence.get('has_speech')) is not bool
                or not isinstance(evidence.get('observations'), str)
                or not evidence['observations'].strip()):
            raise ValueError('Automático: falta análisis del audio real vinculado al hash de la fuente')
        if not evidence['has_speech']:
            return 'Preserve the original non-speech audio. Do not add speech.'
        languages = evidence.get('languages')
        if not isinstance(languages, list) or not languages or any(not isinstance(x,str) or not x.strip() or x.lower() in ('unknown','und') for x in languages):
            raise ValueError('Automático: falta identificar el idioma hablado; no adivinarlo')
        mode = 'translate' if any(x.lower().split('-')[0] != target.lower().split('-')[0] for x in languages) else 'keep'
    if mode == 'keep':
        return 'Preserve the original spoken language and dialogue. Do not translate speech or add dialogue.'
    language = {'de':'German','it':'Italian','en':'English','es':'Spanish','fr':'French'}.get(target.lower().split('-')[0], target)
    return f'Translate existing dialogue into native {language}, preserving its meaning, tone and timing. Do not add dialogue.'
```
## Parámetros (`genjutsu.parametros`, tramo Wan) y argumentos de la CLI (`genjutsu_cli.arguments`)

```
def parametros(row):
    validar_lite_limits(row)
    video_edit_policy.validate_bound_task(row)
    video_edit_policy.validate_prompt(row,row['prompt'])
    if 'genjutsu_cast' in row:
        import genjutsu_cast, sys
        genjutsu_cast.validate(row, sys.modules[__name__], final_refs=row['refs'])
    if row.get('later_scene_avatar'):
        import genjutsu_later_avatar
        genjutsu_later_avatar.validate(row,row['prompt'],row['refs'])
    errors = validar_consumo(row)
    if errors:
        raise ValueError('; '.join(errors))
    params = {'model': modelo(row), 'prompt': row['prompt'], 'resolution': wan_resolution(row),
            'use_free_gens': row['use_free_gens'], 'count': 1,
            'medias': [{'role':'video','value':row['video_fuente']['media_id']}] +
                      [{'role':'image','value':mid} for mid in row['refs']]}
    if params['model'] in ('wan3_0','wan3_0_prime'):
        # Wan takes the approved frame as an image reference alongside the source
        # video. Its API forbids start_image/end_image with reference media.
        duration = wan_requested_duration(row)
        initial = row.get('approved_initial_frame') or {}
        if modelo(row)=='wan3_0_prime' and not initial:
            validate_prime_video_reference(row)
        elif not initial.get('media_id') or initial['media_id'] not in row['refs']:
            raise ValueError('Wan replication requires the approved initial frame in image references')
        params.update(duration=int(duration), aspect_ratio='auto', generate_audio=True, enable_thinking=False)
    if not row['use_free_gens']:
        # Nombre canónico del conector vigente, además del campo histórico auditado.
        params['use_unlim'] = False
    return params

def arguments(data, refs):
    p = data['params']
    if p['use_free_gens'] or p.get('use_unlim') is not False:
        raise ValueError('CLI adapter only supports explicitly authorized credit mode')
    images = [x['new_id'] for x in refs if x['role'] == 'image']
    videos = [x['new_id'] for x in refs if x['role'] == 'video']
    args = [p['model'], '--prompt', p['prompt'], '--resolution', p['resolution']]
    if p['model'] in ('wan3_0','wan3_0_prime'):
        if len(videos) != 1 or not images:
            raise ValueError('Wan replication requires one source video and approved image references')
        for key in ('duration', 'aspect_ratio', 'generate_audio', 'enable_thinking'):
            value = p[key]
            args += ['--' + key, str(value).lower() if isinstance(value, bool) else str(value)]
    for mid in images:
        args += ['--image-references', mid]
    for mid in videos:
        args += ['--video-references', mid]
    return args + ['--json']
```
