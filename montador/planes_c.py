#!/usr/bin/env python3
"""Planes de la fase C del piloto del pedido 54 (V1, V2, V4, V6, V7, V10, V11 + alternativas).

Se ejecuta en el Mac (`python3 planes_c.py`) y escribe planes/V*.json. Ver
docs/piloto-pedido-54/entrega-completa.md para las decisiones.
"""
import json
from pathlib import Path

ORDER = 'app-6852a9fdeb44480983cc86d73a67d471-54'
ORD = f'/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/{ORDER}'
MUS = '/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/NanoBanana/_EDICIONES/music-library'
DESC = '/Volumes/T7/PRINCIPAL/pedido-54/descargas'
VOZ = '/Volumes/T7/PRINCIPAL/pedido-54/trabajo/voz'
OUT = '/Volumes/T7/AUTOMATIZACION SEGA/videos editados/2026-11-22/PRINCIPAL-pedido-54'
FPS = 24
SONG = {
    2: (f'{MUS}/a081c8089a0db17b330662177577c98e88efb958365758213895fd4a01bd47cf.mp3', 9.32),
    3: (f'{MUS}/b06202f2588ad3bebe04ffa1c2f53c6df101844127ef7d31ae7b00dc609a2929.mp3', 17.74),
    6: (f'{MUS}/c2a4dce2916d8d44307fe898aa69145f3fa8e200e3ad5d6ad2fcd067ee54828b.mp3', 6.94),
    11: (f'{MUS}/d78f8ec32a6858fa455f0834261796d40b81f13e0ee66206cb8810ce0690ecfe.mp3', 7.49),
}
CTA = {
    'EisWerk': 'Kommentiere „EisWerk“, wenn du auch eine willst!',
    'HaarZauber': 'Kommentiere „HaarZauber“, wenn du auch eine willst!',
}
PLANES = Path(__file__).resolve().parent / 'planes'


def deliver(n, cuenta, suffix=''):
    return f'{OUT}/{cuenta} - DE/{n:02d} - {cuenta} - DE{suffix}.mp4'


def save(plan, zoom_variant=True):
    PLANES.mkdir(exist_ok=True)
    (PLANES / f"{plan['id']}.json").write_text(json.dumps(plan, indent=1, ensure_ascii=False))
    if zoom_variant:
        n, cuenta = plan['video'], plan['cuenta']
        z = dict(plan, id=plan['id'] + '-zoom', output=plan['output'].replace('.mp4', ' (mini-zooms).mp4'),
                 zoom=dict(enabled=True, allow_on_replica=plan.get('tipo') == 'replica'),
                 notas=plan['notas'] + ['Variante con mini-zooms (solo imagen; textos fijos).'])
        (PLANES / f"{z['id']}.json").write_text(json.dumps(z, indent=1, ensure_ascii=False))


def hook_body(id_, n, cuenta, hook, bodies, song_no, voice, texts, notas, avisos=(), suffix='', zoom=True):
    song, drop = SONG[song_no]
    audio = dict(mode='cancion', song=song, drop=drop, product_shown=dict(clip=1, frame=0),
                 music_gain_db=0, peak_limit=0.94)
    if voice:
        audio['voice'] = dict(clip=0, target_lufs=-14, **voice)
    save(dict(id=id_, tipo='gancho+cuerpo', pedido=ORDER, video=n, cuenta=cuenta,
              clips=[dict(role='hook', snap_out=False, **hook)] + [dict(role='body', path=b) for b in bodies],
              audio=audio, texts=texts, notas=list(notas), avisos=list(avisos),
              output=deliver(n, cuenta, suffix)), zoom)


def replica(id_, n, cuenta, path, texts, notas, audio=None, avisos=(), suffix='', zoom=True):
    save(dict(id=id_, tipo='replica', pedido=ORDER, video=n, cuenta=cuenta, clips=[dict(role='replica', path=path)],
              audio=audio or dict(mode='original'), texts=texts, notas=list(notas), avisos=list(avisos),
              output=deliver(n, cuenta, suffix)), zoom)


