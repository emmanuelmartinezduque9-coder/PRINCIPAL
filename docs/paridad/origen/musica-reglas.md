Origen: ~/Library/Application Support/SEGATOM/code-packages/test-hook-selection-20261102/app/EDITOR/reference_music_match.py; /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/music_auto_policy.py, music_mix_contract.py, music_drop_sync.py, edicion_politicas.py, video_edit_policy.py

# Reglas de música

## Emparejar el audio de la referencia con la biblioteca (`reference_music_match.py`, versión `spectral-library-match-v1`)

Módulo íntegro (128 líneas, sin dependencias de red; requiere numpy y ffmpeg). Umbrales: aceptar solo si puntuación ≥ 0,92 y margen ≥ 0,06 sobre el segundo; si no, `pending_review`. Si alguna canción de la biblioteca no se pudo leer, nunca se selecciona.

```
"""Offline spectral matching of a reference excerpt to the supplied local library.

No downloads, uploads, providers or inference based on song titles. Run outside
the panel server. Conservative acoustic proposal, NOT independent listening.
Requires numpy and ffmpeg; no automatic dependency installation.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import numpy as np

RATE=8000
HOP=256
VERSION='spectral-library-match-v1'

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()

def decode(path, seconds):
    ffmpeg=shutil.which('ffmpeg') or str(Path.home()/'.local/bin/ffmpeg')
    p=Path(path).resolve(strict=True)
    if not p.is_file():raise ValueError('Expected local media file')
    result=subprocess.run([ffmpeg,'-nostdin','-v','error','-i',str(p),'-t',str(seconds),
        '-map','0:a:0','-ac','1','-ar',str(RATE),'-f','f32le','pipe:1'],
        capture_output=True,timeout=90,check=True)
    return np.frombuffer(result.stdout,dtype='<f4').copy()

def features(samples):
    if len(samples)<RATE*3 or not np.all(np.isfinite(samples)):
        raise ValueError('Need at least 3 seconds of finite audio')
    if np.sqrt(np.mean(samples*samples))<1e-5:raise ValueError('Silent audio')
    frames=np.lib.stride_tricks.sliding_window_view(samples,1024)[::HOP]
    bins=np.unique(np.geomspace(5,500,65).astype(int))
    chunks=[]
    for start in range(0,len(frames),512):
        spec=np.abs(np.fft.rfft(frames[start:start+512]*np.hanning(1024),axis=1))
        chunks.append(np.stack([spec[:,a:b].mean(axis=1) for a,b in zip(bins[:-1],bins[1:])],axis=1).astype(np.float32))
    bands=np.concatenate(chunks)
    bands=np.log1p(bands*100)
    # Per-frame spectral shape removes volume changes. Reject stationary shapes
    # (tones/steady noise) because similar bins alone do not identify a song.
    bands-=bands.mean(axis=1,keepdims=True)
    bands/=np.maximum(np.linalg.norm(bands,axis=1,keepdims=True),1e-8)
    if float(np.mean(np.std(bands,axis=0)))<.015:
        raise ValueError('Audio is too stationary for reliable musical identification')
    return bands.astype(np.float32)

def alignment(reference, song):
    m=len(reference);n=len(song)
    if n<m:return None
    size=1<<(n+m-1).bit_length()
    sums=np.zeros(n-m+1)
    for band in range(reference.shape[1]):
        conv=np.fft.irfft(np.fft.rfft(song[:,band],size)*
                         np.fft.rfft(reference[::-1,band],size),size)
        sums+=conv[m-1:n]
    sums/=m
    index=int(np.argmax(sums))
    return {'score':float(sums[index]),'song_start':round(index*HOP/RATE,3)}

def match(reference, songs):
    ranked=[]
    # Multiple excerpts tolerate a talking intro. Offset is retained separately
    # so a later music start cannot be falsely presented as time zero.
    windows=[]
    width=min(len(reference),round(8*RATE/HOP))
    for start in sorted(set([0,max(0,(len(reference)-width)//2),max(0,len(reference)-width)])):
        windows.append((start,reference[start:start+width]))
    for ident,feat in songs:
        choices=[]
        for start,window in windows:
            result=alignment(window,feat)
            if result:choices.append({**result,'reference_start':round(start*HOP/RATE,3)})
        if choices:ranked.append({'number':ident,**max(choices,key=lambda r:r['score'])})
    return choose(ranked)

def choose(ranked):
    ranked.sort(key=lambda r:r['score'],reverse=True)
    best=ranked[0] if ranked else None
    margin=best['score']-ranked[1]['score'] if len(ranked)>1 else 1
    # Deliberately leave uncertain evidence for the responsible editor.
    accepted=bool(best and best['score']>=.92 and margin>=.06)
    return {'status':'acoustic_candidate' if accepted else 'pending_review',
            'selection':best if accepted else None,'candidates':ranked[:5],
            'margin':margin,'independent_review_required':True}

def run(reference, library):
    source=Path(reference).resolve(strict=True);before=sha(source)
    ref=features(decode(source,60));ranked=[];evidence=[];errors=[]
    seen=set()
    for song in library['songs']:
        ident=song['number']
        if type(ident) is not int or ident<1 or ident in seen:raise ValueError('Invalid/duplicate song number')
        seen.add(ident)
        try:
            p=Path(song['path']).resolve(strict=True);digest=sha(p)
            if digest!=song['sha256']:raise ValueError('Song hash mismatch')
            feat=features(decode(p,3600))
            if sha(p)!=digest:raise ValueError('Song changed while decoding')
            ranked.extend(match(ref,[(ident,feat)])['candidates'])
            evidence.append({'number':ident,'path':str(p),'sha256':digest})
            del feat
        except (OSError,ValueError,subprocess.SubprocessError) as exc:
            errors.append({'number':ident,'error':str(exc)[:200]})
    if sha(source)!=before:raise ValueError('Reference changed while decoding')
    result=choose(ranked)
    # Do not select a candidate when part of the supplied library was unreadable.
    if errors:result.update(status='pending_review',selection=None)
    return {'version':VERSION,'source':str(source),'source_sha256':before,
            'library':evidence,'errors':errors,**result,
            'limitation':'No tempo/pitch correction; noisy or changed versions may remain pending. '
                         'Acoustic similarity does not certify the final edit or beat alignment.'}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference',required=True,type=Path)
    parser.add_argument('--library',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    result=run(args.reference,json.loads(args.library.read_text()))
    with args.output.open('x') as f:json.dump(result,f,indent=2,ensure_ascii=False)
    print(json.dumps({'status':result['status'],'selection':result['selection'],'receipt':str(args.output)}))
```
## Plan de música automática por tarjeta (`music_auto_policy.plan`)

