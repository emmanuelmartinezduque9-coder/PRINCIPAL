#!/usr/bin/env python3
"""montar_auto: monta sin preguntar nada un vídeo de PRINCIPAL con el montador v1 (montador.py).

Uso (lo lanza el agente del Mac, agente-mac/lib.mjs, con `uv run … python montar_auto.py`):
  python montar_auto.py <ficha.json> <carpeta_de_trabajo>

La ficha es la «ficha de montaje» que hace la web (src/server/videos/edits.ts) con las rutas locales que
añade el agente: clips[].path (gancho + cuerpos en orden, o el clip), song.path (+ dropMs/startMs) o, sin
canción, referenceAudio.path (el audio del vídeo de referencia, «Audio original»), texts
(main, cta), product, hookMs y, si hubo referencia de edición, referencia.breakdown (el breakdown.json de
rea-video). Deja en la carpeta de trabajo:
  salida.mp4        el vídeo montado
  resultado.json    {ok, error?, duracion_s, autocomprobacion: {ok, avisos, planos, cortesEnBeat, intentos}, avisos,
                    pistas_referencia}
  plan.json         el plan que se le dio al montador (y revision/ con su plan aplicado y su autocomprobación;
                    montador.log con lo que escribió)

Qué decide solo (el resto lo decide montador.py, como en el pedido 54; ver docs/piloto-pedido-54/montaje-v1.md):
  - Normaliza cada clip a 1080×1920, 24 fps constantes (el montador cuenta fotogramas a 24 fps).
  - «Solo gancho»: el gancho entra en su primer tramo usable y sale a los `hookMs` (lo que dura de verdad el
    gancho; el clip generado puede ser más largo), sin pasar de una cola IA; los cuerpos van con in/out
    automáticos y el drop cae al empezar el cuerpo. Sin cuerpos, el gancho se monta como una réplica.
  - Réplica/adaptación: un clip con in/out automáticos; con canción, el drop al empezar el 2º plano.
  - Sin canción, «Audio original» = el audio del vídeo de REFERENCIA (`referenceAudio`): modo «referencia»,
    un archivo externo que suena desde 0 (el clip calca la referencia: sin alinear ningún drop) y se recorta a lo
    que dure el montaje. Sin él: el audio del clip si lo tiene; si no (Seedance sale mudo), silencio y un aviso.
  - Canción sin drop marcado: suena desde su marca de inicio.
  - Referencia de edición: de sus planos salen las duraciones del patrón (cuerpo y final) y dónde entra el
    CTA (último o penúltimo corte); ver `pistas_referencia`.
Rótulos: texto06b.py (mismo dibujo que el Swift del Mac, en cualquier sistema); sin librosa no hay beats (aviso).
Corre igual en el Mac y en la nube (proceso en segundo plano de Railway: src/server/videos/montaje-nube.ts).
"""
import contextlib
import json
import os
import shutil
import statistics
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import montador as m  # noqa: E402

FPS = m.FPS
SALIDA = 'salida.mp4'
RESULTADO = 'resultado.json'
HOOK_MAX_S = m.PATRON['hook_max_s']
SIN_LIBROSA = 'Sin librosa: los cortes no se ajustan al beat'
SIN_AUDIO = 'Sin canción y los clips no traen audio: el vídeo queda en silencio. Elige una canción.'
NOTA_REFERENCIA = 'audio del vídeo de referencia («Audio original»), desde 0 y recortado al montaje'


class Fallo(Exception):
    """Un motivo para la persona: el montaje no se pudo hacer."""