V1_BODY = f'{DESC}/V1-cuerpo-topaz-980c2227.mp4'
V2_BODIES = [
    '/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-63a7c753a6f44022b7651b6f713fb348-37/NanoBanana/_UPSCALE/6e211d6a-3c31-4f7f-9eeb-46484560abc1/final_1080p.mp4',
    '/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-4b5cc5f0692f415dbacdd02be33a328c-46/NanoBanana/_UPSCALE/6f1ab6b3-f975-40ce-9081-788216661577/final_1080p.mp4',
]
V7_BODY = '/Volumes/T7/AUTOMATIZACION SEGA/Motor/order-preparation/app-8082c194d416445a9cd108923e243156-81/NanoBanana/_UPSCALE/71696eaa-b5ed-4571-8fc3-b75b8d133c9b/final_1080p.mp4'


def two_texts(main, cta, dur, cta_len=3.5):
    t = round(round((dur - cta_len) * FPS) / FPS, 6)
    return [dict(start=0, end=t, text=main), dict(start=t, end=None, text=cta)]


# ---- V1: gancho aprobado por el dueño (Topaz 88a7e7b3 del gancho 939a0f58) + cuerpo C78 (Topaz 980c2227)
v1_dur = 144 / FPS + 241 / FPS
hook_body('V01', 1, 'EisWerk', dict(path=f'{DESC}/owner-88a7e7b3.mp4', in_frame=0, out_frame=145, out_frames=144),
          [V1_BODY], 2, dict(path=f'{VOZ}/v1-gancho-original.wav', **{'from': 0.0, 'to': 6.04}),
          two_texts('STARBUCKS × EISWERK 😳🍦', CTA['EisWerk'] + ' 🤩🍦', v1_dur),
          ['Gancho: el que el dueño dio por bueno el 22/11 (Topaz 88a7e7b3 del gancho 939a0f58, mantel «Starbucks × EisWerk»); '
           'el sistema antiguo lo había rechazado porque asoman las cajas bajo la tela; manda el dueño.',
           'Gancho 145→144 fotogramas (1,007×) para no pasar de 6 s; destape a ~5,5 s; el cuerpo entra a 6,0 s con el drop.',
           'Cuerpo C78 clip 1 entero, reescalado con Topaz (980c2227) desde el 480p.',
           'Voz: separada con HTDemucs del audio del gancho (no escuchada).'],
          ['Cuerpo: a ~4,5–7 s del cuerpo los toppings y el sirope caen sobre la tapa del motor (elección del dueño, ya conocido).'])

# ---- V1 alternativa: gancho corregido 73c78aac (Topaz 5a9183b4), cortado 1 s después del destape
hook_body('V01-alt', 1, 'EisWerk', dict(path=f'{DESC}/V1-gancho-topaz-5a9183b4.mp4', in_frame=0, out_frame=138),
          [V1_BODY], 2, dict(path=f'{VOZ}/v1-gancho-corregido.wav', **{'from': 0.0, 'to': 138 / FPS}),
          two_texts('STARBUCKS × EISWERK 😳🍦', CTA['EisWerk'] + ' 🤩🍦', 138 / FPS + 241 / FPS),
          ['Alternativa: gancho corregido por el sistema antiguo (73c78aac, mantel blanco liso, sin cajas a la vista), '
           'Topaz 5a9183b4. Se cortó en el fotograma 138 (destape ~114 + 1 s).'],
          suffix=' (alternativa gancho corregido)', zoom=False)

# ---- V2: gancho corregido ed0559f6 (Topaz 90019505) + cuerpos 209/2 y 223/1, canción nº11
v2_dur = 144 / FPS + 73 / FPS + 265 / FPS
hook_body('V02', 2, 'EisWerk', dict(path=f'{DESC}/V2-gancho-topaz-90019505.mp4', in_frame=0, out_frame=145, out_frames=144),
          V2_BODIES, 11, dict(path=f'{VOZ}/v2-gancho-corregido.wav', **{'from': 0.0, 'to': 6.04}),
          two_texts('Das beste Weihnachtsgeschenk existiert ni– 😲🎁', 'Kommentiere „EisWerk“, wenn du eine haben willst 😊🤗', v2_dur),
          ['Gancho corregido ed0559f6 (tela rosa EisWerk opaca), Topaz 90019505; 145→144 fotogramas (≤6 s).',
           'Cuerpos en el orden manual: 209/2 (unboxing) y 223/1; el drop cae en el primer fotograma del cuerpo 209.',
           'Voz: separada con HTDemucs (no escuchada).'])

