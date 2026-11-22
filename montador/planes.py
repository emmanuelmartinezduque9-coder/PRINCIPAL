#!/usr/bin/env python3
"""Genera los planes de montaje del piloto (pedido 54) en planes/. Uso: python3 planes.py"""
import json
from pathlib import Path

ORDER = 'app-6852a9fdeb44480983cc86d73a67d471-54'
ORD = f'/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/{ORDER}'
MUS = '/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/NanoBanana/_EDICIONES/music-library'
DEL = '/Volumes/T7/AUTOMATIZACION SEGA/videos editados/2026-11-22/PRINCIPAL-pedido-54'
PILOT = '/Volumes/T7/PRINCIPAL/pedido-54'
SONG2 = f'{MUS}/a081c8089a0db17b330662177577c98e88efb958365758213895fd4a01bd47cf.mp3'  # nº2 «navideña1», drop 9,32 s
OUT = Path(__file__).resolve().parent / 'planes'
HZ = ['Als vielbeschäftigte Mama wurde ich zu einer HaarZauber-Vorführung eingeladen.',
      'Ehrlich gesagt hat mir HaarZauber richtig gut gefallen 👜✨',
      'Was meint ihr? Ich habe sie gekauft!',
      'Kommentiere „HaarZauber“, um deine zu bekommen 🛍️💬👇']


def cues(texts, cuts):
    t = [0] + cuts + [None]
    return [dict(start=t[i], end=t[i + 1], text=x) for i, x in enumerate(texts)]


