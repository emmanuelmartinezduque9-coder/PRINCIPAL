#!/usr/bin/env python3
"""montador v1: monta un vídeo vertical a partir de un «plan de montaje» JSON, con el ritmo de los virales.

Uso (en el Mac):
  export UV_CACHE_DIR=$HOME/Library/Caches/uv-principal COPYFILE_DISABLE=1
  uv run --no-project --with librosa --with soundfile --with numpy \
      python montador.py planes/V02-v1.json [--sobrescribir]

Qué hace, en orden (ver README.md y docs/piloto-pedido-54/montaje-v1.md):
 1. Analiza cada clip (caché por sha256 en analisis_clips/): actividad fotograma a fotograma, cortes internos,
    saltos/imágenes nuevas, colas quietas y la cola degradada típica de la IA (los últimos fotogramas que se
    convierten en otra imagen). De ahí salen los tramos «usables» de cada clip.
 2. Gancho: entrada recortada (voz con ~0,1 s de margen) y salida = destape + `hold_s` (0,45 s por defecto:
    los virales cortan con la tela todavía en el aire). Solo el gancho puede ir a ≤1,12×.
 3. Cuerpos y réplicas (`auto: true`): en cada tramo usable elige 1–4 ventanas de acción con la duración del
    patrón viral por sección (revelado / cuerpo / final), donde más se mueve y terminando con la acción en
    marcha; nunca deja correr el clip hasta su final natural. Sin cambiar la velocidad.
 4. Ritmo: mueve la salida de cada plano (recortando o alargando dentro del tramo usable, nunca cambiando la
    velocidad) para que el corte caiga en un beat de la canción (o del audio original en réplicas) si hay uno a
    ≤ `beat_tolerance`. El drop sigue en el inicio del cuerpo (decisión del dueño).
 5. Rótulos 06B: el principal desde el fotograma 0 y el CTA justo en el corte del último plano; cualquier otro
    cambio de rótulo se pega al corte más cercano. Mini-zooms apagados por defecto (los virales no usan).
 6. Exporta como el pedido 81 y hace una autocomprobación del vídeo terminado (duración de planos, colas quietas
    o imágenes nuevas en los últimos 0,5 s de cada plano, cortes no previstos, rótulos fuera de corte). Si
    encuentra algo arreglable, recorta ese plano y vuelve a montar (máx. 2 veces). Escribe en `revision/`:
    plan-aplicado, autocomprobación, hoja de contactos y tiras de cada corte.
Los planes v0 (in/out fijos, sin `auto`) siguen funcionando igual que antes.
"""
import hashlib, json, math, re, subprocess, sys
from pathlib import Path

HOME = Path.home()
FFMPEG, FFPROBE = str(HOME / '.local/bin/ffmpeg'), str(HOME / '.local/bin/ffprobe')
TOOL = Path(__file__).resolve().parent
CACHE = TOOL                                     # analisis_clips/ y beatmaps/ (montar_auto.py puede cambiarla)
FONT = '/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/EDITOR/fonts/TikTok-Display-Medium.ttf'
LABEL_FONT = '/System/Library/Fonts/Helvetica.ttc'
W, H, FPS = 1080, 1920, 24
BOX = dict(x=112, y=287, w=886, h=318)          # caja invisible 06B sobre 1080x1920
EXPORT = dict(vcodec='libx264', profile='high', pix_fmt='yuv420p', crf=18, preset='fast', fps=FPS,
              acodec='aac', abitrate='192k', ar=44100, nota='igual que el pedido 81 (H.264 High, 24 fps, AAC 192k 44,1 kHz)')
MAX_HOOK_SPEED = 1.12
ANALISIS_VERSION = 'v1e'   # cambia si cambia el análisis de clips (invalida la caché analisis_clips/)
ZOOM_DEFAULTS = dict(enabled=False, amounts=[1.04, 1.06], drop_amount=1.07, attack=0.12, release=0.9,
                     min_gap=1.6, text_guard=0.6, max_text_chars=70, center=[0.5, 0.5],
                     start_after=0.3, end_margin=0.5, beat_tolerance=0.1, min_release=0.35,
                     scene_threshold=0.2, allow_on_replica=False)

# Patrón medido en el TOP 10 viral de EisWerk + referencias (docs/casos/referencias-edicion/patron-viral-eiswerk.md).
# Duraciones en segundos. Se pueden cambiar en el plan con "ritmo": {...}.
PATRON = dict(
    hook_hold_s=0.45,        # destape visible antes del corte (virales: 0,35–0,5 s, con la tela aún en el aire)
    hook_max_s=6.0,          # regla del dueño (gancho 1,2,3)
    reveal=(1.0, 1.5, 1.9),  # primer plano del cuerpo (unboxing / producto en mano): mín, objetivo, máx
    body=(0.6, 1.0, 1.5),    # planos de proceso
    final=(1.5, 2.5, 3.0),   # último plano (resultado + CTA)
    replica_first=(0.4, 1.2, 1.9),
    max_windows=4,           # ventanas por tramo usable: tantas como quepan con acción real (1–4)
    min_window_activity=0.45,  # una ventana «tiene acción» si su actividad media ≥ 45 % del p80 del clip
    ai_tail_margin_s=0.6,    # si el clip acaba en otra imagen (cola IA), el morph empieza ~0,5 s antes: margen
    min_piece_s=0.4,         # trozos usables más cortos se descartan (virales: plano mínimo ~0,4 s)
    jump_gap_s=0.3,          # salto mínimo entre dos ventanas del mismo tramo (que se lea como corte)
    beat_tolerance=0.22,     # cuánto se puede alargar/acortar un plano para que su corte caiga en beat (≤ ½ beat)
    tail_margin_frames=3,    # margen antes de un corte interno / cola degradada
    still_ratio=0.25,        # «quieto» = actividad < 25 % del p80 del clip
    tail_window_s=0.5,       # autocomprobación: últimos 0,5 s de cada plano
    cta_min_s=1.5,
)


def run(cmd):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'ERROR en {Path(str(cmd[0])).name}:\n{r.stderr[-3000:]}')
    return r.stdout + r.stderr


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def probe(path):
    return json.loads(run([FFPROBE, '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', path]))


_FRAMES = {}


def video_frames(path):
    if path not in _FRAMES:
        v = next(s for s in probe(path)['streams'] if s['codec_type'] == 'video')
        _FRAMES[path] = int(v['nb_read_frames'])
    return _FRAMES[path]


def r4(x):
    return round(float(x), 4)


