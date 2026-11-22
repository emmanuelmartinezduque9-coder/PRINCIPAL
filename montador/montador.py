#!/usr/bin/env python3
"""montador v0: monta un vídeo vertical a partir de un «plan de montaje» JSON.

Uso (en el Mac):
  export UV_CACHE_DIR=$HOME/Library/Caches/uv-principal COPYFILE_DISABLE=1
  uv run --no-project --with librosa --with soundfile --with numpy \
      python montador.py planes/V3.json [--sobrescribir]

Qué hace, en orden: lee el plan, analiza los beats (canción o audio original) y guarda un mapa
de beats, calcula el desfase de la canción para que el drop guardado caiga en el momento en que
se enseña el producto, ajusta cortes a beats solo donde el plan lo permite, coloca mini-zooms
(si están activados), dibuja los textos 06B, exporta como el pedido 81 y escribe junto al vídeo
`revision/<nombre> - plan-aplicado.json` y `revision/<nombre> - contactos.jpg`.
Ver README.md para el formato del plan.
"""
import hashlib, json, math, re, subprocess, sys, textwrap
from pathlib import Path

HOME = Path.home()
FFMPEG, FFPROBE = str(HOME / '.local/bin/ffmpeg'), str(HOME / '.local/bin/ffprobe')
TOOL = Path(__file__).resolve().parent
FONT = '/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/EDITOR/fonts/TikTok-Display-Medium.ttf'
LABEL_FONT = '/System/Library/Fonts/Helvetica.ttc'
W, H, FPS = 1080, 1920, 24
BOX = dict(x=112, y=287, w=886, h=318)          # caja invisible 06B sobre 1080x1920
EXPORT = dict(vcodec='libx264', profile='high', pix_fmt='yuv420p', crf=18, preset='fast', fps=FPS,
              acodec='aac', abitrate='192k', ar=44100, nota='igual que el pedido 81 (H.264 High, 24 fps, AAC 192k 44,1 kHz)')
MAX_HOOK_SPEED = 1.12
ZOOM_DEFAULTS = dict(enabled=False, amounts=[1.04, 1.06], drop_amount=1.07, attack=0.12, release=0.9,
                     min_gap=1.6, text_guard=0.6, max_text_chars=70, center=[0.5, 0.5],
                     start_after=0.3, end_margin=0.5, beat_tolerance=0.1, min_release=0.35,
                     scene_threshold=0.2, allow_on_replica=False)


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


def video_frames(path):
    v = next(s for s in probe(path)['streams'] if s['codec_type'] == 'video')
    return int(v['nb_read_frames'])


def r4(x):
    return round(float(x), 4)


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
    # Compases de 4: la fase se ancla al beat más cercano al drop, o a la fase más fuerte.
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
def build_timeline(clips):
    segs, t = [], 0
    for i, c in enumerate(clips):
        total = video_frames(c['path'])
        a, b = int(c.get('in_frame', 0)), int(c.get('out_frame', total))
        if not 0 <= a < b <= total:
            sys.exit(f'Clip {i}: in/out fuera de rango (0..{total})')
        n_src = b - a
        n_out = int(c.get('out_frames') or round(n_src / float(c.get('speed', 1.0))))
        speed = n_src / n_out
        limit = MAX_HOOK_SPEED if c['role'] == 'hook' else 1.0
        if speed > limit + 1e-9 or speed < 1 - 1e-9:
            sys.exit(f'Clip {i} ({c["role"]}): velocidad {speed:.4f} no permitida (máx {limit}, nunca más lento)')
        fmap = [a + min(n_src - 1, int((k + 0.5) * speed)) for k in range(n_out)]
        segs.append(dict(index=i, role=c['role'], path=c['path'], sha256=sha256(c['path']), src_frames=total,
                         in_frame=a, out_frame=b, speed=r4(speed), out_first=t, out_end=t + n_out,
                         start_s=r4(t / FPS), end_s=r4((t + n_out) / FPS),
                         dropped_src_frames=sorted(set(range(a, b)) - set(fmap)), _map=fmap))
        t += n_out
    return segs, t


def out_time_of(segs, clip, src_frame):
    s = segs[clip]
    k = next(k for k, f in enumerate(s['_map']) if f >= src_frame)
    return (s['out_first'] + k) / FPS


def scene_cuts(segs, threshold):
    """Cortes internos de cada clip (detector de escena de ffmpeg), en tiempo de salida."""
    cuts = [s['out_first'] / FPS for s in segs[1:]]
    for i, s in enumerate(segs):
        log = run([FFMPEG, '-hide_banner', '-i', s['path'], '-an', '-vf',
                   f"select='gt(scene,{threshold})',showinfo", '-f', 'null', '-'])
        for m in re.finditer(r'pts_time:([0-9.]+)', log):
            f = round(float(m.group(1)) * FPS)
            if s['in_frame'] < f < s['out_frame']:
                cuts.append(out_time_of(segs, i, f))
    return sorted(set(r4(c) for c in cuts))