# ---------------------------------------------------------------- herramientas
def herramientas(avisos, fuente=None):
    """Ajusta el montador a esta máquina: ffmpeg, caché, fuente, rótulos y beats."""
    for name in ('FFMPEG', 'FFPROBE'):
        if not Path(getattr(m, name)).exists():
            found = shutil.which(name.lower())
            if not found:
                raise Fallo(f'Falta {name.lower()}')
            setattr(m, name, found)
    if os.environ.get('MONTADOR_CACHE'):
        m.CACHE = Path(os.environ['MONTADOR_CACHE'])
    font = fuente or os.environ.get('MONTADOR_FUENTE') or m.FONT
    if not Path(font).is_file():
        raise Fallo(f'Falta la fuente de los rótulos ({font}); ¿está conectado el disco?')
    if not Path(m.LABEL_FONT).exists():
        m.LABEL_FONT = font
    # Rótulos 06B con texto06b.py (igual que el Swift del Mac, en cualquier sistema). Sin sus dependencias
    # (freetype-py, uharfbuzz), con Pillow a secas y un aviso.
    try:
        import texto06b  # noqa: F401
        m.render_texts = rotulos_06b
    except ImportError:
        m.render_texts = rotulos_pillow
        avisos.append('Rótulos dibujados sin texto06b (faltan freetype-py/uharfbuzz): pueden verse algo distintos')
    try:
        import librosa  # noqa: F401
    except ImportError:
        m.beat_map = beats_vacios
        avisos.append(SIN_LIBROSA)
    return font


def beats_vacios(audio, work, cache_dir, anchor=None):
    return dict(audio=str(audio), beats=[], beat_strength=[], onsets=[], downbeats=[], tempo_bpm=None, file=None,
                method='sin librosa')


def rotulos_06b(cues, dur, work, font):
    """Rótulos 06B con texto06b.py (el mismo dibujo que texto06b.swift, sin depender del Mac)."""
    import texto06b
    out = Path(work) / 'textos'
    out.mkdir(parents=True, exist_ok=True)
    fuente = texto06b.Fuente(font)
    cues = texto06b.prepare_cues(fuente, cues)
    for i, c in enumerate(cues):
        size = c['font_size_px']
        c['png'] = str(out / f'cue-{i}.png')
        texto06b.render(fuente, c['lines'], size).save(c['png'])
        c['font_size_px'] = float(size)
    return cues


def rotulos_pillow(cues, dur, work, font):
    """Rótulos con Pillow cuando no hay swift (fuera del Mac): blanco con contorno negro en la caja 06B."""
    from PIL import Image, ImageDraw, ImageFont
    out = Path(work) / 'textos'
    out.mkdir(parents=True, exist_ok=True)
    w, h = m.BOX['w'], m.BOX['h']
    from rotulos_layout import prepare_cues, PillowFont, FIXED_SIZE
    measured = PillowFont(font)
    cues = prepare_cues(measured, cues)
    for i, c in enumerate(cues):
        size = c['font_size_px']
        f = measured.font if size == FIXED_SIZE else ImageFont.truetype(str(font), size)
        img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        adv = size * 35 / 31
        asc, desc = f.getmetrics()
        total = asc + desc + adv * (len(c['lines']) - 1)
        baseline = (h - total) / 2 + asc
        for line in c['lines']:
            x = (w - f.getlength(line)) / 2
            d.text((x, baseline), line, anchor='ls', font=f, fill='white',
                   stroke_width=max(1, round(size * 0.05)), stroke_fill='black')
            baseline += adv
        c['png'] = str(out / f'cue-{i}.png')
        img.save(c['png'])
        c['font_size_px'] = float(size)
    return cues


def run(cmd):
    r = subprocess.run([str(x) for x in cmd], capture_output=True, text=True)
    if r.returncode:
        raise Fallo(f'{Path(str(cmd[0])).name} falló: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else r.returncode}')
    return r.stdout