```
def plan(item, edit_plan=None):
    if item.get('music_mode')!='reference_auto':return None
    edit_plan=edit_plan or {}
    import genjutsu_audio_policy as G
    if G.is_full(edit_plan):
        return dict(version=VERSION,mode='generated_original',library_only=False,receipt_required=False,
                    external_music=False,drop_required=False,generated_audio_review_required=True)
    return {'version':VERSION,'mode':'reference_auto','library_only':True,
            'reference_url':(edit_plan.get('reference') or {}).get('url') or item.get('video_edit_reference_url') or item.get('url') or '',
            'reference_policy':'explicit_edit_reference_else_generation_source',
            'resolve_after_source_analysis':True,'overwrite_manual_selection':False,
            'ambiguous_policy':'pending_review_no_random_fallback',
            'receipt_required':True,'independent_audio_review_required':True}
```
## Contrato de mezcla R2 (`music_mix_contract.contract`, versión `selected-song-continuous-r2-v1`)

```
def contract(song):
 return dict(version=VERSION,song_sha256=(song or {}).get('sha256'),marker=(song or {}).get('drop_marker'),continuous=True,ducking=False,original_music_allowed=False,preserve_speech=True,source_audio_scope="first_hook_spoken_only",body_audio_allowed=False,ambient_audio_allowed=False)
```
## Volumen de la música según haya voz (`edicion_politicas.music_volume`)

```
def music_volume(edit, inputs=()):
    """A sound track is not proof of a speaking person. Missing = full music.

    Speech metadata is an explicit production/review decision, not an audio
    classifier. No claim is made that this function listens to or detects speech.
    """
    voice=edit.get('speech_present')
    if voice is not None and type(voice) is not bool:
        raise ValueError('speech_present debe ser booleano o desconocido')
    if voice is None:voice=any(i.get('speech_present') is True for i in inputs)
    return '20%' if voice and edit.get('keep_clip_audio',True) else '100%'
```
## Marcas de drop por canción (`music_drop_sync.py`, cabecera)

```
"""Song-bound drop marks. Never detect a musical drop from loudness alone."""
def valid_time(v):
 if type(v) not in (int,float) or not math.isfinite(v) or v<0:raise ValueError('Tiempo de drop no válido')
 return v

def resolve(marker,song_sha256,body_frame,fps,duration,song_duration):
 if marker.get('song_sha256')!=song_sha256:raise ValueError('No se puede sustituir la canción seleccionada')
 if type(body_frame) is not int or body_frame<0 or type(fps) not in (int,float) or not math.isfinite(fps) or fps<=0:raise ValueError('Corte de cuerpo no válido')
 drop=valid_time(marker['seconds']);valid_time(duration);valid_time(song_duration)
 cut=body_frame/fps
 if cut>=duration or drop>=song_duration:raise ValueError('Drop o cuerpo fuera del medio')
 offset=drop-cut
 if offset<0:raise ValueError('No hay suficiente canción antes del drop: revisar gancho o marcador; nunca retrasar ni cambiar canción')
 if offset+duration>song_duration+1e-8:raise ValueError('La canción no cubre el montaje continuo')
 return dict(offset=offset,delay=0,impact=drop,cut=cut,song_sha256=song_sha256,continuous=True)
```
## Requisitos editoriales congelados en el plan (de `video_edit_policy.plan`)

```
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
```

Las reglas en prosa (música continua R2, drop a la función del producto, voz) ya están copiadas en `docs/reglas-origen/memory-context/ritmo-musica-voz-edicion.md`, `…/correccion-funcion-drop-ganchos-20261115.md` y `docs/reglas-origen/reglas-edicion-t7/CRITERIOS_OBLIGATORIOS.md`.
