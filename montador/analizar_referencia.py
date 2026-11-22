#!/usr/bin/env python3
"""analizar_referencia: mide el montaje de un vídeo de referencia (reel/TikTok) para imitar su estilo.

Uso (en el Mac):
  export UV_CACHE_DIR=$HOME/Library/Caches/uv-principal COPYFILE_DISABLE=1
  uv run --no-project --with librosa --with soundfile --with numpy --with opencv-python-headless \
      python analizar_referencia.py VIDEO.mp4 [VIDEO2.mp4 ...] [--umbral 0.20] [--bpm 117.5 [--ancla S]]
      [--hojas] [--ocr] [--voz]

Para cada vídeo escribe `<id>.analisis.json` al lado (o en --salida) con:
  - ficha: duración, resolución, fps y, si existe `<id>.info.json` de yt-dlp, vistas/likes/caption/fecha.
  - cortes: detector de escena de ffmpeg (puntuación de todos los fotogramas guardada, umbral 0,20 ajustable),
    duración de planos (mediana, mín., máx.), primer corte, cortes por segundo en ventanas de 2 s y por tercios,
    y «candidatos dudosos» (puntuación entre 0,6×umbral y umbral) para revisarlos a ojo.
  - música: tempo, beats, compases estimados, onsets y candidatos a «drop» (subidas fuertes de energía);
    para cada corte, distancia al beat y al onset más cercanos; % de cortes a ±80 ms de un beat y el % que
    saldría por azar con ese tempo (para no engañarse). El tempo de librosa puede salir al doble, a la mitad o
    torcido: si se conoce el real, --bpm mide los cortes contra una rejilla fija anclada en el golpe del drop
    (o en --ancla).
  - movimiento: escala y desplazamiento entre fotogramas consecutivos (ORB + similitud, a 12 fps) → zooms
    dentro de cada plano (acumulado), saltos de escala bruscos (punch-in) y fotogramas de mucho movimiento
    (whip/sacudida). Necesita opencv; sin él se omite.
  - actividad (con opencv): curva de diferencia entre fotogramas y, por plano, si se corta con la acción en
    marcha o con una cola quieta (`ultimo_tercio_s_rel`, `cola_quieta_s`, `pico_actividad_frac`).
  - --tiras: una tira a 8 fps por corte (1 s antes, 0,5 s después) en `<id>.tiras/` para ver EN QUÉ MOMENTO de la
    acción se sale de cada plano. --solo-cortes cortes.json usa cortes revisados a mano ({"<id>": [t, ...]}).
  - --hojas: hojas de contactos de 4 fps (bloques de 5 s, 5×4) en `<id>.hojas/` para MIRAR el vídeo.
  - --ocr (solo macOS): texto en pantalla con Vision (fotogramas a 4 fps): qué dice, cuándo entra/sale, dónde.
  - --voz: transcripción con mlx_whisper (modelo turbo) → `<id>.whisper.json`. Ojo: con música alucina;
    contrastar con el audio.
Los números no sustituyen mirar las hojas: un «corte» puede ser un flash o un movimiento rápido.
"""
import argparse, json, math, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

HOME = Path.home()
FFMPEG = shutil.which('ffmpeg', path=str(HOME / '.local/bin')) or 'ffmpeg'
FFPROBE = shutil.which('ffprobe', path=str(HOME / '.local/bin')) or 'ffprobe'
WHISPER = shutil.which('mlx_whisper', path=str(HOME / '.local/bin')) or 'mlx_whisper'
BEAT_TOL = 0.08


def run(cmd, check=True):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError(f'{Path(str(cmd[0])).name} falló:\n{r.stderr[-2000:]}')
    return r.stdout + r.stderr


def r3(x):
    return None if x is None else round(float(x), 3)


