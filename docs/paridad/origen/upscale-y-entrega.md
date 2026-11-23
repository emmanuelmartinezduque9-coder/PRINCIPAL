Origen: /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/upscale.py; /Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/package-edits.py

# Upscale Topaz y empaquetado de la entrega

## Perfil de upscale (`upscale.py`)

```
CACHE = ROOT / 'NanoBanana' / '_UPSCALE'
ENV = dict(os.environ)
ENV['PATH'] = ':'.join([str(Path.home()/'.local/bin'), str(Path.home()/'.local/node/bin'), str(Path.home()/'.local/npm-global/bin'), ENV.get('PATH','')])
MODEL = 'topaz_video'
RESOLUTION = '1080p'  # Explicit human default; existing state keeps its resolution.
REQUESTED_RESOLUTION = '1080p'
RESOLUTIONS = {'1080p': 1080, '2160p': 2160}
UUID = re.compile(r'^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
GENJUTSU_MODELS = {'genjutsu', 'hf_mult_replace_object', 'hf_mult_motion_control'}
…
    # The target belongs to the job, not the day it gets resumed. Never spend again
    # or reinterpret an old 1080 delivery because a new target was requested.
    resolution = state.get('resolution', '1080p') if state else default_resolution()
    if resolution not in RESOLUTIONS:
        raise ValueError('Resolucion de upscale desconocida; no se genera ni se reetiqueta')
    return resolution

def quality_label(resolution):
    return '4K (2160p)' if resolution == '2160p' else resolution

def target_profile(state):
    # Existing paid/submitting jobs retain their backend and settings forever.
    if not state:
        return dict(model=MODEL, enhancement={'model':'thd-3','astra_params':None,'params':None},
                    frame_interpolation=None)
    model = state.get('model', 'topaz_video')
    if model == 'topaz_video':
        return {key:state[key] for key in ('model','enhancement','frame_interpolation') if key in state} | {'model':model}
    if model != 'bytedance_video_upscale':
        raise ValueError('Modelo de upscale desconocido; no se sustituye ni se cobra')
    profile = {key:state.get(key) for key in ('model','model_version','fps','preset')}
    if profile['model_version'] not in ('standard','pro') or profile['preset'] not in ('common','aigc','short_series','ugc','old_film') or not isinstance(profile['fps'], int) or profile['fps'] <= 0:
        raise ValueError('Configuracion ByteDance incompleta; no se adivinan parametros')
    return profile

def profile_label(state=None):
    profile = target_profile(state or {})
    resolution = target_resolution(state or {})
    if profile['model'] == 'topaz_video':
        return f'Topaz {quality_label(resolution)}'
    return f"ByteDance {profile['model_version'].title()} · {quality_label(resolution)} · {profile['fps']} fps · {profile['preset'].title()}"

def create_args(job, resolution, profile):
    if resolution not in RESOLUTIONS:
        raise ValueError('Topaz solo admite 1080p o 2160p; no enviar resolución inventada')
    args = ['higgsfield','generate','create',profile['model'],'--video',job]
    if profile['model'] == 'topaz_video':
        args += ['--resolution',resolution,'--aspect_ratio','auto']
        # Missing fields in legacy accepted state retain the legacy command.
        for key in ('enhancement','frame_interpolation'):
            if key in profile:
                args += ['--'+key, __import__('json').dumps(profile[key],separators=(',',':'))]
        return args + ['--json']
    return args + ['--resolution',{'2160p':'4k','1080p':'1080p'}[resolution],
                   '--model_version',profile['model_version'],'--fps',str(profile['fps']),
                   '--preset',profile['preset'],'--json']
```
## Empaquetado de la entrega (pedido 81)

Origen: `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/package-edits.py` (íntegro). Carpeta `videos editados/<fecha>/<pedido>/<Cuenta - DE>/` con `NN - <Cuenta> - DE.mp4` y `NN - Beschreibung - DE.txt`; se comprueba el hash de cada archivo y que el número de MP4 y de descripciones coincide con el de tarjetas.

```
from production_common import *
import datetime
Q=P/'post-edit';dest=Path('/Volumes/T7/AUTOMATIZACION SEGA/videos editados/2026-11-20')/O
labels={'EISWERK':'EisWerk','HAARZAUBER':'HaarZauber','FALTERPFOTE':'FalterPfote','HAARFEIN':'HaarFein'}
rows=[]
for n,r in enumerate(s['snapshot_data']['batch']['prepared'],1):
 rev=3 if n==14 else (2 if n in [6,12,16] else 1)
 f=Q/f'final-v{n}-r{rev}';rec=C.read(f/'receipt.json');src=f/'edited.mp4';h=C.sha(src)
 assert rec['sha256']==h and rec['position']==n and rec['item']==r['item']['id'] and rec['full_decode_ok'] is True
 desc=Q/'descriptions'/f'{n:02}-Beschreibung-DE.txt';assert desc.is_file() and desc.stat().st_size>10
 rows.append(dict(position=n,item=r['item']['id'],account=r['item']['account'],source=str(src),sha256=h,receipt=proof(f/'receipt.json'),description_source=str(desc),description_sha256=C.sha(desc),revision=rev))
assert len(rows)==18
stage=Q/'delivery-staging';stage.mkdir(exist_ok=True)
for r in rows:
 folder=stage/(labels[r['account']]+' - DE');folder.mkdir(exist_ok=True)
 for source,name,digest in [(r['source'],f"{r['position']:02} - {labels[r['account']]} - DE.mp4",r['sha256']),(r['description_source'],f"{r['position']:02} - Beschreibung - DE.txt",r['description_sha256'])]:
  target=folder/name
  if not target.exists():shutil.copyfile(source,target)
  assert C.sha(target)==digest
  r['delivery' if name.endswith('.mp4') else 'description_delivery']=str(dest/folder.name/name)
assert len([f for f in stage.rglob('*.mp4') if not f.name.startswith('._')])==18 and len([f for f in stage.rglob('*.txt') if not f.name.startswith('._')])==18
# The package includes every rendered edit. Review findings remain recorded separately,
# and no readiness flags or safety gates are overridden by a file copy.
if not dest.exists():
 dest.parent.mkdir(parents=True,exist_ok=True);stage.rename(dest)
else:
 for r in rows:
  assert C.sha(r['delivery'])==r['sha256'] and C.sha(r['description_delivery'])==r['description_sha256']
manifest=dict(order=O,snapshot_sha256=s['sha256'],count=18,all_edited_files_present=True,output_folder=str(dest),items=rows,human_listening=False,review_folder=str(Q/'independent-final'),quality_status='See current independent reviews; file packaging is not a claim of flawless generation or a substituted gate approval.')
C.durable(Q/'delivery-manifest.json',manifest)
pp=s['snapshot'].with_suffix('.progress.json');pr=C.read(pp);pr['rendered_delivery']=proof(Q/'delivery-manifest.json');pr['current_postproduction']['render_complete']=True;pr['current_postproduction']['delivery_count']=18
for pos in pr.get('positions',[]):
 rr=next((r for r in rows if r['item']==pos.get('item')),None)
 if rr:pos['rendered_edit_delivery']=dict(path=rr['delivery'],sha256=rr['sha256'],description=rr['description_delivery'],revision=rr['revision'])
C.durable(pp,pr)
print(dest)
```
