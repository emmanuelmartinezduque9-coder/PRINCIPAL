Origen: /Users/emmanuelmartinezduque/Desktop/AUTOMATIZACION IA VIDEOS/EDITOR/video_edit_policy.py, closing_cta_defaults.json, edicion_politicas.py, post_edit_text_policy.py; /Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/prepare-edit-plan.py, edit-videos.py y post-edit/descriptions/

# Reglas de textos en edición (estilo 06B)

## Estilo congelado en cada plan de edición (`video_edit_policy.plan`)

```
'text_style':{'preset':'06B','font':'TikTokDisplay-Medium','font_file':'TikTok-Display-Medium.ttf','fill':'#ffffff','outline':'#000000','outline_width_ratio':0.05,'line_height_ratio':35/31,'box':{'x':112,'y':287,'width':886,'height':318,'canvas_width':1080,'canvas_height':1920},'alignment':'center','exact_render':'codex_post'}
```
## CTA de cierre por cuenta (`closing_cta_defaults.json`, íntegro)

```
{
  "version": "2026-10-03-uniform-closing-cta-v1",
  "source_message_id": "Sentinel_7e2712d396108191bb150fe655592fbd",
  "scope": "new future project requests and pending EisWerk four-video delivery; no historical migration",
  "accounts": {
    "EISWERK": {"name":"EisWerk","emojis":"🍨💖🎄🔗"},
    "NAGELKLAR": {"name":"NagelKlar","emojis":"💅✨💖🔗"},
    "NAILUNA": {"name":"Nailuna","emojis":"💅✨💖🔗"},
    "GELATOVIVO": {"name":"Gelatovivo","emojis":"🍨💖🎄🔗"},
    "EISMEISTER": {"name":"EisMeister","emojis":"🍨💖🎄🔗"},
    "EISZWILLING": {"name":"EisZwilling","emojis":"🍨💖🎄🔗"},
    "DISCOMAGIA": {"name":"Discomagia","emojis":"🎶💖✨🔗"},
    "PLATTENZAUBER": {"name":"PlattenZauber","emojis":"🎶💖🎄🔗"},
    "HERZPFOTE": {"name":"HerzPfote","emojis":"🐶💖🧸🔗"},
    "ZIELALARM": {"name":"ZielAlarm","emojis":"⏰🎯✨🔗"},
    "TARGETALARM": {"name":"TargetAlarm","emojis":"⏰🎯✨🔗"},
    "FLAUSCHNEST": {"name":"FlauschNest","emojis":"🐶💖🧥🔗"},
    "RUFZEIT": {"name":"RufZeit","emojis":"☎️💖✨🔗"},
    "RENTIERGLANZ": {"name":"RentierGlanz","emojis":"🦌✨🎄🔗"},
    "NIKOLAUSLICHT": {"name":"NikolausLicht","emojis":"🎅✨🎄🔗"},
    "ZWEIGGLANZ": {"name":"ZweigGlanz","emojis":"🌿✨🎄🔗"},
    "KUSCHELGRINCH": {"name":"KuschelGrinch","emojis":"🧸💚🎄🔗"},
    "WEIHNACHTSPFOTE": {"name":"WeihnachtsPfote","emojis":"🐾💖🎄🔗"},
    "KAFFEEBILD": {"name":"KaffeeBild","emojis":"☕💖✨🔗"},
    "WAERMENEST": {"name":"WärmeNest","emojis":"🧣💖✨🔗"},
    "BRAUFORM": {"name":"BrauForm","emojis":"💄💖✨🔗"},
    "HAARFEIN": {"name":"HaarFein","emojis":"💇💖✨🔗"},
    "GLASLIEBE": {"name":"GlasLiebe","emojis":"🥤💖✨🔗"},
    "LICHTERFREUDE": {"name":"LichterFreude","emojis":"✨💖🎄🔗"}
  }
}
```
## Nombre de marca en el CTA y separación de rótulos consecutivos (`edicion_politicas.py`)