def tiene_audio(path):
    out = run([m.FFPROBE, '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path])
    return bool(out.strip())


def normalizar(src, dst):
    """1080×1920 (rellenando sin deformar), 24 fps constantes, H.264; el audio, si lo hay, en AAC."""
    run([m.FFMPEG, '-v', 'error', '-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0?',
         '-vf', f'fps={FPS},scale={m.W}:{m.H}:force_original_aspect_ratio=increase,crop={m.W}:{m.H},setsar=1',
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p',
         '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', dst])
    return dst


# ---------------------------------------------------------------- referencia de edición (rea-video)
def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def pistas_referencia(b):
    """De un breakdown.json de rea-video saca lo que el montador puede imitar: los cortes, la duración de los
    planos de cuerpo y del último (→ `ritmo`), lo que dura el gancho, el BPM y en qué corte entra el CTA
    (último o penúltimo, por dónde cambia el texto superpuesto). `None` si no hay al menos 3 planos."""
    rows = []
    for s in (b or {}).get('shots') or []:
        try:
            start, end = float(s['start']), float(s['end'])
        except (KeyError, TypeError, ValueError):
            continue
        if end > start:
            texts = tuple(sorted(str(t) for layer in s.get('layers') or [] if layer.get('kind') != 'subtitle'
                                 for t in layer.get('texts') or []))
            rows.append((start, end, texts))
    rows.sort()
    if len(rows) < 3:
        return None
    durs = [round(e - s, 3) for s, e, _ in rows]
    cortes = [round(s, 3) for s, _, _ in rows[1:]]
    ritmo = {}
    cuerpo = durs[1:-1]
    if len(cuerpo) >= 3:
        p25, med, p75 = statistics.quantiles(cuerpo, n=4, method='inclusive')
        tgt = round(_clamp(med, 0.5, 1.8), 3)
        ritmo['body'] = [round(_clamp(p25, 0.4, tgt), 3), tgt, round(_clamp(p75, tgt, 2.2), 3)]
    final = durs[-1]
    tgt = round(_clamp(final, 1.2, 3.5), 3)
    ritmo['final'] = [round(_clamp(final * 0.75, 1.0, tgt), 3), tgt, round(_clamp(final * 1.25, tgt, 4.0), 3)]
    cambios = [round(rows[i][0], 3) for i in range(1, len(rows)) if rows[i][2] and rows[i][2] != rows[i - 1][2]]
    cta = None
    if cambios and cambios[-1] == cortes[-1]:
        cta = 'ultimo'
    elif cambios and len(cortes) >= 2 and cambios[-1] == cortes[-2]:
        cta = 'penultimo'
    music = ((b.get('audio') or {}).get('music') or {})
    return dict(planos=len(rows), cortes_s=cortes, duraciones_s=durs, gancho_s=durs[0] if durs[0] >= 1.5 else None,
                bpm=music.get('tempo_bpm'), ritmo=ritmo, cambios_rotulo_s=cambios, cta=cta)


# ---------------------------------------------------------------- plan
def rango_gancho(an, objetivo_s, total):
    """In/out del gancho: entra donde empieza su primer tramo usable y sale a `objetivo_s` (sin pasar de
    `hook_max_s`), o al final del último tramo usable antes de eso si ahí hay un corte o una cola IA."""
    tramos = [t['usable'] for t in an.get('tramos') or []]
    a = tramos[0][0] if tramos else 0
    target = min(total, a + int(round(min(objetivo_s, HOOK_MAX_S) * FPS)))
    if any(ua <= target <= ub for ua, ub in tramos) or not tramos:
        b = target
    else:
        b = max([ub for _, ub in tramos if ub <= target] or [target])
    if b - a < FPS:  # menos de 1 s: el clip tal cual hasta el objetivo
        a, b = 0, min(total, int(round(min(objetivo_s, HOOK_MAX_S) * FPS)))
    return int(a), int(b)


def cta_standard(spec):
    name = (spec.get('product') or {}).get('name') or 'Produkt'
    return f'Kommentiere „{name}“, wenn du auch eine willst! 🤩'


def lineas(texto):
    """Los saltos de referencia son pistas en text; se deciden al medir la fuente."""
    return None  # Los | se conservan en text como pistas para el equilibrado.


MIN_PLANO_S = 0.28  # como el motor de Codex: cortes a menos de esto son el mismo cambio


MIN_DURACION_PLANO_A_PLANO = 0.9  # parte de la duración de la referencia que tiene que conservar el «plano a plano»


def planos_como_referencia(path, frames, edicion):
    """Los tramos del clip para que dure y corte como la referencia (Codex: `cut-plan.json` con los tramos de cada
    toma, `first_frame`/`end_frame_exclusive`, recortados a la referencia). Con los mismos planos que la referencia,
    cada plano del clip dura lo que el suyo; si no coinciden, cada plano se recorta en proporción para que el total sea
    la duración de la referencia. Siempre desde el principio de cada plano y sin acelerar ni ralentizar. Devuelve
    (tramos [(in, out)], modo, cortes de la referencia en s); con un clip que no es más largo, el clip entero."""
    ref = float(edicion.get('duracion_s') or 0)
    ref_cuts = sorted(float(c) for c in edicion.get('cortes_s') or [] if 0 < float(c) < ref)
    objetivo = round(ref * FPS)
    if ref <= 0 or frames <= objetivo:
        return [(0, frames)], 'entero', ref_cuts
    cortes = []
    for t in sorted(m.scene_cuts(path, 0.3)):
        f = int(round(t * FPS))
        if MIN_PLANO_S * FPS <= f <= frames - MIN_PLANO_S * FPS and (not cortes or f - cortes[-1] >= MIN_PLANO_S * FPS):
            cortes.append(f)
    bordes = [0] + cortes + [frames]
    planos = list(zip(bordes, bordes[1:]))
    ref_bordes = [0.0] + ref_cuts + [ref]
    ref_lens = [b - a for a, b in zip(ref_bordes, ref_bordes[1:])]
    if len(planos) == len(ref_lens):
        metas = [max(1, round(x * FPS)) for x in ref_lens]
        tramos = [(a, a + min(b - a, n)) for (a, b), n in zip(planos, metas)]
        # Mismo número de planos pero de otras duraciones (un clip de Motion Transfer con los cortes en otro sitio): plano
        # a plano solo si el montaje sigue durando como la referencia; si no, se recorta en proporción (vídeo 50 del lote
        # 10: cortes del clip en 2,3 y 5,2 s frente a 2,3 y 10,9 s, y salía de 8,75 s en vez de 14,5).
        if sum(b - a for a, b in tramos) >= MIN_DURACION_PLANO_A_PLANO * objetivo:
            return tramos, 'plano a plano', ref_cuts
    metas = [max(1, round((b - a) * objetivo / frames)) for a, b in planos]
    return [(a, a + min(b - a, n)) for (a, b), n in zip(planos, metas)], 'proporcional', ref_cuts


def tiempo_en_salida(t, tramos, modo, ref, ref_cuts):
    """Dónde cae en el montaje el instante `t` de la referencia."""
    total = sum(b - a for a, b in tramos)
    if modo == 'plano a plano':
        ref_bordes = [0.0] + list(ref_cuts) + [ref]
        salida = 0
        for k, (a, b) in enumerate(tramos):
            if t < ref_bordes[k + 1] or k == len(tramos) - 1:
                return round(min(salida + round((t - ref_bordes[k]) * FPS), salida + (b - a) - 1, total - 1))
            salida += b - a
    return min(total - 1, round(t * total / ref)) if ref > 0 else 0


def cortes_del_montaje(tramos):
    """Fotogramas de salida donde empieza cada tramo después del primero."""
    out, t = [], 0
    for a, b in tramos[:-1]:
        t += b - a
        out.append(t)
    return out


def rotulos_replica(edicion, frames, tramos=None, modo='entero'):
    """Rótulos de una réplica copiados de la referencia, en la caja 06B: con el montaje al tiempo de la referencia,
    en el mismo instante que en ella; con el clip entero, en el punto proporcional (Codex, `render-local.py`:
    `round(t × fotogramas / duración de la referencia)`)."""
    ref = float(edicion.get('duracion_s') or 0)
    filas = [r for r in edicion.get('rotulos') or [] if str(r.get('texto') or '').strip()]
    if ref <= 0 or not filas:
        return []
    tramos = tramos or [(0, frames)]
    total = sum(b - a for a, b in tramos)
    ref_cuts = sorted(float(c) for c in edicion.get('cortes_s') or [] if 0 < float(c) < ref)
    cortes_salida = cortes_del_montaje(tramos)
    inicios, usadas = [], []
    for i, r in enumerate(filas):
        f = 0 if i == 0 else max(1, tiempo_en_salida(float(r['desde_s']), tramos, modo, ref, ref_cuts))
        if i and modo == 'proporcional' and cortes_salida:
            # En la referencia el cambio cae en un corte: aquí, en el corte del montaje más cercano (≤ 0,4 s).
            cerca = min(cortes_salida, key=lambda c: abs(c - f))
            if abs(cerca - f) <= 0.4 * FPS:
                f = cerca
        if inicios and f <= inicios[-1]:
            continue
        inicios.append(f)
        usadas.append(r)
    out = []
    for i, f in enumerate(inicios):
        fin = inicios[i + 1] if i + 1 < len(inicios) else total
        r = usadas[i]
        texto = str(r['texto'])
        out.append(dict(role='cta' if r.get('cta') else ('main' if i == 0 else 'extra'), text=texto, lines=lineas(r['texto']),
                        start=round(f / FPS, 4), end=round(fin / FPS, 4)))
    return out


def textos_gancho(edicion, spec):
    """Con gancho nuevo + cuerpos (Codex: el CTA no se hereda a ciegas de la referencia, se pone al final): el rótulo
    principal es el primero de la referencia adaptado y el CTA, el de la referencia adaptado (o el de siempre)."""
    filas = [r for r in (edicion or {}).get('rotulos') or [] if str(r.get('texto') or '').strip()]
    main = next((r for r in filas if not r.get('cta')), None)
    cta = next((r for r in filas if r.get('cta')), None)
    return main, cta


def construir_plan(spec, clips, work, font, gancho=None, pistas=None, con_audio=False):
    """El plan del montador v1 para la ficha. `clips`: [(papel, ruta normalizada)]; `gancho`: (in, out) del
    gancho; `con_audio`: si el único clip trae audio (réplica sin canción)."""
    avisos = []
    hooks = [p for r, p in clips if r == 'hook']
    bodies = [p for r, p in clips if r == 'body']
    if hooks and bodies:
        tipo = 'gancho+cuerpo'
        a, b = gancho
        plan_clips = [dict(role='hook', path=hooks[0], in_frame=a, out_frame=b)]
        plan_clips += [dict(role='body', auto=True, path=p) for p in bodies]
    else:
        tipo = 'replica'
        plan_clips = [dict(role='replica', auto=True, path=p) for _, p in clips[:1]]
        if len(clips) > 1:
            plan_clips += [dict(role='body', auto=True, path=p) for _, p in clips[1:]]
    edicion = spec.get('edicionReferencia') or None
    copia = None  # réplica editada como su referencia (Codex): clip entero, rótulos y drop de la referencia
    if tipo == 'replica' and len(clips) == 1 and edicion and (edicion.get('rotulos') or []):
        frames = m.video_frames(clips[0][1])
        tramos, modo, ref_cuts = planos_como_referencia(clips[0][1], frames, edicion)
        rot = rotulos_replica(edicion, frames, tramos, modo)
        if rot:
            # Sin `auto`: los tramos fijos (o el clip entero), sin el patrón de los virales.
            plan_clips = [dict(role='replica', path=clips[0][1], in_frame=a, out_frame=b) for a, b in tramos]
            ref = float(edicion['duracion_s'])
            if modo == 'proporcional' and len(tramos) > 1:
                drop_f = cortes_del_montaje(tramos)[0]  # el primer cambio de plano del montaje, como en la referencia
            else:
                drop_f = tiempo_en_salida(ref_cuts[0], tramos, modo, ref, ref_cuts) if ref_cuts else 0
            drop_t = round(drop_f / FPS, 4)
            copia = dict(rotulos=rot, drop_t=drop_t, modo=modo, tramos=tramos)

    song = spec.get('song')
    if song:
        drop_ms = song.get('dropMs')
        if drop_ms is None:
            audio = dict(mode='cancion', song=song['path'], drop=float(song.get('startMs') or 0) / 1000,
                         product_shown={'t': 0.0})
            avisos.append('La canción no tiene el drop marcado: suena desde su inicio')
        else:
            # Gancho: el drop al empezar el cuerpo (product_shown vacío). Réplica: al empezar el 2º plano.
            shown = {} if tipo == 'gancho+cuerpo' else {'plano': 1}
            if copia:
                # Como la referencia: el drop en su primer cambio de plano (punto proporcional del clip).
                shown = {'t': copia['drop_t']}
            audio = dict(mode='cancion', song=song['path'], drop=float(drop_ms) / 1000, product_shown=shown)
        audio.update(music_gain_db=0, peak_limit=0.94)
    elif (spec.get('referenceAudio') or {}).get('path'):
        # Modo «referencia»: el montador lo hace con su audio externo, desde 0 y recortado a la duración.
        audio = dict(mode='externo', path=spec['referenceAudio']['path'], offset=0, nota=NOTA_REFERENCIA)
    elif tipo == 'replica' and (len(plan_clips) == 1 or copia) and con_audio:
        audio = dict(mode='original')
    else:
        audio = dict(mode='silencio')
        avisos.append(SIN_AUDIO)
    texts = spec.get('texts') or {}
    main_ref, cta_ref = textos_gancho(edicion, spec) if not copia else (None, None)
    ritmo = dict((pistas or {}).get('ritmo') or {})
    if (pistas or {}).get('cta') == 'penultimo':
        # El CTA entra un corte antes: el último plano «no cabe» si dura menos que esto.
        ritmo['cta_min_s'] = round(float((ritmo.get('final') or m.PATRON['final'])[2]) + 0.1, 3)
    notas = [f"Montaje automático del vídeo {spec.get('videoId')} ({spec.get('kind')})."]
    if copia:
        notas.append(f"Edición copiada de la referencia (Codex): tramos {copia['modo']} {copia['tramos']}, "
                     f"{len(copia['rotulos'])} rótulo(s) en el tiempo de la referencia, drop en {copia['drop_t']} s.")
    elif edicion and (main_ref or cta_ref):
        notas.append('Rótulos de la referencia adaptados; el CTA en el corte del último plano (gancho nuevo + cuerpos).')
    if pistas:
        notas.append(f"Referencia de edición: {pistas['planos']} planos, cuerpo {ritmo.get('body')}, final {ritmo.get('final')}, "
                     f"CTA en el {pistas.get('cta') or 'último'} corte, BPM {pistas.get('bpm')}.")
    plan = dict(
        id=f"auto-{spec.get('videoId')}", version=1, tipo=tipo, clips=plan_clips, audio=audio,
        texts=copia['rotulos'] if copia else [
            dict(role='main', text=str(main_ref['texto']) if main_ref else (texts.get('main') or (spec.get('product') or {}).get('name') or ' '),
                 lines=lineas(main_ref['texto']) if main_ref else None),
            dict(role='cta', text=str(cta_ref['texto']) if cta_ref else (texts.get('cta') or cta_standard(spec)),
                 lines=lineas(cta_ref['texto']) if cta_ref else None)],
        zoom=dict(enabled=False), ritmo=ritmo, font=font, notas=notas,
        work_dir=str(Path(work) / 'montador'), revision_dir=str(Path(work) / 'revision'),
        output=str(Path(work) / SALIDA))
    return plan, avisos


# ---------------------------------------------------------------- resumen
def resumen(work, copia=None):
    chk_file = Path(work) / 'revision' / f'{Path(SALIDA).stem} - autocomprobacion.json'
    if copia and not chk_file.exists():
        # Réplica editada como su referencia: no hay patrón que comprobar (el clip va entero, como en Codex).
        return dict(ok=True, avisos=[], planos=1, cortesEnBeat=None, intentos=1)
    if not chk_file.exists():
        return dict(ok=False, avisos=['El montador no hizo la autocomprobación'], planos=None, cortesEnBeat=None, intentos=None)
    chk = json.loads(chk_file.read_text())
    return dict(ok=bool(chk.get('ok')), avisos=list(chk.get('avisos') or [])[:20], planos=len(chk.get('planos') or []),
                cortesEnBeat=f"{chk.get('cortes_en_beat', 0)}/{len(chk.get('cortes_s') or [])}",
                intentos=len(chk.get('intentos') or []) or None)


def motivo(error):
    text = str(error).strip()
    lines = [x for x in text.splitlines() if x.strip()]
    if not lines:
        return 'El montador no pudo montar el vídeo'
    short = lines[0] if len(lines) == 1 else f'{lines[0]} {lines[-1].strip()}'
    return short[:400]


def montar(spec, work, fuente=None):
    work = Path(work)
    work.mkdir(parents=True, exist_ok=True)
    avisos = list(spec.get('avisos') or [])
    font = herramientas(avisos, fuente)
    clips = spec.get('clips') or []
    if not clips:
        raise Fallo('La ficha no trae clips')
    norm_dir = work / 'clips'
    norm_dir.mkdir(exist_ok=True)
    norm = []
    for i, c in enumerate(clips):
        if not Path(c.get('path', '')).is_file():
            raise Fallo('Falta un clip descargado')
        norm.append((c.get('role'), normalizar(c['path'], str(norm_dir / f'{i:02d}-{c.get("role")}.mp4'))))
    if spec.get('song') and not Path(spec['song'].get('path', '')).is_file():
        raise Fallo('Falta la canción descargada')
    if not spec.get('song') and spec.get('referenceAudio') and not Path(spec['referenceAudio'].get('path', '')).is_file():
        raise Fallo('Falta el audio de la referencia descargado')

    pistas = None
    ref = (spec.get('referencia') or {}).get('breakdown')
    if ref:
        try:
            pistas = pistas_referencia(json.loads(Path(ref).read_text()))
        except (OSError, ValueError) as error:
            avisos.append(f'No se pudo leer el desglose de la referencia ({error})')
        if pistas is None:
            avisos.append('La referencia de edición tiene muy pocos planos: se monta con el patrón de siempre')

    gancho = None
    hooks = [p for r, p in norm if r == 'hook']
    if hooks and any(r == 'body' for r, _ in norm):
        an = m.analyze_clip(hooks[0], m.CACHE / 'analisis_clips')
        objetivo = (spec.get('hookMs') or 0) / 1000 or (pistas or {}).get('gancho_s') or HOOK_MAX_S
        gancho = rango_gancho(an, objetivo, an['frames'])
    con_audio = len(norm) == 1 and not spec.get('song') and tiene_audio(norm[0][1])
    plan, mas = construir_plan(spec, norm, work, font, gancho=gancho, pistas=pistas, con_audio=con_audio)
    avisos += mas
    plan_path = work / 'plan.json'
    plan_path.write_text(json.dumps(plan, indent=1, ensure_ascii=False))

    argv = sys.argv
    sys.argv = ['montador.py', str(plan_path), '--sobrescribir']
    try:
        # Lo que el montador escribe por pantalla (su resumen) va a montador.log, junto al plan.
        with open(work / 'montador.log', 'w') as log, contextlib.redirect_stdout(log):
            m.main()
    except SystemExit as error:
        if error.code not in (None, 0):
            raise Fallo(motivo(error.code)) from None
    finally:
        sys.argv = argv
    salida = work / SALIDA
    if not salida.is_file():
        raise Fallo('El montador no dejó el vídeo')
    dur = float(json.loads(run([m.FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', salida]))['format']['duration'])
    copia = plan.get('tipo') == 'replica' and not any(c.get('auto') for c in plan['clips'])
    return dict(ok=True, salida=SALIDA, duracion_s=round(dur, 3), autocomprobacion=resumen(work, copia), avisos=avisos,
                pistas_referencia=pistas)


def main(args=None):
    args = list(sys.argv[1:] if args is None else args)
    fuente = None
    if '--fuente' in args:
        i = args.index('--fuente')
        fuente = args[i + 1]
        del args[i:i + 2]
    if len(args) != 2:
        sys.exit(__doc__)
    spec_path, work = Path(args[0]), Path(args[1])
    work.mkdir(parents=True, exist_ok=True)
    try:
        result = montar(json.loads(spec_path.read_text()), work, fuente)
    except Fallo as error:
        result = dict(ok=False, error=str(error))
    except Exception as error:  # cualquier otro fallo: el motivo, sin rutas largas
        result = dict(ok=False, error=motivo(f'{type(error).__name__}: {error}'))
    (work / RESULTADO).write_text(json.dumps(result, ensure_ascii=False, indent=1, allow_nan=False, default=str))
    print(json.dumps({k: v for k, v in result.items() if k != 'pistas_referencia'}, ensure_ascii=False))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