replica('V04', 4, 'EisWerk', f'{DESC}/owner-263f4aa8.mp4',
        [dict(start=0, end=11.333333, text='POV: Du kannst dein eigenes Eis zu Hause machen 😊🍨🎄'),
         dict(start=11.333333, end=None, text=CTA['EisWerk'] + ' 🎁🍦')],
        ['Clip que el dueño dio por bueno el 22/11 («está bien, solo le falta la edición»): Topaz 263f4aa8 del Genjutsu e7e8b21a. '
         'No se regeneró.', 'Réplica: cortes, velocidad y audio original intactos.'],
        avisos=['El sistema antiguo lo rechazó porque entre 6 y 8 s los toppings y el sirope entran por un agujero en la parte de '
                'arriba del motor (la máquina real lo tiene cerrado). El dueño lo acepta tal cual.'])

# ---- V7: gancho 5505b172 (Topaz 1bc5d366) cortado en 3,2 s + cuerpo C116, canción nº3
v7_hook = 77
hook_body('V07', 7, 'HaarZauber', dict(path=f'{DESC}/V7-gancho-topaz-1bc5d366.mp4', in_frame=0, out_frame=v7_hook),
          [V7_BODY], 3, None,
          two_texts('Jede vielbeschäftigte Mama braucht genau DAS! 🎁😍', CTA['HaarZauber'] + ' 😇🎄', v7_hook / FPS + 313 / FPS),
          ['Gancho: las tres entregas de caja (Genjutsu 5505b172, Topaz 1bc5d366) cortado en el fotograma 77 (3,21 s), donde acaba su audio.',
           'Sin voz: la separación no encontró habla en el gancho (solo ruido/música de la referencia), así que solo suena la canción.'])

# ---- V10 alternativa: clip antiguo con rótulos quemados (sin texto 06B encima para no duplicarlos)
replica('V10-alt', 10, 'FalterPfote', f'{ORD}/NanoBanana/_UPSCALE/a7831853-7ad5-4675-a03f-a26ea3c575c1/final_1080p.mp4', [],
        ['Alternativa sin coste: el clip antiguo (Genjutsu a7831853, Topaz) tal cual, para que el dueño compare.',
         'No se añaden rótulos 06B porque el clip ya lleva quemados «Die Idee / Vs / Das Resultat».'],
        avisos=['Rótulos de la referencia quemados en la imagen: va contra la regla «sin texto en pantalla»; solo para comparar.'],
        suffix=' (alternativa clip anterior con rótulos quemados)', zoom=False)

# ---- Clips nuevos de la fase C (resultados revisados antes de montar)
def fps(t):
    return round(t * FPS) / FPS


# V6: Genjutsu 540c3252 (Topaz 455ada66) con la canción nº6; drop en el primer corte (primer plano del cepillo)
v6_cuts = [74 / FPS, 153 / FPS, 200 / FPS]          # 3,083 / 6,375 / 8,333 s (detector de escena)
save(dict(id='V06', tipo='replica', pedido=ORDER, video=6, cuenta='HaarZauber',
          clips=[dict(role='replica', path=f'{DESC}/V6-topaz-455ada66.mp4')],
          audio=dict(mode='cancion', song=SONG[6][0], drop=SONG[6][1], product_shown=dict(clip=0, frame=74),
                     music_gain_db=0, peak_limit=0.94),
          texts=[dict(start=0, end=v6_cuts[0], text='Als vielbeschäftigte Mama wurde ich zu einer HaarZauber-Vorführung eingeladen.'),
                 dict(start=v6_cuts[0], end=v6_cuts[1], text='Ehrlich gesagt hat mir HaarZauber richtig gut gefallen 👜✨'),
                 dict(start=v6_cuts[1], end=v6_cuts[2], text='Was meint ihr? Ich habe sie gekauft!'),
                 dict(start=v6_cuts[2], end=None, text='Kommentiere „HaarZauber“, um deine zu bekommen 🛍️💬👇')],
          notas=['Clip generado en la fase C: Genjutsu motion control 540c3252 (frame 06 aprobado + cepillo blanco), Topaz 455ada66.',
                 'Canción elegida nº6 (manda la canción aunque sea Genjutsu); drop 6,94 s en el primer corte (3,083 s, '
                 'primer plano del cepillo trabajando el pelo). Se quita el audio generado.',
                 'Rótulos en los cortes del clip (3,08 / 6,38 / 8,33 s), que coinciden con los límites medidos en la referencia.'],
          avisos=['3–6,4 s: la estilista sujeta además un peine negro plano en la otra mano (en la referencia también hay un segundo útil); no es una pieza del cepillo.'],
          output=deliver(6, 'HaarZauber')))


