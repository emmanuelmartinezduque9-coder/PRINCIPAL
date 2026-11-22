#!/usr/bin/env python3
"""Planes del montador v1 (re-montaje con el patrón viral) para el pedido 54: V02, V01, V03, V12.

Se ejecuta en el Mac (`python3 planes_v1.py`) y escribe planes/V*-v1.json. Las salidas llevan el sufijo « (v1)» en la
misma carpeta de entrega; no se toca ningún vídeo anterior. Decisiones: docs/piloto-pedido-54/montaje-v1.md.

Lo que se fija a mano (mirando hojas a 8 fps) y por qué:
  - `in_frame` del gancho: ~0,1 s antes de la primera palabra de la voz (energía de la voz separada).
  - `reveal_frame`: primer fotograma en que se ve la caja/producto al quitar la tela. El montador corta
    `hold_s` después (0,45 s, patrón viral). Detectarlo solo no es fiable todavía.
Todo lo demás (in/out de cuerpos y réplicas, cortes en beat, rótulos, zooms) lo decide el montador.
"""
import json
from pathlib import Path

ORDER = 'app-6852a9fdeb44480983cc86d73a67d471-54'
ORD = f'/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/{ORDER}'
MUS = '/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/NanoBanana/_EDICIONES/music-library'
DESC = '/Volumes/T7/PRINCIPAL/pedido-54/descargas'
VOZ = '/Volumes/T7/PRINCIPAL/pedido-54/trabajo/voz'
OUT = '/Volumes/T7/AUTOMATIZACION SEGA/videos editados/2026-11-22/PRINCIPAL-pedido-54'
WORK = '/Volumes/T7/PRINCIPAL/pedido-54/trabajo/v1'
SONG = {
    2: (f'{MUS}/a081c8089a0db17b330662177577c98e88efb958365758213895fd4a01bd47cf.mp3', 9.32),
    11: (f'{MUS}/d78f8ec32a6858fa455f0834261796d40b81f13e0ee66206cb8810ce0690ecfe.mp3', 7.49),
}
PLANES = Path(__file__).resolve().parent / 'planes'


def out(n, cuenta):
    return f'{OUT}/{cuenta} - DE/{n:02d} - {cuenta} - DE (v1).mp4'


def save(plan):
    PLANES.mkdir(exist_ok=True)
    plan.setdefault('version', 1)
    plan.setdefault('zoom', dict(enabled=False))
    plan['work_dir'] = f"{WORK}/{plan['id']}"
    plan['output'] = out(plan['video'], plan['cuenta'])
    (PLANES / f"{plan['id']}.json").write_text(json.dumps(plan, indent=1, ensure_ascii=False))


def song_audio(n, voice=None):
    song, drop = SONG[n]
    # product_shown vacío = el drop cae en el primer fotograma del cuerpo (decisión del dueño, 22/11)
    a = dict(mode='cancion', song=song, drop=drop, product_shown={}, music_gain_db=0, peak_limit=0.94)
    if voice:
        a['voice'] = dict(clip=0, target_lufs=-14, max_spill_s=0.6, **voice)
    return a


# ---- V02 EisWerk: el ejemplo de «lo que no hay que hacer». Gancho tela rosa + cuerpos 209 (unboxing) y 223.
save(dict(
    id='V02-v1', tipo='gancho+cuerpo', pedido=ORDER, video=2, cuenta='EisWerk',
    clips=[
        dict(role='hook', path=f'{DESC}/V2-gancho-topaz-90019505.mp4', in_frame=11, reveal_frame=115, hold_s=0.45),
        dict(role='body', auto=True, path=f'{ORD.rsplit("/", 1)[0]}/app-63a7c753a6f44022b7651b6f713fb348-37/NanoBanana/_UPSCALE/6e211d6a-3c31-4f7f-9eeb-46484560abc1/final_1080p.mp4'),
        dict(role='body', auto=True, path=f'{ORD.rsplit("/", 1)[0]}/app-4b5cc5f0692f415dbacdd02be33a328c-46/NanoBanana/_UPSCALE/6f1ab6b3-f975-40ce-9081-788216661577/final_1080p.mp4'),
    ],
    audio=song_audio(11, {'path': f'{VOZ}/v2-gancho-corregido.wav', 'from': 0.458, 'to': 5.75}),
    texts=[dict(role='main', text='Das beste Weihnachtsgeschenk existiert ni– 😲🎁'),
           dict(role='cta', text='Kommentiere „EisWerk“, wenn du eine haben willst 😊🤗')],
    notas=['Gancho: entra en f11 (0,46 s; «Eins» a 0,6 s) y corta 0,45 s después de que asome la caja (f115 → f126), '
           'con la tela aún moviéndose, como los virales nº 2 y nº 4. La voz termina «… geworden ist» 0,5 s ya dentro '
           'del unboxing (no se corta ninguna palabra).',
           'Cuerpos 209 y 223 en su orden; in/out automáticos. El 209 acaba en 3 fotogramas de la foto del producto '
           '(la «imagen que aparece» que vio el dueño) y en un giro de cámara antes: se descartan solos.',
           'Drop (7,49 s de la canción nº 11) en el primer fotograma del cuerpo, como decidió el dueño.']))