# ---------------------------------------------------------------- textos 06B
def wrap(text):
    lines = []
    for part in text.split('\n'):
        lines.extend(textwrap.wrap(part.strip(), width=34, break_long_words=False, break_on_hyphens=False))
    return lines


def render_texts(texts, dur, work, font):
    cues = []
    for t in texts:
        lines = t.get('lines') or wrap(t['text'])
        end = min(float(t['end']), dur) if t.get('end') is not None else dur
        cues.append(dict(start=r4(t['start']), end=r4(end), lines=lines, text=' '.join(lines)))
    if not cues:
        return cues
    (work / 'cues.json').write_text(json.dumps(cues, ensure_ascii=False))
    log = run(['/usr/bin/swift', TOOL / 'texto06b.swift', work / 'cues.json', work / 'textos', font])
    sizes = dict(re.findall(r'cue (\d+) size=([0-9.]+)', log))
    for i, c in enumerate(cues):
        c['png'] = str(work / 'textos' / f'cue-{i}.png')
        c['font_size_px'] = float(sizes[str(i)])
    return cues


# ---------------------------------------------------------------- mini-zooms
def plan_zooms(z, dur, cuts, beats, downbeats, cues, forced):
    """Elige arranques de zoom en cortes, en el drop y en compases; evita textos largos/recientes."""
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
        nxt = min([k for k in cuts if k > t + 1e-3] + [dur])        # no cruzar el siguiente corte
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
    log = run([FFMPEG, '-hide_banner', '-nostats', '-i', path, '-vn', '-af', (af + ',' if af else '') + 'volumedetect', '-f', 'null', '-'])
    return float(re.findall(r'max_volume:\s+(-?[0-9.]+) dB', log)[-1])


def build_song_mix(au, segs, dur, t_prod, work):
    song = au['song']
    offset = float(au['drop']) - t_prod                    # inicio del fragmento = drop - t_producto
    song_dur = float(probe(song)['format']['duration'])
    if song_dur - offset < dur:
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
        s = segs[v.get('clip', 0)]
        trim = f"atrim=start={v['from']}:end={v['to']},asetpts=PTS-STARTPTS"
        lufs = loudness(v['path'], trim)
        gv = float(v.get('target_lufs', -14)) - lufs
        at = s['out_first'] / FPS + (float(v['from']) - s['in_frame'] / FPS) / s['speed']
        tempo = f",atempo={s['speed']:.6f}" if s['speed'] != 1 else ''
        graph.append(f"[1:a]aresample=44100,aformat=channel_layouts=stereo,{trim}{tempo},volume={gv:.2f}dB,"
                     f"adelay={int(round(at * 1000))}:all=1[v]")
        graph.append('[m][v]amix=inputs=2:normalize=0:duration=first[mix]')
        inputs += ['-i', v['path']]
        info['voice'] = dict(path=v['path'], sha256=sha256(v['path']), source_from=v['from'], source_to=v['to'],
                             speed=s['speed'], placed_at_s=r4(at), measured_lufs=lufs, gain_db=r4(gv),
                             target_lufs=v.get('target_lufs', -14))
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
    """Comprobación independiente: busca por correlación (FFT) en qué segundo de la canción
    está sonando el vídeo entre t_from y t_to (tramo sin voz). Devuelve el desfase medido."""
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