```
ACCOUNT_NAMES={
    'WEIHNACHTSPFOTE':'WeihnachtsPfote',
    'ZWEIGGLANZ':'ZweigGlanz',
    'KUSCHELGRINCH':'KuschelGrinch',
    'EISWERK':'Eiswerk','EISZWILLING':'EisZwilling','ZIELALARM':'ZielAlarm',
    'RUFZEIT':'RufZeit','RENTIERGLANZ':'RentierGlanz','NIKOLAUSLICHT':'NikolausLicht','NAILUNA':'Nailuna',
    'GELATOVIVO':'Gelatovivo','FLAUSCHNEST':'FlauschNest','KUSCHELSCHLAG':'KuschelSchlag',
    'TARGETALARM':'TargetAlarm',
}
COMMENT_TRIGGER=re.compile(r'(\b(?:kommentier(?:e|t)?|comment(?:a|ate)?|escribe|comenta)\s+)([„“"«\'‘])([^\n„“”"«»\'‘’]{1,80})([“”"»\'’])',re.I)

def account_cta(text, account):
    name=ACCOUNT_NAMES.get(account)
    if not name:return text
    return COMMENT_TRIGGER.sub(lambda m:m[1]+m[2]+name+m[4],text)

def separate_text_boundaries(source):
    """Keep consecutive text layers off a shared raster frame, not off the cut.

    Move ONLY the previous layer's end halfway between the last old and first
    new frame. No video trims or durations change, and no visible frame is blank.
    """
    fps=float(source.get('frame_rate',24))
    texts=[e for e in source.get('elements',[]) if e.get('type')=='text']
    for current in texts:
        start=float(current.get('time',0));end=start+float(current.get('duration',0))
        for following in texts:
            cut=float(following.get('time',0))
            if following is current or cut<=start or abs(end-cut)>.0001:continue
            # Separate screens only, not independently positioned simultaneous overlays.
            if current.get('y')!=following.get('y'):continue
            first_new_frame=round(cut*fps)
            last_boundary=(first_new_frame-.5)/fps
            if last_boundary>start:current['duration']=last_boundary-start
    return source
```
## Intención de textos (`post_edit_text_policy.intent`)

```
def intent(item):
 selected=item.get('post_edit_text_mode')
 if selected is not None and selected not in ('none','reference'):raise ValueError('Invalid explicit post-edit text mode')
 ref=item.get('video_edit_reference_url') or ''
 # Generation text_mode is independent from final editorial captions.
 return dict(version=VERSION,mode='reference',origin='mandatory_editorial_texts_20261031',reference_url=ref)
```
## Textos reales del pedido 81 (18 vídeos entregados) y cómo se asignan a los tramos de texto de la referencia

Origen: `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/prepare-edit-plan.py` (íntegro). Cada bloque de texto de la referencia (`cue-boundaries.json`, revisado) recibe un texto alemán adaptado; el último rótulo se alarga hasta el final.