# ---------------------------------------------------------------- análisis de clips (actividad, cortes, colas)
def gray_frames(path, width=96):
    """Todos los fotogramas en gris a `width` px de ancho (numpy float32, n×h×w)."""
    import numpy as np
    hgt = int(round(width * H / W / 2) * 2)
    raw = subprocess.run([FFMPEG, '-v', 'error', '-i', str(path), '-an', '-vf', f'scale={width}:{hgt},format=gray',
                          '-f', 'rawvideo', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, hgt, width).astype(np.float32)


def motion_curves(frames):
    """d1[i] = cambio medio entre el fotograma i-1 e i (detalle); dg[i] = lo mismo a 12 px (cambio de composición:
    saltos de cámara, imágenes nuevas, morphs). d1[0] = dg[0] = 0."""
    import numpy as np
    n = len(frames)
    d1 = np.zeros(n, np.float32)
    dg = np.zeros(n, np.float32)
    if n < 2:
        return d1, dg
    d1[1:] = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))
    k = frames.shape[2] // 12
    small = frames[:, :frames.shape[1] // k * k, :12 * k].reshape(n, frames.shape[1] // k, k, 12, k).mean(axis=(2, 4))
    dg[1:] = np.abs(np.diff(small, axis=0)).mean(axis=(1, 2))
    return d1, dg


def analyze_clip(path, cache_dir):
    """Tramos usables de un clip. Guarda/lee analisis_clips/<sha16>.json."""
    import numpy as np
    key = sha256(path)
    out = Path(cache_dir) / f'{key[:16]}-{ANALISIS_VERSION}.json'
    if out.exists():
        return json.loads(out.read_text())
    P = PATRON
    fr = gray_frames(path)
    n = len(fr)
    d1, dg = motion_curves(fr)
    med_dg = float(np.median(dg[1:])) if n > 2 else 0.0
    p80 = float(np.percentile(d1[1:], 80)) if n > 2 else 1.0
    # cortes / saltos: cambio de composición muy por encima de lo normal en el clip y aislado (1 fotograma)
    hard = []
    for i in range(1, n):
        loc = np.r_[dg[max(1, i - 6):i], dg[i + 1:i + 7]]
        base = float(np.median(loc)) if len(loc) else med_dg
        wide = np.r_[d1[max(1, i - 24):i - 1], d1[i + 2:i + 25]]
        lp80 = float(np.percentile(wide, 80)) if len(wide) > 8 else p80
        if dg[i] > max(6.0, 4.0 * base, 3.0 * med_dg) and d1[i] > max(6.0, 1.5 * lp80):
            hard.append(i)
    # tramos entre cortes
    bounds = [0] + hard + [n]
    segs, tails = [], []
    for a, b in zip(bounds[:-1], bounds[1:]):
        dur = (b - a) / FPS
        is_last = b == n
        kind = 'ok'
        if dur < 0.3:
            kind = 'destello'                         # flash / imagen suelta
        elif is_last and len(segs) and dur < 0.6:
            kind = 'cola_ia'                          # la IA acaba en otra imagen (p. ej. la foto del producto)
        if kind != 'ok':
            tails.append(dict(desde_f=a, hasta_f=b, tipo=kind, dur_s=r4(dur)))
            continue
        ua, ub = a + (1 if a else 0), b - (P['tail_margin_frames'] if b < n else 0)
        # cola quieta al final del tramo
        seg_p80 = float(np.percentile(d1[ua + 1:ub], 80)) if ub - ua > 4 else p80
        thr = max(0.35, P['still_ratio'] * seg_p80)   # umbral del propio tramo (no del clip entero)
        j = ub
        while j - 1 > ua + 6 and d1[j - 1] < thr:
            j -= 1
        if ub - j >= 4:
            tails.append(dict(desde_f=j, hasta_f=ub, tipo='cola_quieta', dur_s=r4((ub - j) / FPS)))
            ub = j
        # inicio quieto (se permite, pero puntúa poco)
        s = ua
        while s < ub - 6 and d1[s + 1] < thr:
            s += 1
        segs.append(dict(desde_f=a, hasta_f=b, usable=[int(ua), int(ub)], inicio_quieto_hasta_f=int(s),
                         dur_usable_s=r4((ub - ua) / FPS)))
    # cola IA: el último tramo bueno termina `ai_tail_margin_s` antes (la transición a la otra imagen empieza antes)
    if segs and any(t['tipo'] in ('cola_ia', 'destello') and t['hasta_f'] == n for t in tails):
        last = segs[-1]
        lim = min(t['desde_f'] for t in tails if t['hasta_f'] == n or t['desde_f'] >= last['hasta_f'])
        new_ub = min(last['usable'][1], lim - int(round(P['ai_tail_margin_s'] * FPS)))
        if new_ub < last['usable'][1]:
            tails.append(dict(desde_f=new_ub, hasta_f=last['usable'][1], tipo='transicion_a_cola_ia',
                              dur_s=r4((last['usable'][1] - new_ub) / FPS)))
            last['usable'][1] = new_ub
            last['dur_usable_s'] = r4((new_ub - last['usable'][0]) / FPS)
    short = [t for t in segs if t['usable'][1] - t['usable'][0] < P['min_piece_s'] * FPS]
    for t in short:
        tails.append(dict(desde_f=t['desde_f'], hasta_f=t['hasta_f'], tipo='trozo_corto', dur_s=t['dur_usable_s']))
    segs = [t for t in segs if t not in short]
    data = dict(path=str(path), sha256=key, frames=n, p80_actividad=r4(p80), mediana_cambio_global=r4(med_dg),
                cortes_internos_f=hard, tramos=segs, colas_descartadas=tails,
                actividad=[round(float(x), 2) for x in d1], cambio_global=[round(float(x), 2) for x in dg],
                metodo='gris 96 px; d1 = cambio medio entre fotogramas; cambio global a 12 px; corte = pico de '
                       'cambio global ≥4× su entorno; cola_ia = último tramo < 0,6 s tras un corte; cola_quieta = '
                       f"actividad < {P['still_ratio']}×p80 al final del tramo")
    Path(cache_dir).mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data))
    return data