def seedance_replica(id_, n, ref, clip, gen_job, texts, notas, avisos=()):
    base = dict(texts=texts, audio=dict(mode='externo', path=ref, offset=0,
                nota='audio original del reel de referencia (indicación 1 del dueño: mismo audio que el original)'))
    replica(id_, n, 'FalterPfote', clip, notas=notas, avisos=avisos, **base)
    # Para comparar: el audio que generó Seedance, en revision/ y sin variante de zoom
    out = deliver(n, 'FalterPfote')
    plan = dict(id=id_ + '-audio-generado', tipo='replica', pedido=ORDER, video=n, cuenta='FalterPfote',
                clips=[dict(role='replica', path=clip)], audio=dict(mode='original'), texts=texts,
                notas=notas + [f'Solo para comparar: con el audio que generó Seedance ({gen_job}).'], avisos=list(avisos),
                output=out.replace(f'/{n:02d} - ', f'/revision/{n:02d} - ').replace('.mp4', ' (audio generado Seedance).mp4'),
                revision_dir=out.rsplit('/', 1)[0] + '/revision')
    save(plan, zoom_variant=False)


seedance_replica('V10', 10, f'{ORD}/sources/aedf420c345da037ec11/ref.mp4', f'{DESC}/V10-topaz-36539885.mp4', '769c9e55',
                 [dict(start=0, end=4.0, text='Die Idee 🤔🐶'), dict(start=4.0, end=fps(7.375), text='Vs...'),
                  dict(start=fps(7.375), end=None, text='Das Resultat 🐶👀')],
                 ['Regenerado en la fase C con Seedance 2.5 omni_reference (769c9e55; @Video1 = referencia solo para orden de planos, '
                  'ritmo, cámara y tipo de acción), Topaz 36539885. Sin rótulos quemados.',
                  'Alas de mariposa (disfraz en la toma 1, proyección en el suelo después). Mismo border collie en todas las tomas.',
                  'Audio: el original del reel de referencia (se rellena con silencio los 0,18 s finales que le faltan).',
                  'Rótulos en los cortes reales del clip (4,0 / 7,38 s).'],
                 ['Tomas 3–5: el perro se ve de espaldas y muy oscuro; se reconoce como el mismo border collie solo por la silueta.'])

seedance_replica('V11', 11, f'{ORD}/sources/a9d0b013e3e9164770b8/ref.mp4', f'{DESC}/V11-topaz-1a2f961c.mp4', '4ef0f16b',
                 [dict(start=0, end=fps(3.3333), text='Das Problem...😳❌'), dict(start=fps(3.3333), end=fps(7.0833), text='Vs...'),
                  dict(start=fps(7.0833), end=None, text='Die Lösung 🐶👀')],
                 ['Regenerado en la fase C con Seedance 2.5 omni_reference (4ef0f16b), Topaz 1a2f961c. Sin rótulos quemados.',
                  'Gancho con el coche que se acerca: faros visibles desde ~1,2 s, el coche crece y llega cerca del perro hacia 3 s; '
                  'ella le llama con el brazo. Cortes reales 3,33 / 7,08 / 8,88 / 11,71 s (referencia 3,4 / 7,13 / 8,9 / 11,87).',
                  'Audio: el original del reel de referencia.'],
                 ['El proyector del collar se enciende en rojo (como en la referencia), no en rosa; las alas proyectadas sí son rosa-lila.'])


if __name__ == '__main__':
    print(sorted(p.name for p in PLANES.glob('V0[1247]*.json')) + sorted(p.name for p in PLANES.glob('V10*.json')))