# ---------------------------------------------------------------- principal
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
    z = dict(ZOOM_DEFAULTS, **plan.get('zoom', {}))
    au = plan['audio']
    replica = plan.get('tipo') == 'replica'
    if replica and z['enabled'] and not z['allow_on_replica']:
        sys.exit('Zoom en réplica: hay que activarlo expresamente con zoom.allow_on_replica=true')
    avisos = list(plan.get('avisos', []))

    segs, total = build_timeline(plan['clips'])
    dur = total / FPS
    p = au.get('product_shown')
    t_prod = None
    if au['mode'] == 'cancion':
        t_prod = float(p['t']) if 't' in p else out_time_of(segs, p['clip'], segs[p['clip']]['in_frame'] + p.get('frame', 0))
        bm = beat_map(au['song'], work, TOOL / 'beatmaps', anchor=float(au['drop']))
        offset = float(au['drop']) - t_prod
        to_video = lambda xs: [r4(x - offset) for x in xs if 0 <= x - offset <= dur]
        beats, downbeats = to_video(bm['beats']), to_video(bm['downbeats'])
    else:
        src = segs[0]['path']
        bm = beat_map(src, work, TOOL / 'beatmaps')
        beats, downbeats = [b for b in bm['beats'] if b <= dur], [b for b in bm['downbeats'] if b <= dur]

    # Ajuste de cortes a beats: solo clips con snap_out=true, solo recortando, y nunca el corte del drop.
    snaps, tol = [], float(plan.get('snap_tolerance', 0.08))
    for i, c in enumerate(plan['clips'][:-1]):
        cut = segs[i]['out_end'] / FPS
        if not c.get('snap_out') or (t_prod is not None and abs(cut - t_prod) < 1e-6):
            continue
        near = [b for b in beats if 0 < cut - b <= tol]
        if near:
            trim = round((cut - max(near)) * FPS)
            if trim:
                c['out_frame'] = segs[i]['out_frame'] - trim
                snaps.append(dict(clip=i, cut_before_s=r4(cut), beat_s=max(near), trimmed_src_frames=trim))
    if snaps:
        segs, total = build_timeline(plan['clips'])
        dur = total / FPS
    if len(plan['clips']) > 1 and not snaps:
        avisos.append('Ajuste de cortes a beats: ningún corte movido (los cuerpos y réplicas conservan sus cortes; '
                      'el corte gancho→cuerpo es el ancla del drop).')

    cuts = scene_cuts(segs, z['scene_threshold'])
    cues = render_texts(plan.get('texts', []), dur, work, plan.get('font', FONT))
    zooms, zoom_skipped = ([], [])
    if z['enabled']:
        zooms, zoom_skipped = plan_zooms(z, dur, cuts, beats, downbeats, cues, [t_prod] if t_prod else [])

    # ---- vídeo: tramos → concat → (zoom) → textos
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
    if au['mode'] == 'original':
        s = segs[0]
        if len(segs) != 1 or s['speed'] != 1 or s['in_frame'] or s['out_frame'] != s['src_frames']:
            sys.exit('Audio original: v0 solo admite un clip entero sin recortes (réplica fiel)')
        aargs, audio_info = ['-map', '0:a:0', '-c:a', 'copy'], dict(mode='original', note='pista original copiada sin recodificar ni tocar')
    else:
        mix, master, audio_info = build_song_mix(au, segs, dur, t_prod, work)
        inputs += ['-i', mix]
        aargs = ['-map', f'{len(segs) + len(cues)}:a', '-af', f'volume={master:.3f}dB', '-c:a', EXPORT['acodec'],
                 '-b:a', EXPORT['abitrate'], '-ar', str(EXPORT['ar'])]
        audio_info['mode'] = 'cancion'
    run([FFMPEG, '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(graph), '-map', '[vout]', *aargs,
         *vargs, '-t', f'{dur:.6f}', '-movflags', '+faststart', out])

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
                      measure_method='correlación FFT salida↔canción en el tramo producto→final, 16 kHz',
                      nearest_song_beat_to_drop_ms=r4(min(abs(b - float(au['drop'])) for b in bm['beats']) * 1000))
    if checks['frames_output'] != total:
        avisos.append(f"Fotogramas: esperados {total}, salida {checks['frames_output']}")
    sheet = rev / f'{out.stem} - contactos.jpg'
    rows = math.ceil(dur * 2 / 6)
    run([FFMPEG, '-v', 'error', '-y', '-i', out, '-vf',
         f"fps=2,scale=240:427,drawtext=fontfile={LABEL_FONT}:text='%{{pts\\:hms}}':x=6:y=6:fontsize=22:"
         f"fontcolor=yellow:box=1:boxcolor=black@0.6,tile=6x{rows}", '-frames:v', '1', '-q:v', '3', sheet])
    for s in segs:
        s.pop('_map')
    applied = dict(
        montador='montador v0', plan=str(plan_path), plan_sha256=sha256(plan_path), id=plan['id'],
        tipo=plan.get('tipo'), output=str(out), output_sha256=sha256(out), duration_s=r4(dur), frames=total,
        clips=segs, cortes_en_salida_s=cuts, ajustes_a_beat=snaps,
        beats=dict(beatmap=bm['file'], tempo_bpm=bm['tempo_bpm'], beats_in_video_s=beats, downbeats_in_video_s=downbeats),
        audio=audio_info,
        zoom=dict(config=z, aplicados=zooms, descartados=zoom_skipped),
        textos=dict(estilo='06B', font=plan.get('font', FONT), font_sha256=sha256(plan.get('font', FONT)),
                    box_px=BOX, color='#FFFFFF', contorno='negro 0,05 em exterior', interlinea='35/31 em',
                    cues=[{k: v for k, v in c.items() if k != 'png'} for c in cues]),
        export=EXPORT, comprobaciones=checks, contactos=str(sheet), notas=plan.get('notas', []), avisos=avisos)
    (rev / f'{out.stem} - plan-aplicado.json').write_text(json.dumps(applied, indent=1, ensure_ascii=False))
    print(json.dumps(dict(output=str(out), comprobaciones=checks, zooms=len(zooms), avisos=avisos), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