# ---- V01 EisWerk: gancho del dueño (mantel Starbucks × EisWerk) + cuerpo C78, canción nº 2. Canción + cuerpo reutilizado.
save(dict(
    id='V01-v1', tipo='gancho+cuerpo', pedido=ORDER, video=1, cuenta='EisWerk',
    clips=[
        dict(role='hook', path=f'{DESC}/owner-88a7e7b3.mp4', in_frame=10, reveal_frame=132, hold_s=0.45),
        dict(role='body', auto=True, path=f'{DESC}/V1-cuerpo-topaz-980c2227.mp4'),
    ],
    audio=song_audio(2, {'path': f'{VOZ}/v1-gancho-original.wav', 'from': 0.417, 'to': 5.6}),
    texts=[dict(role='main', text='STARBUCKS × EISWERK 😳🍦'),
           dict(role='cta', text='Kommentiere „EisWerk“, wenn du auch eine willst! 🤩🍦')],
    notas=['Gancho aprobado por el dueño (Topaz 88a7e7b3). Entra en f10 («Eins» a 0,5 s); el mantel vuela a 5,4–5,5 s y '
           'las cajas se ven desde f132: corte en f143 (0,45 s después).',
           'Cuerpo C78 (reutilizado de la biblioteca) con in/out automáticos.'],
    avisos=['Cuerpo: hacia 6 s del cuerpo el sirope cae sobre la tapa del motor (defecto conocido, elección del dueño).']))

# ---- V03 EisWerk: réplica Genjutsu con audio original (continuo bajo los cortes).
save(dict(
    id='V03-v1', tipo='replica', pedido=ORDER, video=3, cuenta='EisWerk',
    clips=[dict(role='replica', auto=True,
                path=f'{ORD}/NanoBanana/_UPSCALE/4bbbe864-d1eb-44dd-b977-d632693f47d4/final_1080p.mp4')],
    audio=dict(mode='original'),
    texts=[dict(role='main', text='Zeig das bloß nicht deiner Freundin 🍦🎄🤫'),
           dict(role='cta', text='Kommentiere „EisWerk“, wenn du auch eine brauchst 🍦💕')],
    notas=['Réplica Genjutsu: el audio original (la canción de la referencia) suena seguido desde el fotograma 0; '
           'solo se recortan planos, sin cambiar velocidad. Los cortes buscan los beats de ese audio.']))

# ---- V12 FalterPfote: gancho LIDL + cuerpo (ya con 8 tomas), canción nº 2.
save(dict(
    id='V12-v1', tipo='gancho+cuerpo', pedido=ORDER, video=12, cuenta='FalterPfote',
    clips=[
        dict(role='hook', path=f'{ORD}/NanoBanana/_UPSCALE/4d20b781-b650-4fd0-aac4-1524044643ce/final_1080p.mp4',
             in_frame=3, reveal_frame=122, hold_s=0.45),
        dict(role='body', auto=True, path='/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-ffe90d4992df4e5585acd1acd93d294b-54/NanoBanana/_UPSCALE/9bcdfe34-e119-4935-af9c-e6eaa4a937bb/final_1080p.mp4'),
    ],
    audio=song_audio(2, {'path': f'{ORD}/post-edit/audio-review/separation-v12/v12/voice-demucs.wav', 'from': 0.125, 'to': 4.95}),
    texts=[dict(role='main', text='LIDL × FALTERPFOTE 😳🦋'),
           dict(role='cta', text='Kommentiere „FalterPfote“, wenn du auch eins willst! 🤩🦋')],
    notas=['Gancho sin acelerar: entra en f3 («Eins» a 0,25 s), las cajas se ven en f122 → destape a 4,96 s (< 5 s, nota '
           'del dueño) y corte en f133.', 'Cuerpo con in/out automáticos (ya trae 8 tomas; se acortan).']))

if __name__ == '__main__':
    print(sorted(p.name for p in PLANES.glob('*-v1.json')))