# ------------------------------------------------------------------ ficha
def ficha(video):
    p = json.loads(run([FFPROBE, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', video]))
    v = next(s for s in p['streams'] if s['codec_type'] == 'video')
    num, den = (v.get('avg_frame_rate') or v['r_frame_rate']).split('/')
    out = dict(archivo=str(video), duracion=r3(p['format']['duration']), ancho=v['width'], alto=v['height'],
               fps=r3(float(num) / float(den or 1)),
               tiene_audio=any(s['codec_type'] == 'audio' for s in p['streams']))
    info = Path(video).with_suffix('.info.json')
    if info.exists():
        i = json.loads(info.read_text())
        out.update(id=i.get('id'), url=i.get('webpage_url'), vistas=i.get('view_count'), likes=i.get('like_count'),
                   comentarios=i.get('comment_count'), fecha=i.get('upload_date'), cuenta=i.get('uploader_id') or i.get('channel'),
                   caption=i.get('description'), pista=i.get('track'), artista=i.get('artist'))
    return out


# ------------------------------------------------------------------ cortes
def puntuaciones_escena(video):
    """Puntuación de escena de ffmpeg para cada fotograma (imagen reducida a 360 px de ancho)."""
    txt = run([FFMPEG, '-hide_banner', '-nostats', '-i', video, '-an', '-vf',
               "scale=360:-2,select='gte(scene,0)',metadata=print:file=-", '-f', 'null', '-'])
    pts, sc, t = [], [], None
    for line in txt.splitlines():
        m = re.search(r'pts_time:([\d.]+)', line)
        if m:
            t = float(m.group(1))
        m = re.search(r'lavfi\.scene_score=([\d.]+)', line)
        if m and t is not None:
            pts.append(t); sc.append(float(m.group(1)))
    return pts, sc


def cortes(pts, sc, dur, umbral, min_gap=0.2):
    cand = [(t, s) for t, s in zip(pts, sc) if s >= umbral and 0.05 < t < dur - 0.05]
    cuts = []
    for t, s in cand:                     # máximo local: dos picos a < min_gap → se queda el mayor
        if cuts and t - cuts[-1][0] < min_gap:
            if s > cuts[-1][1]:
                cuts[-1] = (t, s)
        else:
            cuts.append((t, s))
    dudosos = [dict(t=r3(t), score=r3(s)) for t, s in zip(pts, sc)
               if 0.6 * umbral <= s < umbral and all(abs(t - c[0]) > 0.15 for c in cuts) and t > 0.05]
    return cuts, dudosos


def stats_planos(cut_times, dur):
    b = [0.0] + list(cut_times) + [dur]
    shots = [b[i + 1] - b[i] for i in range(len(b) - 1)]
    s = sorted(shots)
    med = s[len(s) // 2] if len(s) % 2 else (s[len(s) // 2 - 1] + s[len(s) // 2]) / 2
    ventanas = []
    w = 0.0
    while w < dur:
        n = sum(1 for c in cut_times if w <= c < w + 2)
        ventanas.append(dict(desde=r3(w), cortes=n))
        w += 2
    tercios = []
    for k in range(3):
        a, z = dur * k / 3, dur * (k + 1) / 3
        n = sum(1 for c in cut_times if a <= c < z)
        tercios.append(dict(desde=r3(a), hasta=r3(z), cortes=n, cortes_por_s=r3(n / (z - a))))
    return dict(n_cortes=len(cut_times), n_planos=len(shots), planos=[r3(x) for x in shots],
                plano_mediana=r3(med), plano_min=r3(min(shots)), plano_max=r3(max(shots)),
                plano_medio=r3(sum(shots) / len(shots)),
                primer_corte=r3(cut_times[0]) if cut_times else None,
                cortes_por_s=r3(len(cut_times) / dur), ventanas_2s=ventanas, tercios=tercios)


# ------------------------------------------------------------------ música
def musica(video, tmp):
    import numpy as np, librosa
    wav = Path(tmp) / 'a.wav'
    run([FFMPEG, '-v', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '22050', wav])
    y, sr = librosa.load(str(wav), sr=22050, mono=True)
    if len(y) < sr or float(np.abs(y).max()) < 1e-4:
        return None
    hop = 512
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, bf = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, tightness=100)
    tempo = float(np.atleast_1d(tempo)[0])
    beats = librosa.frames_to_time(bf, sr=sr, hop_length=hop)
    onsets = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units='time', backtrack=False)
    # compases: la fase (de 4) cuyos beats tienen más energía de graves → «1» del compás (estimación)
    S = np.abs(librosa.stft(y, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr)
    low = S[freqs < 150].sum(axis=0)
    fase = 0
    if len(bf) >= 8:
        fase = int(np.argmax([low[np.clip(bf[k::4], 0, len(low) - 1)].mean() for k in range(4)]))
    downbeats = beats[fase::4]
    # energía (RMS en dB) cada ~23 ms y candidatos a drop: mayor subida media (0,5 s después vs 1 s antes)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    db = 20 * np.log10(rms + 1e-6)
    lowdb = 20 * np.log10(low / (low.max() or 1) + 1e-6)
    tt = librosa.frames_to_time(np.arange(len(db)), sr=sr, hop_length=hop)
    fps_a = sr / hop
    a, b = int(1.0 * fps_a), int(0.5 * fps_a)
    jumps = []
    for i in range(a, len(db) - b):
        jumps.append((float(db[i:i + b].mean() - db[i - a:i].mean() + 0.5 * (lowdb[i:i + b].mean() - lowdb[i - a:i].mean())), i))
    jumps.sort(reverse=True)
    drops = []
    for j, i in jumps:
        if j < 3:
            break
        t = float(tt[i])
        if all(abs(t - d['t']) > 1.5 for d in drops):
            nb = float(beats[np.argmin(np.abs(beats - t))]) if len(beats) else None
            w0, w1 = max(0, int((t - 0.2) * fps_a)), min(len(env), int((t + 0.3) * fps_a))
            golpe = float(librosa.frames_to_time(w0 + int(np.argmax(env[w0:w1])), sr=sr, hop_length=hop))
            drops.append(dict(t=r3(t), golpe=r3(golpe), subida_db=round(j, 1), beat_cercano=r3(nb)))
        if len(drops) == 3:
            break
    curva = [dict(t=r3(tt[i]), db=round(float(db[i:i + int(fps_a / 4)].mean()), 1))
             for i in range(0, len(db), int(fps_a / 4))]
    return dict(tempo=round(tempo, 1), periodo_beat=r3(60 / tempo) if tempo else None,
                beats=[r3(x) for x in beats], downbeats_estimados=[r3(x) for x in downbeats],
                onsets=[r3(x) for x in onsets], drops_candidatos=drops, energia_db_cada_025s=curva)


def cortes_vs_beats(cut_times, mus):
    import numpy as np
    if not mus or not mus['beats'] or not cut_times:
        return None
    beats, ons, dbs = (np.array(mus[k]) for k in ('beats', 'onsets', 'downbeats_estimados'))
    filas = []
    for c in cut_times:
        db_ = float(c - beats[np.argmin(np.abs(beats - c))])
        do = float(c - ons[np.argmin(np.abs(ons - c))]) if len(ons) else None
        dd = float(c - dbs[np.argmin(np.abs(dbs - c))]) if len(dbs) else None
        filas.append(dict(t=r3(c), a_beat=r3(db_), a_onset=r3(do), a_downbeat=r3(dd)))
    n = len(filas)
    en_beat = sum(abs(f['a_beat']) <= BEAT_TOL for f in filas)
    en_onset = sum(f['a_onset'] is not None and abs(f['a_onset']) <= BEAT_TOL for f in filas)
    en_db = sum(f['a_downbeat'] is not None and abs(f['a_downbeat']) <= BEAT_TOL for f in filas)
    per = mus['periodo_beat'] or 1
    span = beats[-1] - beats[0] if len(beats) > 1 else 1
    dens_on = len(ons) / max(span, 1)
    return dict(por_corte=filas, pct_en_beat=round(100 * en_beat / n), pct_en_onset=round(100 * en_onset / n),
                pct_en_downbeat=round(100 * en_db / n),
                pct_azar_beat=round(100 * min(1, 2 * BEAT_TOL / per)),
                pct_azar_onset=round(100 * min(1, 2 * BEAT_TOL * dens_on)),
                mediana_abs_a_beat=r3(sorted(abs(f['a_beat']) for f in filas)[n // 2]),
                nota='azar = % esperado si los cortes cayeran al azar con esta densidad de beats/onsets')


def cortes_vs_rejilla(cut_times, bpm, ancla):
    """Rejilla fija dada a mano (librosa suele equivocarse de tempo): beats de `bpm` anclados en `ancla` (el drop)."""
    if not cut_times or not bpm or ancla is None:
        return None
    p = 60.0 / bpm
    filas = []
    for c in cut_times:
        k = (c - ancla) / p
        filas.append(dict(t=r3(c), beat=round(k, 2), a_beat=r3((k - round(k)) * p),
                          a_medio_beat=r3((2 * k - round(2 * k)) * p / 2)))
    n = len(filas)
    return dict(bpm=bpm, ancla=r3(ancla), por_corte=filas,
                pct_en_beat=round(100 * sum(abs(f['a_beat']) <= BEAT_TOL for f in filas) / n),
                pct_azar_beat=round(100 * min(1, 2 * BEAT_TOL / p)),
                en_beat_par=sum(abs(f['a_beat']) <= BEAT_TOL and round(f['beat']) % 2 == 0 for f in filas),
                en_beat_impar=sum(abs(f['a_beat']) <= BEAT_TOL and round(f['beat']) % 2 == 1 for f in filas),
                nota='beat = nº de beats desde el ancla (0 = drop); a_beat = distancia al beat más cercano (s)')


# ------------------------------------------------------------------ movimiento
def movimiento(video, cut_times, dur, fps_m=12):
    try:
        import cv2, numpy as np
    except ImportError:
        return dict(omitido='sin opencv (añade --with opencv-python-headless)')
    cap = cv2.VideoCapture(str(video))
    vfps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, round(vfps / fps_m))
    orb = cv2.ORB_create(800)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    prev, idx, filas = None, 0, []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        if idx % step == 0:
            t = idx / vfps
            g = cv2.cvtColor(cv2.resize(fr, (360, int(360 * fr.shape[0] / fr.shape[1]))), cv2.COLOR_BGR2GRAY)
            kp, de = orb.detectAndCompute(g, None)
            if prev is not None and de is not None and prev[2] is not None and len(kp) > 20:
                ms = bf.match(prev[2], de)
                if len(ms) >= 15:
                    p0 = np.float32([prev[1][m.queryIdx].pt for m in ms])
                    p1 = np.float32([kp[m.trainIdx].pt for m in ms])
                    M, inl = cv2.estimateAffinePartial2D(p0, p1, method=cv2.RANSAC, ransacReprojThreshold=3)
                    if M is not None and inl is not None and inl.sum() >= 12:
                        s = float(math.hypot(M[0, 0], M[1, 0]))
                        filas.append(dict(t=t, escala=s, dx=float(M[0, 2]), dy=float(M[1, 2]),
                                          inl=int(inl.sum()) / len(ms)))
                    else:
                        filas.append(dict(t=t, escala=None))
                else:
                    filas.append(dict(t=t, escala=None))
            prev = (t, kp, de)
        idx += 1
    cap.release()
    b = [0.0] + list(cut_times) + [dur]
    planos = []
    for i in range(len(b) - 1):
        a, z = b[i] + 0.06, b[i + 1] - 0.02
        fs = [f for f in filas if a < f['t'] <= z and f.get('escala')]
        if not fs:
            planos.append(dict(desde=r3(b[i]), hasta=r3(b[i + 1]), medido=False)); continue
        acc, mx, mn, trace = 1.0, 1.0, 1.0, []
        for f in fs:
            acc *= f['escala']; mx = max(mx, acc); mn = min(mn, acc); trace.append(acc)
        desp = sum(math.hypot(f['dx'], f['dy']) for f in fs) / max(len(fs), 1)
        bruscos = [dict(t=r3(f['t']), escala=r3(f['escala'])) for f in fs if abs(f['escala'] - 1) > 0.04]
        planos.append(dict(desde=r3(b[i]), hasta=r3(b[i + 1]), medido=True, zoom_acumulado=r3(acc),
                           zoom_max=r3(mx), zoom_min=r3(mn), desplazamiento_medio_px=round(desp, 1),
                           saltos_escala=bruscos))
    rapidos = [dict(t=r3(f['t']), dx=round(f['dx'], 1), dy=round(f['dy'], 1)) for f in filas
               if f.get('escala') and math.hypot(f['dx'], f['dy']) > 25]
    return dict(fps_medicion=fps_m, ancho_medicion=360, planos=planos, movimiento_rapido=rapidos,
                fotogramas_sin_medir=sum(1 for f in filas if not f.get('escala')),
                nota='escala >1 = acercamiento. Zoom acumulado = producto de escalas dentro del plano. '
                     'En vídeo IA, el «zoom» puede ser movimiento de cámara generado, no edición.')


# ------------------------------------------------------------------ actividad (¿en qué momento de la acción se corta?)
def curva_actividad(video, ancho=96):
    """Diferencia media absoluta entre fotogramas consecutivos (gris, 96 px de ancho, 0-255), a los fps nativos.
    Es la «cantidad de cosas que se mueven» en cada fotograma. Devuelve (tiempos, valores, fps)."""
    import cv2
    cap = cv2.VideoCapture(str(video))
    vfps = cap.get(cv2.CAP_PROP_FPS) or 30
    prev, ts, vs, idx = None, [], [], 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(cv2.resize(fr, (ancho, int(ancho * fr.shape[0] / fr.shape[1])), interpolation=cv2.INTER_AREA),
                         cv2.COLOR_BGR2GRAY).astype('float32')
        if prev is not None:
            ts.append(idx / vfps); vs.append(float(abs(g - prev).mean()))
        prev, idx = g, idx + 1
    cap.release()
    return ts, vs, vfps


def actividad(video, cut_times, dur):
    """Por plano: actividad media, la del último 1/3 s antes del corte (relativa a la del plano) y cuánto lleva
    «quieto» el plano antes del corte (cola por debajo del 35 % de su percentil 80). Así se ve si los vídeos que
    funcionan cortan con la acción todavía en marcha o dejan colas quietas."""
    try:
        ts, vs, vfps = curva_actividad(video)
    except ImportError:
        return dict(omitido='sin opencv')
    b = [0.0] + list(cut_times) + [dur]
    planos = []
    for i in range(len(b) - 1):
        a, z = b[i] + 1.5 / vfps, b[i + 1] - 0.5 / vfps     # sin el propio salto del corte
        seg = [(t, v) for t, v in zip(ts, vs) if a < t < z]
        if len(seg) < 4:
            planos.append(dict(desde=r3(b[i]), hasta=r3(b[i + 1]), medido=False)); continue
        vals = sorted(v for _, v in seg)
        p80 = vals[int(0.8 * (len(vals) - 1))] or 1e-6
        media = sum(vals) / len(vals)
        ult = [v for t, v in seg if t > z - 1 / 3]
        ult_rel = (sum(ult) / len(ult)) / (media or 1e-6) if ult else None
        quieto = 0.0
        for t, v in reversed(seg):
            if v >= 0.35 * p80:
                break
            quieto = z - t
        # momento de máxima actividad (suavizado 0,25 s) en fracción del plano
        k = max(1, int(0.25 * vfps))
        sm = [sum(v for _, v in seg[j:j + k]) / len(seg[j:j + k]) for j in range(len(seg))]
        jmax = max(range(len(sm)), key=lambda j: sm[j])
        planos.append(dict(desde=r3(b[i]), hasta=r3(b[i + 1]), dur=r3(b[i + 1] - b[i]), medido=True,
                           actividad_media=round(media, 2), actividad_p80=round(p80, 2),
                           ultimo_tercio_s_rel=r3(ult_rel), cola_quieta_s=r3(quieto),
                           pico_actividad_frac=r3((seg[jmax][0] - b[i]) / (b[i + 1] - b[i]))))
    return dict(planos=planos, curva=[[r3(t), round(v, 2)] for t, v in zip(ts, vs)],
                nota='actividad = diferencia media entre fotogramas (0-255, 96 px). ultimo_tercio_s_rel <0,5 = el plano '
                     'se corta ya quieto; ≈1 o más = se corta con la acción en marcha. cola_quieta_s = segundos finales '
                     'por debajo del 35 % del p80 del plano.')


def tiras(video, outdir, cut_times, dur, fps_t=8, antes=1.0, despues=0.5, ancho=160):
    """Una tira por corte: de `antes` s antes a `despues` s después del corte, a `fps_t` fps, con la hora encima."""
    outdir.mkdir(exist_ok=True)
    out = []
    font = '/System/Library/Fonts/Supplemental/Arial.ttf'
    for k, c in enumerate(cut_times):
        t0 = max(0.0, c - antes)
        n = int(round((min(dur, c + despues) - t0) * fps_t))
        f = outdir / f'corte{k + 1:02d}_{c:06.3f}s.jpg'
        dt = (f"drawtext=fontfile={font}:text='%{{pts\\:hms}}':x=3:y=3:fontsize=14:fontcolor=yellow:box=1:boxcolor=black@0.6,"
              if Path(font).exists() else '')
        run([FFMPEG, '-v', 'error', '-y', '-ss', f'{t0:.3f}', '-t', f'{n / fps_t:.3f}', '-copyts', '-i', video, '-vf',
             f'fps={fps_t},scale={ancho}:-2,{dt}tile={n}x1:padding=2:color=red', '-frames:v', '1', '-q:v', '4', f])
        out.append(str(f))
    return dict(fps=fps_t, antes_s=antes, despues_s=despues, archivos=out,
                nota='cada tira va de antes_s antes a despues_s después del corte; el corte está en la celda nº antes_s×fps+1')


# ------------------------------------------------------------------ hojas
def hojas(video, outdir, dur, fps_h=4, cols=5, rows=4, ancho=200):
    outdir.mkdir(exist_ok=True)
    per = cols * rows / fps_h
    k, t0, out = 0, 0.0, []
    while t0 < dur:
        f = outdir / f'h{k:02d}_{t0:05.1f}s.jpg'
        run([FFMPEG, '-v', 'error', '-y', '-ss', f'{t0:.3f}', '-t', f'{per:.3f}', '-i', video, '-vf',
             f'fps={fps_h},scale={ancho}:-2,tile={cols}x{rows}:padding=2:color=white', '-frames:v', '1', '-q:v', '5', f])
        out.append(str(f)); t0 += per; k += 1
    return dict(fps=fps_h, columnas=cols, filas=rows, segundos_por_hoja=per, archivos=out,
                nota='cada celda = 1/fps s; se lee de izquierda a derecha y de arriba abajo')


# ------------------------------------------------------------------ OCR (macOS Vision)
SWIFT_OCR = r'''
import Foundation
import Vision
import AppKit
var res: [[String: Any]] = []
for p in CommandLine.arguments.dropFirst() {
  guard let img = NSImage(contentsOfFile: p), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.recognitionLanguages = ["en-US", "de-DE", "es-ES"]
  req.usesLanguageCorrection = true
  try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
  var items: [[String: Any]] = []
  for o in (req.results ?? []) {
    guard let c = o.topCandidates(1).first, c.confidence > 0.4 else { continue }
    let b = o.boundingBox
    items.append(["txt": c.string, "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height])
  }
  res.append(["f": p, "items": items])
}
print(String(data: try! JSONSerialization.data(withJSONObject: res), encoding: .utf8)!)
'''


def ocr(video, tmp, dur, fps_o=4):
    if sys.platform != 'darwin' or not shutil.which('swift'):
        return dict(omitido='OCR solo en macOS con swift')
    d = Path(tmp) / 'ocr'; d.mkdir(exist_ok=True)
    run([FFMPEG, '-v', 'error', '-y', '-i', video, '-vf', f'fps={fps_o},scale=720:-2', '-q:v', '3', d / 'f%04d.jpg'])
    sw = Path(tmp) / 'ocr.swift'; sw.write_text(SWIFT_OCR)
    files = sorted(d.glob('f*.jpg'))
    data = json.loads(run(['swift', sw] + files))
    frames = []
    for r in data:
        n = int(re.search(r'f(\d+)\.jpg', r['f']).group(1))
        t = (n - 0.5) / fps_o
        txt = ' / '.join(i['txt'] for i in sorted(r['items'], key=lambda i: (round(i['y'], 2), i['x'])))
        box = None
        if r['items']:
            box = dict(x=r3(min(i['x'] for i in r['items'])), y=r3(min(i['y'] for i in r['items'])),
                       x2=r3(max(i['x'] + i['w'] for i in r['items'])), y2=r3(max(i['y'] + i['h'] for i in r['items'])),
                       alto_linea=r3(sorted(i['h'] for i in r['items'])[len(r['items']) // 2]))
        frames.append(dict(t=r3(t), texto=txt, caja=box))
    # agrupa en rótulos: tramos consecutivos con texto «parecido»
    def norm(s):
        return re.sub(r'[^a-z0-9äöüß]', '', s.lower())
    def parecido(a, b):
        a, b = norm(a), norm(b)
        if not a or not b:
            return False
        common = sum(1 for ch in set(a) if ch in b)
        return a in b or b in a or common / max(len(set(a)), len(set(b))) > 0.8
    rot = []
    for f in frames:
        if not f['texto']:
            continue
        if rot and parecido(rot[-1]['texto'], f['texto']) and f['t'] - rot[-1]['fin'] <= 0.3:
            rot[-1]['fin'] = f['t'] + 1 / fps_o
            if len(norm(f['texto'])) > len(norm(rot[-1]['texto'])):
                rot[-1]['texto'] = f['texto']; rot[-1]['caja'] = f['caja']
        else:
            rot.append(dict(inicio=f['t'], fin=f['t'] + 1 / fps_o, texto=f['texto'], caja=f['caja']))
    for r in rot:
        r['inicio'], r['fin'] = r3(r['inicio']), r3(r['fin'])
        r['palabras'] = len(r['texto'].replace(' / ', ' ').split())
    return dict(fps=fps_o, rotulos=rot, por_fotograma=frames,
                nota='Vision no lee emojis ni distingue rótulo de texto del propio vídeo (carteles, logos). '
                     'Caja en fracción del fotograma (0-1, origen arriba a la izquierda). Revisar a ojo.')


# ------------------------------------------------------------------ voz
def voz(video, salida_dir):
    out = Path(salida_dir)
    run([WHISPER, str(video), '--model', 'mlx-community/whisper-large-v3-turbo', '--output-format', 'json',
         '--output-dir', str(out), '--word-timestamps', 'False'], check=False)
    j = out / (Path(video).stem + '.json')
    if not j.exists():
        return dict(error='mlx_whisper no produjo salida')
    dst = out / (Path(video).stem + '.whisper.json')
    j.replace(dst)
    d = json.loads(dst.read_text())
    return dict(texto=d.get('text', '').strip(), idioma=d.get('language'),
                segmentos=[dict(desde=r3(s['start']), hasta=r3(s['end']), texto=s['text'].strip(),
                                no_speech=r3(s.get('no_speech_prob'))) for s in d.get('segments', [])],
                archivo=str(dst), nota='Con música de fondo whisper puede inventar texto: mirar no_speech y escuchar.')


# ------------------------------------------------------------------ main
def analizar(video, a):
    video = Path(video)
    salida = Path(a.salida) if a.salida else video.parent
    salida.mkdir(parents=True, exist_ok=True)
    res = dict(herramienta='montador/analizar_referencia.py', umbral_escena=a.umbral)
    res['ficha'] = f = ficha(video)
    dur = f['duracion']
    pts, sc = puntuaciones_escena(video)
    cuts, dud = cortes(pts, sc, dur, a.umbral)
    ct = [c[0] for c in cuts]
    if a.solo_cortes:
        manual = json.loads(Path(a.solo_cortes).read_text()).get(video.stem)
        if manual is not None:
            res['cortes_detector'] = [dict(t=r3(t), score=r3(s)) for t, s in cuts]
            cuts = [(float(t), None) for t in manual]
            ct = [c[0] for c in cuts]
            res['cortes_revisados_a_mano'] = True
    res['cortes'] = dict(lista=[dict(t=r3(t), score=r3(s)) for t, s in cuts], dudosos=dud, **stats_planos(ct, dur))
    with tempfile.TemporaryDirectory() as tmp:
        if f['tiene_audio']:
            try:
                res['musica'] = musica(video, tmp)
                res['cortes_vs_musica'] = cortes_vs_beats(ct, res['musica'])
                if a.bpm:
                    ancla = a.ancla
                    if ancla is None and res['musica'] and res['musica'].get('drops_candidatos'):
                        ancla = res['musica']['drops_candidatos'][0]['golpe']
                    res['cortes_vs_rejilla'] = cortes_vs_rejilla(ct, a.bpm, ancla)
            except Exception as e:  # noqa: BLE001
                res['musica'] = dict(error=str(e))
        if not a.sin_movimiento:
            res['movimiento'] = movimiento(video, ct, dur)
            res['actividad'] = actividad(video, ct, dur)
        if a.tiras:
            res['tiras'] = tiras(video, salida / f'{video.stem}.tiras', ct, dur)
        if a.hojas:
            res['hojas'] = hojas(video, salida / f'{video.stem}.hojas', dur)
        if a.ocr:
            try:
                res['texto_pantalla'] = ocr(video, tmp, dur)
            except Exception as e:  # noqa: BLE001
                res['texto_pantalla'] = dict(error=str(e)[:500])
        if a.voz:
            res['voz'] = voz(video, salida)
    res['escena_por_fotograma'] = [[r3(t), r3(s)] for t, s in zip(pts, sc)]
    out = salida / f'{video.stem}.analisis.json'
    out.write_text(json.dumps(res, ensure_ascii=False, indent=1))
    return out, res


def resumen(res):
    f, c = res['ficha'], res['cortes']
    cm = res.get('cortes_vs_musica') or {}
    m = res.get('musica') or {}
    return (f"{f.get('id') or Path(f['archivo']).stem}: {f['duracion']} s, {c['n_cortes']} cortes, plano mediana "
            f"{c['plano_mediana']} s, primer corte {c['primer_corte']}, tempo {m.get('tempo')}, en beat "
            f"{cm.get('pct_en_beat')}% (azar {cm.get('pct_azar_beat')}%), drops {[d['t'] for d in m.get('drops_candidatos', [])]}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('videos', nargs='+')
    ap.add_argument('--umbral', type=float, default=0.20,
                    help='umbral de escena de ffmpeg (0-1), por defecto 0,20 (0,30 pierde cortes dentro del mismo sitio)')
    ap.add_argument('--bpm', type=float, help='tempo real (si librosa se equivoca): mide los cortes contra esa rejilla')
    ap.add_argument('--ancla', type=float, help='segundo del vídeo en que cae un beat (por defecto, el drop detectado)')
    ap.add_argument('--salida', help='carpeta de salida (por defecto, junto al vídeo)')
    ap.add_argument('--hojas', action='store_true', help='hojas de contactos a 4 fps')
    ap.add_argument('--tiras', action='store_true', help='tiras a 8 fps alrededor de cada corte (1 s antes, 0,5 s después)')
    ap.add_argument('--solo-cortes', help='JSON con cortes revisados a mano {"id": [t, ...]}: sustituye al detector')
    ap.add_argument('--ocr', action='store_true', help='texto en pantalla con Vision (macOS)')
    ap.add_argument('--voz', action='store_true', help='transcripción con mlx_whisper')
    ap.add_argument('--sin-movimiento', action='store_true', help='no medir zooms/movimiento (más rápido)')
    a = ap.parse_args()
    for v in a.videos:
        if Path(v).name.startswith('._'):
            continue
        out, res = analizar(v, a)
        print(resumen(res), '→', out, flush=True)