# ---------------------------------------------------------------- elección de ventanas (in/out automáticos)
def choose_windows(act, usable, k, lens, p80, quiet_until, gap, anchor_end=False):
    """Coloca k ventanas (longitudes `lens`, en fotogramas) dentro de `usable` [a, b), en orden y separadas por
    ≥ gap fotogramas, maximizando la actividad (normalizada y con tope) y premiando terminar con la acción en
    marcha. Si anchor_end, la última ventana termina en b (el resultado al final del clip)."""
    import numpy as np
    a, b = usable
    x = np.minimum(np.asarray(act, np.float32) / max(p80, 0.3), 1.5)
    cs = np.r_[0, np.cumsum(x)]

    def score(s, L):
        e = s + L
        mean = (cs[e] - cs[s]) / L
        t = max(2, L // 3)
        end = (cs[e] - cs[e - t]) / t
        sc = mean + 0.35 * min(end / (mean + 1e-6), 1.3)
        if s < quiet_until:
            sc -= 0.3 * (quiet_until - s) / L
        return sc
    total = sum(lens) + gap * (k - 1)
    if total > b - a:                                   # no caben: se acortan proporcionalmente
        f = (b - a - gap * (k - 1)) / sum(lens)
        lens = [max(6, int(L * f)) for L in lens]
    # programación dinámica sobre la posición de inicio de cada ventana
    best = {}                                           # (j, s) -> (score, prev_s)
    for j, L in enumerate(lens):
        rest = sum(lens[j + 1:]) + gap * (k - 1 - j)
        lo = a if j == 0 else a + sum(lens[:j]) + gap * j
        hi = b - L - rest
        if anchor_end and j == k - 1:
            lo = hi = b - L
        for s in range(lo, hi + 1):
            sc = score(s, L)
            if j == 0:
                best[(0, s)] = (sc, None)
            else:
                cands = [(best[(j - 1, p)][0], p) for p in range(a, s - gap - lens[j - 1] + 1) if (j - 1, p) in best]
                if not cands:
                    continue
                pv, p = max(cands)
                best[(j, s)] = (pv + sc, p)
    finals = [(v[0], s) for (j, s), v in best.items() if j == k - 1]
    if not finals:
        return [[a, min(b, a + lens[0])]]
    _, s = max(finals)
    out = []
    for j in range(k - 1, -1, -1):
        out.append([s, s + lens[j]])
        s = best[(j, s)][1]
    return out[::-1]


def section_len(section, P):
    lo, tgt, hi = P[section]
    return int(round(lo * FPS)), int(round(tgt * FPS)), int(round(hi * FPS))


def decide_windows(an, piece, P):
    """Cuántas ventanas saca un tramo: el mayor k (≤ max_windows) que cabe con planos de cuerpo y en el que
    TODAS las ventanas tienen acción real (actividad media ≥ min_window_activity × p80). Así un plano largo con
    varias acciones (verter, tapar, toppings, sirope) da varias ventanas y uno con un arranque quieto da una."""
    import numpy as np
    ua, ub = piece['usable']
    L = section_len('body', P)[1]
    gap = int(P['jump_gap_s'] * FPS)
    kmax = max(1, min(P['max_windows'], (ub - ua + gap) // (L + gap)))
    act = np.asarray(an['actividad'], np.float32)
    p80 = max(an['p80_actividad'], 0.3)
    for k in range(kmax, 1, -1):
        wins = choose_windows(an['actividad'], [ua, ub], k, [L] * k, an['p80_actividad'],
                              piece.get('inicio_quieto_hasta_f', 0), gap)
        if all(float(act[a:b].mean()) / p80 >= P['min_window_activity'] for a, b in wins):
            return k
    return 1


def plan_auto_shots(clips, analyses, P, vetos):
    """Convierte los clips auto en una lista de planos (in/out en fotogramas fuente). Devuelve [(clip, in, out, sección, nota)]."""
    import numpy as np
    # 1) cuántas ventanas por tramo
    work = []
    for ci, c in enumerate(clips):
        if c['role'] == 'hook' or not c.get('auto'):
            work.append((ci, None, None))
            continue
        an = analyses[ci]
        if c.get('ventanas'):                          # in/out a mano (segundos del clip)
            for w in c['ventanas']:
                work.append((ci, dict(usable=[int(round(w[0] * FPS)), int(round(w[1] * FPS))], manual=True,
                                      inicio_quieto_hasta_f=0), 1))
            continue
        for t in an['tramos']:
            pieces = [list(t['usable'])]
            for va, vb in vetos.get(ci, []):            # zonas vetadas por la autocomprobación: se parte el tramo
                nxt = []
                for pa, pb in pieces:
                    if va < pb and vb > pa:
                        nxt += [x for x in ([pa, va], [vb, pb]) if x[1] - x[0] >= P['min_piece_s'] * FPS]
                    else:
                        nxt.append([pa, pb])
                pieces = nxt
            for ua, ub in pieces:
                if ub - ua < P['min_piece_s'] * FPS:
                    continue
                piece = dict(t, usable=[ua, ub])
                k = c.get('ventanas_por_tramo') or decide_windows(an, piece, P)
                work.append((ci, piece, k))
    # 2) secciones en orden global
    n_hook = sum(1 for c in clips if c['role'] == 'hook')
    flat = []
    for ci, t, k in work:
        if t is None:
            flat.append((ci, None, 'hook' if clips[ci]['role'] == 'hook' else 'fijo'))
        else:
            for _ in range(k):
                flat.append((ci, t, None))
    first_auto = next((i for i, f in enumerate(flat) if f[1] is not None), None)
    sections = []
    for i, (ci, t, s) in enumerate(flat):
        if s:
            sections.append(s)
        elif i == len(flat) - 1:
            sections.append('final')
        elif i == first_auto:
            sections.append('reveal' if n_hook else 'replica_first')
        else:
            sections.append('body')
    # 3) ventanas por tramo
    shots, i = [], 0
    while i < len(flat):
        ci, t, s = flat[i]
        if t is None:
            shots.append(dict(clip=ci, section=sections[i]))
            i += 1
            continue
        j = i
        while j < len(flat) and flat[j][1] is t:
            j += 1
        secs = sections[i:j]
        if t.get('manual'):
            shots.append(dict(clip=ci, in_frame=t['usable'][0], out_frame=t['usable'][1], section=secs[0],
                              usable=t['usable'], nota='ventana fijada en el plan'))
        else:
            an = analyses[ci]
            lens = [section_len(sc, P)[1] for sc in secs]
            wins = choose_windows(an['actividad'], t['usable'], len(secs), lens, an['p80_actividad'],
                                  t.get('inicio_quieto_hasta_f', 0), int(P['jump_gap_s'] * FPS),
                                  anchor_end=secs[-1] == 'final')
            for (a, b), sc in zip(wins, secs):
                shots.append(dict(clip=ci, in_frame=int(a), out_frame=int(b), section=sc, usable=t['usable'],
                                  nota=f"auto: tramo usable {t['usable'][0]}–{t['usable'][1]} f"))
        i = j
    return shots


def snap_ends_to_beats(shots, beats, P, t0, fixed_until=0):
    """Ajusta la duración de cada plano auto (dentro de su tramo usable y de mín/máx de su sección) para que el corte
    caiga en un beat a ≤ beat_tolerance (y nunca más de medio beat). Para acortar recorta primero el INICIO (quita
    preparación y conserva el final de la acción); para alargar usa primero el final si queda acción usable y si no
    adelanta el inicio. Nunca cambia la velocidad. Los planos anteriores a `fixed_until` no se tocan (el drop
    cae al empezar ese plano). Devuelve el registro."""
    log, t = [], t0
    gaps = sorted(b - a for a, b in zip(beats, beats[1:]) if b > a)
    period = gaps[len(gaps) // 2] if gaps else 0.5          # periodo típico del beat (mediana)
    tol = min(P['beat_tolerance'], 0.5 * period + 0.5 / FPS)
    for k, s in enumerate(shots):
        if s['section'] in ('hook', 'fijo') or k == len(shots) - 1 or k < fixed_until:
            n_src = s.get('out_frame', video_frames(s['path'])) - s.get('in_frame', 0)
            t += (s.get('out_frames') or round(n_src / float(s.get('speed', 1.0)))) / FPS
            continue
        n = s['out_frame'] - s['in_frame']
        lo, _, hi = section_len(s['section'], P)
        if s.get('nota', '').startswith('ventana fijada'):
            lo, hi = int(n * 0.8), int(n * 1.2)
        ua, ub = s['usable']
        prev_out = max([x['out_frame'] + 6 for x in shots[:k] if x.get('clip') == s['clip'] and 'usable' in x
                        and x['usable'] == s['usable']] or [ua])
        next_in = min([x['in_frame'] - 6 for x in shots[k + 1:] if x.get('clip') == s['clip'] and 'usable' in x
                       and x['usable'] == s['usable']] or [ub])
        end = t + n / FPS
        best = None
        for b in sorted((b for b in beats if abs(b - end) <= tol), key=lambda b: abs(b - end)):
            m = int(round((b - t) * FPS))
            if not lo <= m <= hi:
                continue
            d = m - n
            a2, b2 = s['in_frame'], s['out_frame']
            if d < 0:                                   # acortar: primero el inicio
                a2 += -d
            elif d > 0:                                 # alargar: primero el final, luego el inicio
                ext = min(d, max(0, min(ub, next_in) - b2))
                b2 += ext
                a2 -= d - ext
            if a2 < max(ua, prev_out) or b2 > min(ub, next_in) or b2 - a2 != m:
                continue
            best = (b, a2, b2)
            break
        if best:
            b, a2, b2 = best
            log.append(dict(plano=k, corte_previsto_s=r4(end), beat_s=r4(b), fotogramas=(b2 - a2) - n,
                            in_movido=a2 - s['in_frame'], out_movido=b2 - s['out_frame']))
            s['in_frame'], s['out_frame'], s['en_beat'] = a2, b2, True
            n = b2 - a2
        else:
            log.append(dict(plano=k, corte_previsto_s=r4(end), beat_s=None,
                            motivo='sin beat alcanzable sin salir del tramo usable ni de la duración del patrón'))
        t += n / FPS
    return log


def shot_frames(s):
    """Fotogramas de salida de un plano antes de ajustarlo al beat."""
    n_src = s.get('out_frame', video_frames(s['path'])) - s.get('in_frame', 0)
    return int(s.get('out_frames') or round(n_src / float(s.get('speed', 1.0))))


# ---------------------------------------------------------------- beats
def beat_map(audio, work, cache_dir, anchor=None):
    """Beats con librosa. Se guarda por sha256 del audio en beatmaps/ y se reutiliza."""
    key = sha256(audio)[:16]
    out = Path(cache_dir) / f'{key}.json'
    if out.exists():
        data = json.loads(out.read_text())
    else:
        import librosa
        import numpy as np
        wav = work / f'beats-{key}.wav'
        run([FFMPEG, '-v', 'error', '-y', '-i', audio, '-vn', '-ac', '1', '-ar', '22050', wav])
        y, sr = librosa.load(str(wav), sr=22050, mono=True)
        env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, frames = librosa.beat.beat_track(onset_envelope=env, sr=sr, tightness=100)
        beats = librosa.frames_to_time(frames, sr=sr)
        strength = env[np.clip(frames, 0, len(env) - 1)] / (env.max() or 1)
        onsets = librosa.onset.onset_detect(onset_envelope=env, sr=sr, units='time')
        data = dict(audio=str(audio), sha256=sha256(audio), duration=r4(len(y) / sr),
                    tempo_bpm=r4(np.atleast_1d(tempo)[0]), beats=[r4(b) for b in beats],
                    beat_strength=[r4(s) for s in strength], onsets=[r4(o) for o in onsets],
                    method=f'librosa {librosa.__version__} beat_track(tightness=100) + onset_strength')
        Path(cache_dir).mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(data, indent=1))
        wav.unlink()
    beats = data['beats']
    if beats:
        if anchor is not None:
            ref = min(range(len(beats)), key=lambda i: abs(beats[i] - anchor))
            phase = ref % 4
        else:
            phase = max(range(4), key=lambda p: sum(data['beat_strength'][p::4]))
        data['downbeats'] = beats[phase::4]
    else:
        data['downbeats'] = []
    data['file'] = str(out)
    return data


# ---------------------------------------------------------------- línea de tiempo
def build_timeline(shots):
    segs, t = [], 0
    for i, c in enumerate(shots):
        total = c.get('_src_frames') or video_frames(c['path'])
        c['_src_frames'] = total
        a, b = int(c.get('in_frame', 0)), int(c.get('out_frame', total))
        if not 0 <= a < b <= total:
            sys.exit(f'Plano {i}: in/out fuera de rango (0..{total})')
        n_src = b - a
        n_out = int(c.get('out_frames') or round(n_src / float(c.get('speed', 1.0))))
        speed = n_src / n_out
        limit = MAX_HOOK_SPEED if c['role'] == 'hook' else 1.0
        if speed > limit + 1e-9 or speed < 1 - 1e-9:
            sys.exit(f'Plano {i} ({c["role"]}): velocidad {speed:.4f} no permitida (máx {limit}, nunca más lento)')
        fmap = [a + min(n_src - 1, int((k + 0.5) * speed)) for k in range(n_out)]
        segs.append(dict(index=i, clip=c.get('clip', i), role=c['role'], section=c.get('section', c['role']),
                         path=c['path'], sha256=c.get('_sha') or sha256(c['path']), src_frames=total,
                         in_frame=a, out_frame=b, speed=r4(speed), out_first=t, out_end=t + n_out,
                         start_s=r4(t / FPS), end_s=r4((t + n_out) / FPS), dur_s=r4(n_out / FPS),
                         nota=c.get('nota', ''), en_beat=c.get('en_beat', False),
                         dropped_src_frames=sorted(set(range(a, b)) - set(fmap)), _map=fmap))
        c['_sha'] = segs[-1]['sha256']
        t += n_out
    return segs, t


def out_time_of(segs, clip, src_frame):
    for s in segs:
        if s['clip'] == clip and s['in_frame'] <= src_frame < s['out_frame']:
            k = next(k for k, f in enumerate(s['_map']) if f >= src_frame)
            return (s['out_first'] + k) / FPS
    s = next(s for s in segs if s['clip'] == clip)
    return s['out_first'] / FPS


def scene_cuts(path, threshold):
    log = run([FFMPEG, '-hide_banner', '-i', path, '-an', '-vf', f"select='gt(scene,{threshold})',showinfo", '-f', 'null', '-'])
    return [float(m.group(1)) for m in re.finditer(r'pts_time:([0-9.]+)', log)]


# ---------------------------------------------------------------- textos 06B
def wrap(text, font=FONT):
    from rotulos_layout import balanced_lines, PillowFont
    try:
        from texto06b import Fuente
        measured = Fuente(font)
    except ImportError:
        measured = PillowFont(font)
    return balanced_lines(measured, text)


def text_timing(texts, cuts, dur, P):
    """Rótulos v1: «main» desde 0 hasta el CTA; «cta» desde el corte del último plano. Si el plan trae tiempos,
    cada cambio se pega al corte más cercano. Devuelve [(start, end, text, motivo)]."""
    out = []
    if not texts:
        return out
    last_cut = cuts[-1] if cuts else 0.0
    if dur - last_cut < P['cta_min_s']:
        last_cut = max([c for c in cuts if dur - c >= P['cta_min_s']] or [0.0])
    starts = []
    for i, t in enumerate(texts):
        if t.get('role') == 'cta':
            starts.append((last_cut, 'CTA en el corte del último plano'))
        elif i == 0 or t.get('role') == 'main':
            starts.append((0.0, 'rótulo principal desde el fotograma 0'))
        else:
            c = min(cuts, key=lambda c: abs(c - float(t['start']))) if cuts else float(t['start'])
            starts.append((c, f"pegado al corte más cercano a {t['start']}"))
    for i, t in enumerate(texts):
        s, why = starts[i]
        e = starts[i + 1][0] if i + 1 < len(texts) else dur
        if e - s > 1e-6:
            out.append(dict(t, start=r4(s), end=r4(e), text=t['text'], lines=t.get('lines'), motivo=why))
    return out


def render_texts(cues, dur, work, font):
    # La misma preparación y dibujo 06B también en Mac; evita el autoencogido del Swift.
    from montar_auto import rotulos_06b, rotulos_pillow
    try:
        import texto06b
    except ImportError:
        return rotulos_pillow(cues, dur, work, font)
    return rotulos_06b(cues, dur, work, font)


# ---------------------------------------------------------------- mini-zooms (apagados por defecto)
def plan_zooms(z, dur, cuts, beats, downbeats, cues, forced):
    def blocked(t):
        for c in cues:
            if c['start'] <= t < c['start'] + z['text_guard']:
                return 'texto recién aparecido'
            if t < c['start'] < t + z['attack'] + z['text_guard']:
                return 'texto a punto de aparecer'
            if c['start'] <= t < c['end'] and len(c['text']) > z['max_text_chars']:
                return 'texto largo en pantalla'
        return None
    cand = [(t, 'drop', 3) for t in forced]
    for t in cuts:
        on_beat = any(abs(t - b) <= z['beat_tolerance'] for b in beats)
        cand.append((t, 'corte en beat' if on_beat else 'corte', 2 + on_beat))
    cand += [(b, 'compás', 1) for b in downbeats]
    zooms, skipped = [], []
    for t, kind, _ in sorted(cand, key=lambda c: (-c[2], c[0])):
        if not z['start_after'] <= t <= dur - z['end_margin'] or any(abs(t - q['start']) < z['min_gap'] for q in zooms):
            continue
        why = blocked(t) if kind != 'drop' else None
        nxt = min([k for k in cuts if k > t + 1e-3] + [dur])
        release = min(z['release'], nxt - t - z['attack'] - 1.0 / FPS)
        if not why and release < z['min_release']:
            why = 'no cabe antes del siguiente corte'
        if why:
            skipped.append(dict(t=r4(t), motivo=why)); continue
        peak = z['drop_amount'] if kind == 'drop' else z['amounts'][1 if 'corte' in kind else 0]
        zooms.append(dict(start=r4(t), peak_zoom=peak, attack=z['attack'], release=r4(release),
                          end=r4(t + z['attack'] + release), center=z['center'], motivo=kind))
    zooms.sort(key=lambda q: q['start'])
    return zooms, skipped


def zoom_expr(zooms):
    terms = []
    for q in zooms:
        t0, t1, t2, a, r = q['start'], q['start'] + q['attack'], q['end'], q['attack'], q['release']
        terms.append(f"{q['peak_zoom'] - 1:.4f}*if(lt(it,{t0:.4f}),0,if(lt(it,{t1:.4f}),sin(PI/2*(it-{t0:.4f})/{a:.4f}),"
                     f"if(lt(it,{t2:.4f}),0.5*(1+cos(PI*(it-{t1:.4f})/{r:.4f})),0)))")
    return '1+' + '+'.join(terms)


# ---------------------------------------------------------------- audio con canción
def loudness(path, af=''):
    log = run([FFMPEG, '-hide_banner', '-nostats', '-i', path, '-vn', '-af', (af + ',' if af else '') + 'ebur128', '-f', 'null', '-'])
    return float(re.findall(r'I:\s+(-?[0-9.]+) LUFS', log)[-1])


def max_volume(path, af=''):
    # astats (no volumedetect): volumedetect no informa de picos por encima de 0 dBFS en audio float.
    log = run([FFMPEG, '-hide_banner', '-nostats', '-i', path, '-vn', '-af',
               (af + ',' if af else '') + 'aformat=sample_fmts=dbl,astats=measure_perchannel=none:measure_overall=Peak_level',
               '-f', 'null', '-'])
    return float(re.findall(r'Peak level dB:\s+(-?[0-9.]+|-inf)', log)[-1])


SONG_SHORT_TOLERANCE_S = 2.0


def build_song_mix(au, segs, dur, t_prod, work):
    song = au['song']
    offset = float(au['drop']) - t_prod                    # inicio del fragmento = drop - t_producto
    song_dur = float(probe(song)['format']['duration'])
    # Hasta 2 s de diferencia se rellenan con silencio (apad): la canción personalizada dura lo que la
    # referencia y el clip de Genjutsu puede salir algo más largo (tarjeta 89). Más que eso es un fallo real.
    if song_dur - offset < dur - SONG_SHORT_TOLERANCE_S:
        sys.exit('La canción se acaba antes que el vídeo con este desfase')
    gm = float(au.get('music_gain_db', 0))
    start = f'atrim=start={offset:.6f},' if offset >= 0 else f'adelay={int(round(-offset * 1000))}:all=1,'
    graph = [f'[0:a]aresample=44100,aformat=channel_layouts=stereo,{start}asetpts=PTS-STARTPTS,'
             f'apad,atrim=end={dur:.6f},volume={gm}dB[m]']
    inputs, info = ['-i', song], dict(song=song, song_sha256=sha256(song), drop_saved_s=float(au['drop']),
                                      product_shown_s=r4(t_prod), song_offset_s=r4(offset),
                                      music_gain_db=gm, music_constant=True, ducking=False)
    v = au.get('voice')
    if v:
        s = next(x for x in segs if x['clip'] == v.get('clip', 0))
        v_from = max(float(v['from']), s['in_frame'] / FPS)       # la voz empieza donde empieza el gancho recortado
        trim = f"atrim=start={v_from}:end={v['to']},asetpts=PTS-STARTPTS"
        lufs = loudness(v['path'], trim)
        gv = float(v.get('target_lufs', -14)) - lufs
        at = s['out_first'] / FPS + (v_from - s['in_frame'] / FPS) / s['speed']
        tempo = f",atempo={s['speed']:.6f}" if s['speed'] != 1 else ''
        graph.append(f"[1:a]aresample=44100,aformat=channel_layouts=stereo,{trim}{tempo},volume={gv:.2f}dB,"
                     f"adelay={int(round(at * 1000))}:all=1[v]")
        graph.append('[m][v]amix=inputs=2:normalize=0:duration=first[mix]')
        inputs += ['-i', v['path']]
        v_end = at + (float(v['to']) - v_from) / s['speed']
        spill = v_end - s['out_end'] / FPS
        info['voice'] = dict(path=v['path'], sha256=sha256(v['path']), source_from=r4(v_from), source_to=v['to'],
                             speed=s['speed'], placed_at_s=r4(at), ends_at_s=r4(v_end),
                             spill_into_body_s=r4(max(0.0, spill)), measured_lufs=lufs, gain_db=r4(gv),
                             target_lufs=v.get('target_lufs', -14))
        if spill > float(v.get('max_spill_s', 0.6)) + 1e-6:
            sys.exit(f'La voz del gancho sigue {spill:.2f} s después del corte (máx {v.get("max_spill_s", 0.6)})')
    else:
        graph.append('[m]anull[mix]')
    mix = work / 'mezcla.wav'
    run([FFMPEG, '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(graph), '-map', '[mix]',
         '-c:a', 'pcm_f32le', '-ar', '44100', mix])
    peak_db = max_volume(mix)
    limit = float(au.get('peak_limit', 0.94))
    master = min(0.0, 20 * math.log10(limit) - peak_db)    # única ganancia global anticlip
    info.update(mix_peak_dbfs_before=peak_db, peak_limit=limit, master_gain_db=r4(master))
    return mix, master, info


def measure_song_offset(out, song, expected, t_from, t_to):
    """Comprobación independiente del desfase de la canción por correlación FFT (16 kHz)."""
    import numpy as np
    sr = 16000

    def pcm(path, ss, t):
        raw = subprocess.run([FFMPEG, '-v', 'error', '-ss', f'{ss:.4f}', '-t', f'{t:.4f}', '-i', str(path), '-vn',
                              '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True).stdout
        return np.frombuffer(raw, dtype=np.float32)
    seg = pcm(out, t_from, t_to - t_from)
    ref_start = max(0.0, expected + t_from - 1.0)
    ref = pcm(song, ref_start, t_to - t_from + 2.0)
    n = 1 << int(np.ceil(np.log2(len(ref) + len(seg))))
    corr = np.fft.irfft(np.fft.rfft(ref, n) * np.conj(np.fft.rfft(seg, n)), n)[:len(ref) - len(seg) + 1]
    lag = int(np.argmax(corr))
    return ref_start + lag / sr - t_from


# ---------------------------------------------------------------- autocomprobación
def self_check(out, segs, cues, beats, P, total):
    """Mira el vídeo terminado: duración de cada plano frente al patrón, colas quietas o imágenes nuevas en los
    últimos 0,5 s de cada plano, cortes que no están en el plan y rótulos que no cambian en un corte."""
    import numpy as np
    fr = gray_frames(out)
    d1, dg = motion_curves(fr)
    cuts = [s['out_first'] for s in segs[1:]]
    p80_all = float(np.percentile(d1[1:], 80))
    planos, avisos, vetos = [], [], {}
    tw = int(round(P['tail_window_s'] * FPS))
    for k, s in enumerate(segs):
        a, b = s['out_first'], s['out_end']
        dur = (b - a) / FPS
        sec = s['section']
        mx = P[sec][2] if sec in ('reveal', 'body', 'final', 'replica_first') else P['hook_max_s']
        body = d1[a + 1:b]
        p80 = float(np.percentile(body, 80)) if len(body) > 4 else p80_all
        tail = d1[max(a + 1, b - tw):b]
        tailg = dg[max(a + 1, b - tw):b]
        loc_g = float(np.median(dg[a + 1:b])) if b - a > 3 else 0.0
        fila = dict(plano=k, seccion=sec, desde_s=r4(a / FPS), hasta_s=r4(b / FPS), dur_s=r4(dur), max_patron_s=mx,
                    actividad_media=r4(float(body.mean()) if len(body) else 0),
                    actividad_ultimos_05s=r4(float(tail.mean()) if len(tail) else 0),
                    en_beat=s.get('en_beat', False))
        problemas = []
        if dur > mx + 1e-6:
            problemas.append(f'dura {dur:.2f} s, más que el máximo del patrón ({mx} s)')
        if sec != 'hook' and len(tail) >= 4 and float(tail.mean()) < max(0.3, P['still_ratio'] * p80):
            problemas.append('cola quieta en los últimos 0,5 s')
        if sec != 'hook' and len(tailg):
            j = int(np.argmax(tailg))
            if tailg[j] > max(6.0, 4.0 * loc_g) and d1[max(a + 1, b - tw) + j] > 6.0:
                problemas.append(f'salto/imagen nueva a {((max(a + 1, b - tw) + j) / FPS):.3f} s (últimos 0,5 s del plano)')
        fila['problemas'] = problemas
        planos.append(fila)
        if problemas and s['role'] != 'hook':
            # veto en fotogramas fuente: desde el punto problemático hasta el final del plano
            if any('cola quieta' in p for p in problemas):
                cut_from = b - tw
            elif any('salto' in p for p in problemas):
                cut_from = max(a + 1, b - tw) + j - 2
            else:
                cut_from = a + int(mx * FPS)
            src = s['_map'][max(0, min(len(s['_map']) - 1, cut_from - a))]
            vetos.setdefault(s['clip'], []).append([int(src), int(s['out_frame'])])
            avisos.append(f"plano {k} ({sec}): " + '; '.join(problemas))
    # cortes no previstos dentro de un plano
    det = [round(t * FPS) for t in scene_cuts(out, 0.18)]
    def spike(f):
        loc = np.r_[dg[max(1, f - 6):f], dg[f + 1:f + 7]]
        return f < len(dg) and dg[f] > max(6.0, 4.0 * float(np.median(loc) if len(loc) else 0))
    extra = [f for f in det if all(abs(f - c) > 1 for c in cuts) and f > 1 and spike(f)]
    for f in extra:
        s = next(x for x in segs if x['out_first'] <= f < x['out_end'])
        avisos.append(f'corte no previsto a {f / FPS:.3f} s dentro del plano {s["index"]} (posible salto o morph)')
    # rótulos
    rot = []
    for c in cues[1:]:
        f = round(c['start'] * FPS)
        on_cut = any(abs(f - x) <= 1 for x in cuts)
        on_beat = any(abs(c['start'] - b) <= 0.06 for b in beats)
        rot.append(dict(t=c['start'], texto=c['text'][:40], en_corte=on_cut, en_beat=on_beat))
        if not (on_cut or on_beat) and not c.get('split_continuation'):
            avisos.append(f"rótulo «{c['text'][:30]}…» cambia a {c['start']:.3f} s, fuera de corte y de beat")
    cut_s = [c / FPS for c in cuts]
    dist = [r4(min((abs(c - b) for b in beats), default=9)) for c in cut_s]
    return dict(planos=planos, cortes_s=[r4(c) for c in cut_s], distancia_corte_beat_s=dist,
                cortes_en_beat=sum(d <= 0.045 for d in dist), cortes_detectados_no_previstos_s=[r4(f / FPS) for f in extra],
                rotulos=rot, avisos=avisos, ok=not avisos, _vetos=vetos,
                metodo='fotogramas del vídeo final en gris 96 px; cola quieta = actividad media de los últimos 0,5 s '
                       f"< {P['still_ratio']}×p80 del plano; salto = pico de cambio global ≥4× la mediana del plano; "
                       'cortes no previstos = detector de escena de ffmpeg 0,18 a >1 fotograma de un corte del plan')


def contact_sheets(out, rev, stem, dur, cuts):
    sheet = rev / f'{stem} - contactos.jpg'
    rows = math.ceil(dur * 2 / 6)
    run([FFMPEG, '-v', 'error', '-y', '-i', out, '-vf',
         f"fps=2,scale=240:427,drawtext=fontfile={LABEL_FONT}:text='%{{pts\\:hms}}':x=6:y=6:fontsize=22:"
         f"fontcolor=yellow:box=1:boxcolor=black@0.6,tile=6x{rows}", '-frames:v', '1', '-q:v', '3', sheet])
    # tiras de cada corte: 0,5 s antes y 0,25 s después a 8 fps (se ve cómo acaba cada plano)
    strips = rev / f'{stem} - cortes.jpg'
    tmp = rev / f'.{stem}-tiras'
    tmp.mkdir(exist_ok=True)
    files = []
    for k, c in enumerate(cuts + [dur]):
        t0 = max(0.0, c - 0.5)
        f = tmp / f'{k:02d}.jpg'
        run([FFMPEG, '-v', 'error', '-y', '-ss', f'{t0:.3f}', '-t', '0.75', '-copyts', '-i', out, '-vf',
             f"fps=8,scale=160:284,drawtext=fontfile={LABEL_FONT}:text='%{{pts\\:hms}}':x=3:y=3:fontsize=15:"
             f"fontcolor=yellow:box=1:boxcolor=black@0.6,tile=6x1:padding=2:color=red", '-frames:v', '1', f])
        files.append(f)
    ins = sum((['-i', str(f)] for f in files), [])
    run([FFMPEG, '-v', 'error', '-y', *ins, '-filter_complex',
         ''.join(f'[{i}:v]scale=970:-2[r{i}];' for i in range(len(files))) +
         ''.join(f'[r{i}]' for i in range(len(files))) + f'vstack=inputs={len(files)}', '-q:v', '4', strips]
        if len(files) > 1 else [FFMPEG, '-v', 'error', '-y', '-i', files[0], strips])
    for f in files:
        f.unlink()
    tmp.rmdir()
    return sheet, strips


# ---------------------------------------------------------------- render
def render(segs, cues, zooms, z, au, plan, work, out, dur, t_prod):
    inputs, graph = [], []
    for s in segs:
        inputs += ['-i', s['path']]
        keep = set(f - s['in_frame'] for f in s['_map'])
        drop = [n for n in range(s['out_frame'] - s['in_frame']) if n not in keep]
        sel = ("select='not(" + '+'.join(f'eq(n,{n})' for n in drop) + ")'," if drop else '')
        graph.append(f"[{s['index']}:v]trim=start_frame={s['in_frame']}:end_frame={s['out_frame']},"
                     f"setpts=PTS-STARTPTS,{sel}setpts=N/({FPS}*TB),scale={W}:{H}:flags=lanczos,setsar=1,format=yuv420p[s{s['index']}]")
    graph.append(''.join(f"[s{s['index']}]" for s in segs) + f'concat=n={len(segs)}:v=1:a=0[cat]')
    last = 'cat'
    if zooms:
        cx, cy = z['center']
        graph.append(f"[cat]scale={2 * W}:{2 * H}:flags=lanczos,zoompan=z='{zoom_expr(zooms)}':"
                     f"x='(iw-iw/zoom)*{cx}':y='(ih-ih/zoom)*{cy}':d=1:s={W}x{H}:fps={FPS},setsar=1[zm]")
        last = 'zm'
    for k, c in enumerate(cues):
        inputs += ['-i', c['png']]
        graph.append(f"[{last}][{len(segs) + k}:v]overlay={BOX['x']}:{BOX['y']}:"
                     f"enable='gte(t,{c['start']})*lt(t,{c['end']})'[t{k}]")
        last = f't{k}'
    graph.append(f'[{last}]format=yuv420p[vout]')
    vargs = ['-c:v', EXPORT['vcodec'], '-profile:v', EXPORT['profile'], '-pix_fmt', EXPORT['pix_fmt'],
             '-crf', str(EXPORT['crf']), '-preset', EXPORT['preset'], '-r', str(FPS)]
    aidx = len(segs) + len(cues)
    if au['mode'] == 'original':
        s = segs[0]
        whole = len(segs) == 1 and s['speed'] == 1 and not s['in_frame'] and s['out_frame'] == s['src_frames']
        if whole:
            aargs, info = ['-map', '0:a:0', '-c:a', 'copy'], dict(mode='original', note='pista original copiada sin recodificar ni tocar')
        else:
            # Réplica recortada (v1): el audio original sigue CONTINUO desde el primer fotograma usado (es la
            # canción de la referencia), recortado a la nueva duración con un fundido de 0,15 s al final.
            if len({x['path'] for x in segs}) != 1:
                sys.exit('Audio original con varios clips distintos: no soportado')
            a0 = s['in_frame'] / FPS
            aargs = ['-map', '0:a:0', '-af', f'atrim=start={a0:.6f},asetpts=PTS-STARTPTS,apad,atrim=end={dur:.6f},'
                     f'afade=t=out:st={max(0, dur - 0.15):.4f}:d=0.15',
                     '-c:a', EXPORT['acodec'], '-b:a', EXPORT['abitrate'], '-ar', str(EXPORT['ar'])]
            info = dict(mode='original_continuo', desde_s=r4(a0), fundido_final_s=0.15,
                        note='audio original continuo (sin saltos) bajo los cortes; nivel sin tocar')
    elif au['mode'] == 'silencio':
        # Sin canción y sin audio en los clips (los de Seedance salen mudos): pista de silencio.
        inputs += ['-f', 'lavfi', '-i', f"anullsrc=r={EXPORT['ar']}:cl=stereo"]
        aargs = ['-map', f'{aidx}:a', '-c:a', EXPORT['acodec'], '-b:a', EXPORT['abitrate'], '-ar', str(EXPORT['ar'])]
        info = dict(mode='silencio', note='sin canción ni audio en los clips: pista de silencio')
    elif au['mode'] == 'externo':
        src_a, off = au['path'], float(au.get('offset', 0))
        inputs += ['-i', src_a]
        aargs = ['-map', f'{aidx}:a:0', '-af', f'atrim=start={off:.6f},asetpts=PTS-STARTPTS,apad,atrim=end={dur:.6f}',
                 '-c:a', EXPORT['acodec'], '-b:a', EXPORT['abitrate'], '-ar', str(EXPORT['ar'])]
        info = dict(mode='externo', path=src_a, sha256=sha256(src_a), offset_s=off,
                    note=au.get('nota', 'audio de otro archivo, nivel y velocidad sin tocar'))
    else:
        mix, master, info = build_song_mix(au, segs, dur, t_prod, work)
        inputs += ['-i', mix]
        aargs = ['-map', f'{aidx}:a', '-af', f'volume={master:.3f}dB', '-c:a', EXPORT['acodec'],
                 '-b:a', EXPORT['abitrate'], '-ar', str(EXPORT['ar'])]
        info['mode'] = 'cancion'
    run([FFMPEG, '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(graph), '-map', '[vout]', *aargs,
         *vargs, '-t', f'{dur:.6f}', '-movflags', '+faststart', out])
    return info


# ---------------------------------------------------------------- principal
def expand_shots(plan, analyses, P, vetos):
    """Lista de planos con in/out en fotogramas fuente. Gancho: in recortado + salida en destape + hold."""
    clips = plan['clips']
    if not any(c.get('auto') for c in clips):           # plan v0: un plano por clip, tal cual
        return [dict(c, clip=i, section=c['role']) for i, c in enumerate(clips)], []
    shots = plan_auto_shots(clips, analyses, P, vetos)
    out = []
    for s in shots:
        c = clips[s['clip']]
        if c['role'] == 'hook':
            d = dict(c, clip=s['clip'], section='hook')
            if 'reveal_frame' in c:
                d['out_frame'] = int(c['reveal_frame']) + int(round(float(c.get('hold_s', P['hook_hold_s'])) * FPS))
                d.pop('out_frames', None)
                d['nota'] = f"gancho: destape en f{c['reveal_frame']} + {c.get('hold_s', P['hook_hold_s'])} s"
            out.append(d)
        elif s['section'] == 'fijo':
            out.append(dict(c, clip=s['clip'], section='fijo'))
        else:
            out.append(dict(role=c['role'], path=c['path'], clip=s['clip'], in_frame=s['in_frame'],
                            out_frame=s['out_frame'], section=s['section'], usable=s['usable'], nota=s['nota']))
    return out, shots


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    plan_path = Path(sys.argv[1]).resolve()
    plan = json.loads(plan_path.read_text())
    out = Path(plan['output'])
    if out.exists() and '--sobrescribir' not in sys.argv:
        sys.exit(f'Ya existe {out}; no se sobrescribe (usa otro nombre o --sobrescribir)')
    work = Path(plan.get('work_dir', f"/Volumes/T7/PRINCIPAL/pedido-54/trabajo/{plan['id']}"))
    work.mkdir(parents=True, exist_ok=True)
    rev = Path(plan.get('revision_dir', out.parent / 'revision'))
    rev.mkdir(parents=True, exist_ok=True)
    P = dict(PATRON, **{k: (tuple(v) if isinstance(v, list) else v) for k, v in plan.get('ritmo', {}).items()})
    z = dict(ZOOM_DEFAULTS, **plan.get('zoom', {}))
    au = plan['audio']
    replica = plan.get('tipo') == 'replica'
    if replica and z['enabled'] and not z['allow_on_replica']:
        sys.exit('Zoom en réplica: hay que activarlo expresamente con zoom.allow_on_replica=true')
    avisos = list(plan.get('avisos', []))
    v1 = any(c.get('auto') for c in plan['clips'])
    analyses = {i: analyze_clip(c['path'], CACHE / 'analisis_clips') for i, c in enumerate(plan['clips'])
                if c.get('auto') or c['role'] == 'hook'} if v1 else {}

    vetos, intentos, historial = {}, 0, []
    while True:
        shots, _ = expand_shots(plan, analyses, P, vetos)
        # beats en tiempo de salida (la canción se coloca con el drop en el inicio del cuerpo)
        hook_out = 0.0
        for s in shots:
            if s['section'] != 'hook':
                break
            n = s.get('out_frames') or round((s['out_frame'] - s.get('in_frame', 0)) / float(s.get('speed', 1)))
            hook_out += n / FPS
        fixed_until = 0
        if au['mode'] == 'cancion':
            p = au.get('product_shown', {})
            if 'plano' in p and v1:
                # El drop al empezar el plano `plano` (p. ej. el 2º de una réplica): los anteriores no se mueven.
                fixed_until = max(0, min(int(p['plano']), len(shots) - 1))
                t_prod = sum(shot_frames(s) for s in shots[:fixed_until]) / FPS
            else:
                t_prod = float(p['t']) if 't' in p else hook_out
            bm = beat_map(au['song'], work, CACHE / 'beatmaps', anchor=float(au['drop']))
            offset = float(au['drop']) - t_prod
            beats_all = [r4(b - offset) for b in bm['beats'] if b - offset >= 0]
            downs_all = [r4(b - offset) for b in bm['downbeats'] if b - offset >= 0]
        elif au['mode'] == 'silencio':
            t_prod = None
            bm = dict(beats=[], downbeats=[], tempo_bpm=None, file=None)
            beats_all, downs_all = [], []
        else:
            t_prod = None
            src = au['path'] if au['mode'] == 'externo' else plan['clips'][0]['path']
            bm = beat_map(src, work, CACHE / 'beatmaps')
            a0 = shots[0].get('in_frame', 0) / FPS if au['mode'] == 'original' else 0.0
            beats_all = [r4(b - a0) for b in bm['beats'] if b >= a0]
            downs_all = [r4(b - a0) for b in bm['downbeats'] if b >= a0]
        snaps = snap_ends_to_beats(shots, beats_all, P, 0.0, fixed_until) if v1 else []
        segs, total = build_timeline(shots)
        dur = total / FPS
        beats = [b for b in beats_all if b <= dur]
        downbeats = [b for b in downs_all if b <= dur]
        if au['mode'] == 'cancion' and 'clip' in au.get('product_shown', {}) and not v1:
            p = au['product_shown']
            t_prod = out_time_of(segs, p['clip'], segs[p['clip']]['in_frame'] + p.get('frame', 0))
        cuts = [s['out_first'] / FPS for s in segs[1:]]
        if v1:
            cues_t = text_timing(plan.get('texts', []), cuts, dur, P)
        else:
            cues_t = [dict(t, start=r4(t['start']), end=r4(min(float(t['end']), dur) if t.get('end') is not None else dur),
                           text=t['text'], lines=t.get('lines'), motivo='tiempos del plan (v0)') for t in plan.get('texts', [])]
        cues = render_texts(cues_t, dur, work, plan.get('font', FONT))
        zooms, zoom_skipped = ([], [])
        if z['enabled']:
            zooms, zoom_skipped = plan_zooms(z, dur, cuts, beats, downbeats, cues, [t_prod] if t_prod else [])
        from rotulos_layout import render_lyrics
        subtitles = render_lyrics(plan['subtitles'], dur, work, plan.get('font', FONT)) if plan.get('subtitles') else []
        audio_info = render(segs, cues + subtitles, zooms, z, au, plan, work, out, dur, t_prod)
        chk = self_check(out, segs, cues, beats, P, total) if v1 else None
        historial.append(dict(intento=intentos + 1, avisos=chk['avisos'] if chk else [],
                              planos=[(s['start_s'], s['dur_s'], s['section']) for s in segs]))
        if not chk or chk['ok'] or not chk['_vetos'] or intentos >= 2:
            break
        for ci, vs in chk['_vetos'].items():          # arreglo automático: vetar la zona y volver a montar
            vetos.setdefault(ci, []).extend(vs)
        intentos += 1

    # ---- comprobaciones y registro
    pr = probe(out)
    vs = next(s for s in pr['streams'] if s['codec_type'] == 'video')
    as_ = next((s for s in pr['streams'] if s['codec_type'] == 'audio'), None)
    checks = dict(frames_expected=total, frames_output=int(vs['nb_read_frames']),
                  video_duration_s=float(vs['duration']), audio_duration_s=float(as_['duration']) if as_ else None,
                  audio_present=as_ is not None, output_peak_dbfs=max_volume(out) if as_ else None)
    if au['mode'] == 'cancion':
        measured = measure_song_offset(out, au['song'], audio_info['song_offset_s'], t_prod, dur - 0.05)
        drop_out = float(au['drop']) - measured
        checks.update(song_offset_planned_s=audio_info['song_offset_s'], song_offset_measured_s=r4(measured),
                      drop_time_in_output_s=r4(drop_out), product_shown_time_s=r4(t_prod),
                      drop_minus_product_ms=r4((drop_out - t_prod) * 1000),
                      measure_method='correlación FFT salida↔canción en el tramo producto→final, 16 kHz')
    if checks['frames_output'] != total:
        avisos.append(f"Fotogramas: esperados {total}, salida {checks['frames_output']}")
    sheet, strips = contact_sheets(out, rev, out.stem, dur, cuts)
    for s in segs:
        s.pop('_map')
    if chk:
        chk.pop('_vetos')
        chk['intentos'] = historial
        chk['vetos_aplicados_f_fuente'] = vetos
        (rev / f'{out.stem} - autocomprobacion.json').write_text(json.dumps(chk, indent=1, ensure_ascii=False))
        lines = [f'Autocomprobación {out.name} ({len(historial)} montaje(s))', '']
        for f in chk['planos']:
            lines.append(f"plano {f['plano']:2d} {f['seccion']:13s} {f['desde_s']:6.2f}–{f['hasta_s']:6.2f}  {f['dur_s']:.2f} s "
                         f"(máx {f['max_patron_s']})  {'beat' if f['en_beat'] else '    '}  "
                         + ('OK' if not f['problemas'] else '; '.join(f['problemas'])))
        lines += ['', f"cortes en beat (±45 ms): {chk['cortes_en_beat']} de {len(chk['cortes_s'])}",
                  f"cortes no previstos: {chk['cortes_detectados_no_previstos_s'] or 'ninguno'}",
                  'rótulos: ' + ', '.join(f"{r['t']:.3f} s {'en corte' if r['en_corte'] else ''}{' en beat' if r['en_beat'] else ''}"
                                          for r in chk['rotulos']), '',
                  'RESULTADO: ' + ('OK' if chk['ok'] else 'AVISOS: ' + ' | '.join(chk['avisos']))]
        (rev / f'{out.stem} - autocomprobacion.txt').write_text('\n'.join(lines) + '\n')
    applied = dict(
        montador='montador v1' if v1 else 'montador v1 (plan v0)', plan=str(plan_path), plan_sha256=sha256(plan_path),
        id=plan['id'], tipo=plan.get('tipo'), output=str(out), output_sha256=sha256(out), duration_s=r4(dur), frames=total,
        patron=P, planos=segs, cortes_en_salida_s=[r4(c) for c in cuts], ajustes_a_beat=snaps,
        analisis_clips={i: dict(sha256=a['sha256'], tramos=a['tramos'], colas_descartadas=a['colas_descartadas'],
                                cortes_internos_f=a['cortes_internos_f']) for i, a in analyses.items()},
        beats=dict(beatmap=bm['file'], tempo_bpm=bm['tempo_bpm'], beats_in_video_s=beats, downbeats_in_video_s=downbeats),
        audio=audio_info, zoom=dict(config=z, aplicados=zooms, descartados=zoom_skipped),
        textos=dict(estilo='06B', font=plan.get('font', FONT), font_sha256=sha256(plan.get('font', FONT)),
                    box_px=BOX, color='#FFFFFF', contorno='negro 0,05 em exterior', interlinea='35/31 em',
                    cues=[{k: v for k, v in c.items() if k != 'png'} for c in cues]),
        subtitulos=[{k: v for k, v in c.items() if k != 'png'} for c in subtitles],
        export=EXPORT, comprobaciones=checks, autocomprobacion=chk, contactos=str(sheet), tiras_cortes=str(strips),
        notas=plan.get('notas', []), avisos=avisos)
    (rev / f'{out.stem} - plan-aplicado.json').write_text(json.dumps(applied, indent=1, ensure_ascii=False))
    print(json.dumps(dict(output=str(out), duracion=r4(dur), planos=[(s['start_s'], s['dur_s'], s['section']) for s in segs],
                          comprobaciones=checks, autocomprobacion=(chk or {}).get('avisos'), avisos=avisos),
                     ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