```
from production_common import *
TEXT={
1:[['Das süßeste','Weihnachtsgeschenk! 🍦🎁😍'],['Kommentiere „EisWerk“,','wenn du sie brauchst! 🎄🍦']],
2:[['Weihnachts-Mädels,','RENNT zu ALDI! 😱🍦🇩🇪'],['Nur Spaß, wir verkaufen sie! 😂😍','Kommentiere „EisWerk“, wenn','du auch eine willst! 🎁👇']],
3:[['Das süßeste Geschenk unter','dem Weihnachtsbaum 👀🎄'],['Kommentiere „EisWerk“,','wenn du eine brauchst! 💕😋']],
4:[['Zeig das deiner Eisliebhaberin','bloß nicht vor Weihnachten … 😳🍦'],['Kommentiere „EisWerk“,','wenn du eine brauchst 🍦']],
5:[['Ich hab’s meiner Freundin zu','Weihnachten geschenkt – seitdem','macht sie ständig Eis! 🎄🍦'],['Link in der Bio']],
6:[['Nicht ansehen, wenn deine Haare','seit den Wechseljahren','widerspenstig sind! 👀'],['Eine kabellose, tragbare','Mini-Stylingbürste ✨'],['Kommentiere „HaarZauber“,','wenn du sie möchtest! 💕👇']],
7:[['Als vielbeschäftigte Mama wurde ich','zu einer HaarZauber-Vorführung','eingeladen. ✨🔥'],['Was meint ihr? 🤔 Ich war begeistert 😍','und habe sie gekauft!'],['Kommentiere „HaarZauber“,','um deine zu bekommen 🛍️💬👇']],
8:[['Als vielbeschäftigte Mama wurde ich','zu einer HaarZauber-Vorführung','eingeladen. ✨🔥'],['Was meint ihr? 🤔 Ich war begeistert 😍','und habe sie gekauft!'],['Kommentiere „HaarZauber“,','um deine zu bekommen 🛍️💬👇']],
9:[['Locken-Girlies,','RENNT zu Sephora! 🤯✨'],['Nur Spaß, wir verkaufen','sie selbst! 😂💕'],['Kommentiere „HaarZauber“','für mehr Infos! 😍✨']],
10:[['Als vielbeschäftigte Mama wurde ich','zu einer HaarZauber-Vorführung','eingeladen.'],['Was meint ihr?','Ich habe sie gekauft!'],['Kommentiere „HaarZauber“,','um deine zu bekommen 🛍️💬👇']],
11:[['„Schatz, hör auf, dem Hund','so einen Scheiß zu kaufen“','Ich:']],
12:[['Das Problem … 😰🚫'],['Vs. … 🤭'],['FalterPfote 😍💕']],
13:[['Schick das jemandem mit','einem kleinen Hund … 🤭💕']],
14:[['FalterPfote 🐾👀','×','McDonald’s'],['Kommentiere „FalterPfote“,','wenn du eins möchtest 🐾💕']],
15:[['Zeig das einer haarbegeisterten Mama','bloß nicht vor Weihnachten! 🤭🤍'],['Kommentiere „HaarFein“,','wenn du eine brauchst ✨🎁']],
16:[['Zeig das einer Mama mit Frizz','bloß nicht vor Weihnachten! 🤭✨'],['Kommentiere „HaarFein“,','wenn du eine brauchst 🤭❤️']],
17:[['Mamas mit Frizz: nicht gehen …','RENNT zu dm! 🤭😍'],['Kommentiere „HaarFein“,','wenn du eine brauchst 🥰🎁']],
18:[['Als vielbeschäftigte Mama wurde ich','zu einer HaarFein-Vorführung','eingeladen.'],['Was meint ihr?','Ich habe sie gekauft!'],['Kommentiere „HaarFein“,','um deine zu bekommen 🛍️💬👇']]}
review=P/'post-edit/cue-boundaries.json';items={}
for row in C.read(review)['items']:
 n=row['position'];original=[c for c in row['cues'] if c['original_lines']]
 if n==2:original=original[:2]
 assert len(original)==len(TEXT[n])
 cues=[dict(start=c['start'],end=c['end'],lines=lines,source_text=c['original_lines']) for c,lines in zip(original,TEXT[n])]
 items[str(n)]=dict(item=s['snapshot_data']['batch']['prepared'][n-1]['item']['id'],reference=dict(path=row['source_path'],sha256=row['source_sha256']),cues=cues,audio=dict(mode='preserved_original'),status='ready_for_simple_render' if n in (1,2,3,5,7,8,9,11,12,17) else 'audio_or_assembly_required',adaptation='German, destination brand and explicit store; preserve reference text-block changes and niche emojis. All text added only in postproduction.')
save(P/'post-edit/editorial-plan.json',dict(order=O,editor=AUTHOR,reference_review=proof(review),items=items))
print('Editorial plan saved; complex audio and hook/body assembly remain explicitly pending.')
```
## Render de los rótulos y del MP4 (pedido 81)

Origen: `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/edit-videos.py` (íntegro). Rótulos como PNG con `EDITOR/order43_text06b.swift` y la fuente `EDITOR/fonts/TikTok-Display-Medium.ttf`, superpuestos en x112/y287 sobre 1080×1920; por defecto se conserva el audio del clip (`-c:a copy`), `libx264 -crf 18 -preset fast`, mismos fotogramas y fps que el clip.