def save(plan):
    OUT.mkdir(exist_ok=True)
    (OUT / f"{plan['id']}.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1))


def deliver(n, cuenta, suffix=''):
    return f'{DEL}/{cuenta} - DE/{n:02d} - {cuenta} - DE{suffix}.mp4'


def replica(n, cuenta, job, texts, notas):
    base = dict(id=f'V{n:02d}', tipo='replica', pedido=ORDER, video=n,
                clips=[dict(role='replica', path=f'{ORD}/NanoBanana/_UPSCALE/{job}/final_1080p.mp4')],
                audio=dict(mode='original'), texts=texts, notas=notas, output=deliver(n, cuenta))
    save(base)
    save(dict(base, id=f'V{n:02d}-zoom', output=deliver(n, cuenta, ' (mini-zooms)'),
              zoom=dict(enabled=True, allow_on_replica=True),
              notas=notas + ['Variante para comparar: mini-zooms suaves en cortes y compases del audio original; '
                             'cortes, velocidad y audio intactos.']))


replica(3, 'EisWerk', '4bbbe864-d1eb-44dd-b977-d632693f47d4',
        cues(['Zeig das bloß nicht deiner Freundin 🍦🎄🤫', 'Kommentiere „EisWerk“, wenn du auch eine brauchst 🍦💕'], [8.0]),
        ['Réplica Genjutsu con audio original (indicación 1 del dueño): clip Topaz 4bbbe864 entero, sin recortar ni acelerar.',
         'Textos y tiempos: source-overlay-boundaries.json, posición 3.'])
replica(5, 'HaarZauber', '53458694-0be9-4b29-9738-4b4c6c8c01e4', cues(HZ, [2.633333, 5.066667, 7.633333]),
        ['Réplica Genjutsu con audio original: clip Topaz 53458694 entero.', 'Textos y tiempos: source-overlay-boundaries.json, posición 5.'])
replica(8, 'HaarZauber', '1fe3dcd0-f8f3-42b9-a229-0fe6bd62bb3d', cues(HZ, [3.0, 5.208333, 7.833333]),
        ['Réplica Genjutsu con audio original: clip Topaz 1fe3dcd0 entero.', 'Textos y tiempos: source-overlay-boundaries.json, posición 8.'])

# V12: gancho 1,2,3 (Topaz 4d20b781) + cuerpo entero, canción nº2, drop al inicio del cuerpo.
v12 = dict(
    id='V12', tipo='gancho+cuerpo', pedido=ORDER, video=12,
    clips=[dict(role='hook', path=f'{ORD}/NanoBanana/_UPSCALE/4d20b781-b650-4fd0-aac4-1524044643ce/final_1080p.mp4',
                in_frame=0, out_frame=145, out_frames=130, snap_out=False),
           dict(role='body', path='/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-ffe90d4992df4e5585acd1acd93d294b-54/'
                                  'NanoBanana/_UPSCALE/9bcdfe34-e119-4935-af9c-e6eaa4a937bb/final_1080p.mp4')],
    audio=dict(mode='cancion', song=SONG2, drop=9.32, product_shown=dict(clip=1, frame=0), music_gain_db=0, peak_limit=0.94,
               voice=dict(path=f'{ORD}/post-edit/audio-review/separation-v12/v12/voice-demucs.wav', clip=0,
                          **{'from': 0.0, 'to': 4.95}, target_lufs=-14)),
    texts=[dict(start=0, end=11.291667, text='LIDL × FALTERPFOTE 😳🦋'),
           dict(start=11.291667, end=None, text='Kommentiere „FalterPfote“, wenn du auch eins willst! 🤩🦋')],
    notas=['«Producto mostrado» = primer fotograma del cuerpo (collar FalterPfote), confirmado por el dueño el 22/11; '
           'alternativa no usada: destape de cajas en el gancho (fotograma de salida 109, 4,54 s).',
           'Gancho acelerado 145→130 fotogramas (1,1154×, por debajo del máximo 1,12×) como la edición antigua: el destape '
           '(fotograma fuente 122) queda en el fotograma de salida 109 = 4,54 s (<5 s, nota del dueño) y las cajas se ven 21 fotogramas (<1 s) antes del cuerpo.',
           'Voz: pista separada con Demucs por el motor antiguo (solo habla del gancho, 0–4,95 s), misma velocidad que el gancho; '
           'el cuerpo va sin audio propio. Canción nº2 desde el primer fotograma, continua, nivel constante, sin ducking.'],
    output=deliver(12, 'FalterPfote'))
save(v12)
save(dict(v12, id='V12-zoom', output=deliver(12, 'FalterPfote', ' (mini-zooms)'), zoom=dict(enabled=True),
          notas=v12['notas'] + ['Variante B: mini-zooms en el drop, cortes y compases de la canción.']))

# V9: réplica Genjutsu con canción elegida (decisión del dueño 22/11): drop en el corte al collar.
V9_CLIP = f'{PILOT}/descargas/V9-topaz-66469331.mp4'
V9_TEXT = [dict(start=0, end=None, text='👱‍♀️: „Schatz, hör auf, dem Hund so einen Scheiß zu kaufen“\nIch:')]
v9 = dict(
    id='V09', tipo='replica', pedido=ORDER, video=9, clips=[dict(role='replica', path=V9_CLIP)],
    audio=dict(mode='cancion', song=SONG2, drop=9.32, product_shown=dict(clip=0, frame=76), music_gain_db=0, peak_limit=0.94),
    texts=V9_TEXT,
    notas=['Decisión del dueño (22/11): si eligió canción, se usa aunque el vídeo sea Genjutsu. Canción nº2 desde el primer '
           'fotograma; drop guardado 9,32 s en el corte donde aparece el producto (primer fotograma del plano del collar: fotograma 76 = 3,167 s, medido con el detector de escena).',
           'Réplica: sin recortes ni cambios de velocidad. Se quita el audio generado (reproduce el sonido de la referencia). No se ha escuchado: si llevara voz, no se conserva en esta versión; compárese con la variante de audio original en revision/.',
           'Clip: Topaz 66469331 descargado de Higgsfield el 22/11 (sin coste).'],
    avisos=['DEFECTO VISIBLE en el clip (viene de la generación, no del montaje): entre ~2,7 y 3,16 s, al quitar la tela, aparece un '
            'rottweiler con alas de dragón naranjas en lugar del husky con alas de mariposa. Revisar antes de publicar.'],
    output=deliver(9, 'FalterPfote'))
save(v9)
save(dict(v9, id='V09-audio-original', audio=dict(mode='original'),
          output=f'{DEL}/FalterPfote - DE/revision/09 - FalterPfote - DE (audio original).mp4',
          revision_dir=f'{DEL}/FalterPfote - DE/revision',
          notas=['Extra para comparar: misma réplica con el audio generado original (no es la versión principal).']))
print('\n'.join(sorted(p.name for p in OUT.glob('*.json'))))