```
from production_common import *
import order43_finish as H
H.ORDER=O;H.P=P;H.D=P/'post-edit';H.SNAPSHOT=s['snapshot']

def render(n):
 cfg=C.read(H.D/'editorial-plan.json')['items'][str(n)]
 itemid=s['snapshot_data']['batch']['prepared'][n-1]['item']['id']
 node=next(x for x in H.active_nodes() if x['item']==itemid)
 if node['state']!='done':raise ValueError('Awaiting verified final video')
 seg=H.checked_final(node);item=node['item'];f=H.D/f'final-v{n}-r{3 if "-r3-" in node["id"] else (2 if node.get("replaces") else 1)}';f.mkdir(parents=True,exist_ok=True)
 out=f/'edited.mp4';rp=f/'receipt.json'
 if rp.exists():
  r=C.read(rp);assert C.sha(out)==r['sha256'];return r
 visual=Path(cfg.get('visual_override',seg['path']))
 audio=cfg.get('audio',dict(mode='preserved_original'))
 if cfg.get('visual_override'):
  vm,vv=H.probe(item,visual);seg=dict(seg,duration=float(vv.get('duration') or vm['format']['duration']),frames=vv['nb_frames'],fps=vv['avg_frame_rate'])
 cues=[dict(c,start=max(0,c['start']),end=min(seg['duration'],c['end'])) for c in cfg['cues'] if c['start']<seg['duration']]
 if cues:cues[-1]['end']=seg['duration']
 spec=f/'cues.json';save(spec,cues)
 sw=H.stage(H.SWIFT.resolve(),H.sha(H.SWIFT));font=H.stage(H.FONT.resolve(),H.sha(H.FONT));images=[]
 for i in range(len(cues)):
  im=f/f'cue-{i}.png'
  if not im.exists():H.run(item,['/usr/bin/swift',str(sw),str(spec),str(im),str(font),str(i)],[sw,spec,font],im)
  images.append(im)
 cmd=[H.FFMPEG,'-v','error','-n','-filter_complex_threads','1','-i',str(visual)]
 for im in images:cmd+=['-i',str(im)]
 inputs=[visual,*images]
 if audio['mode']!='preserved_original':
  ap=H.stage(Path(audio['path']).resolve(),audio['sha256']);cmd+=['-ss',str(audio.get('start',0)),'-i',str(ap)];inputs.append(ap)
 filters=['[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[base]'];prev='base'
 for i,c in enumerate(cues):
  lab=f't{i}';filters.append(f"[{prev}][{i+1}:v]overlay=112:287:enable='gte(t,{c['start']})*lt(t,{c['end']})'[{lab}]");prev=lab
 cmd+=['-filter_complex',';'.join(filters),'-map',f'[{prev}]','-map','0:a?' if audio['mode']=='preserved_original' else f'{len(images)+1}:a:0','-c:v','libx264','-threads','2','-crf','18','-preset','fast','-fps_mode','passthrough']
 if audio['mode']=='preserved_original':cmd+=['-c:a','copy']
 else:cmd+=['-c:a','aac','-b:a','192k','-t',str(seg['duration'])]
 cmd+=['-movflags','+faststart',str(out)]
 if not out.exists():H.run(item,cmd,inputs,out)
 H.run(item,[H.FFMPEG,'-v','error','-xerror','-i',str(out),'-f','null','-'],[out]);m,v=H.probe(item,out)
 assert v.get('nb_frames')==seg['frames'] and v['avg_frame_rate']==seg['fps']
 ah=H.audio_hash(item,visual) if seg['audio'] and audio['mode']=='preserved_original' else None
 if ah:assert ah==H.audio_hash(item,out)
 r=dict(order=O,item=item,position=n,editor=AUTHOR,source=seg,visual_input=str(visual),output=str(out),sha256=C.sha(out),cues=cues,full_decode_ok=True,audio_bitstream_sha256=ah,audio_policy=audio,audio_listened=False,independent_review='pending',editorial_plan=proof(H.D/'editorial-plan.json'),metrics=m)
 save(rp,r);return r
if __name__=='__main__':
 for n in map(int,sys.argv[1:]):
  try:print(render(n)['output'],flush=True)
  except Exception as e:print(n,repr(e),flush=True)
```
## Descripciones

Origen: `/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/post-edit/descriptions/NN-Beschreibung-DE.txt`. Una por vídeo e idioma: los rótulos del vídeo, cada bloque en un párrafo. Ejemplos literales:

```
Das süßeste Weihnachtsgeschenk! 🍦🎁😍

Kommentiere „EisWerk“, wenn du sie brauchst! 🎄🍦
```
```
Nicht ansehen, wenn deine Haare seit den Wechseljahren widerspenstig sind! 👀

Eine kabellose, tragbare Mini-Stylingbürste ✨

Kommentiere „HaarZauber“, wenn du sie möchtest! 💕👇
```
```
Das Problem … 😰🚫

Vs. … 🤭

FalterPfote 😍💕
```

Las reglas en prosa del 06B ya están copiadas en `docs/reglas-origen/memory-context/texto-edicion-default-06b.md`, `…/textos-siempre-edicion-20261031.md`, `…/cuentas-cuerpos-emojis-20261114.md` y `docs/reglas-origen/reglas-edicion-t7/TEXTOS_FIJOS_PRODUCTOS_FISICOS_20261031.md`.
