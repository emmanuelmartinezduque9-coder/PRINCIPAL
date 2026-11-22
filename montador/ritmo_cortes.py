#!/usr/bin/env python3
"""¿Caen los cortes (y los cambios de rótulo) en golpes de la música más de lo que saldría por azar?
Para cada <id>.analisis.json: carga el audio del vídeo, calcula los golpes fuertes (picos del onset_strength en el
25 % superior) y los beats de librosa; mide la distancia de cada corte al golpe fuerte más cercano y compara con
2000 desplazamientos aleatorios de todos los cortes a la vez (mismo patrón, fase al azar) → p-valor.
Uso: uv run ... python ritmo_cortes.py carpeta [--tol 0.06] [--json salida.json]"""
import json, subprocess, sys, tempfile
from pathlib import Path
import numpy as np, librosa

FF = str(Path.home() / '.local/bin/ffmpeg')
args = sys.argv[1:]
tol = 0.06
out_json = None
if '--tol' in args:
    i = args.index('--tol'); tol = float(args[i + 1]); args = args[:i] + args[i + 2:]
if '--json' in args:
    i = args.index('--json'); out_json = args[i + 1]; args = args[:i] + args[i + 2:]
files = []
for a in args:
    p = Path(a)
    files += sorted(x for x in p.glob('*.analisis.json') if not x.name.startswith('._')) if p.is_dir() else [p]
rng = np.random.default_rng(0)
res = []
for f in files:
    d = json.loads(f.read_text())
    video = d['ficha']['archivo']
    cuts = np.array([c['t'] for c in d['cortes']['lista']])
    if len(cuts) < 2:
        continue
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / 'a.wav'
        subprocess.run([FF, '-v', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '22050', str(wav)], check=True)
        y, sr = librosa.load(str(wav), sr=22050)
    env = librosa.onset.onset_strength(y=y, sr=sr)
    tt = librosa.times_like(env, sr=sr)
    pk = librosa.util.peak_pick(env, pre_max=3, post_max=3, pre_avg=5, post_avg=5, delta=0.0, wait=4)
    strong = tt[pk[env[pk] >= np.percentile(env[pk], 75)]] if len(pk) else np.array([])
    _, bf = librosa.beat.beat_track(onset_envelope=env, sr=sr, tightness=100)
    beats = librosa.frames_to_time(bf, sr=sr)
    dur = d['ficha']['duracion']

    def frac(cs, ref):
        if not len(ref):
            return 0.0
        dist = np.min(np.abs(cs[:, None] - ref[None, :]), axis=1)
        return float(np.mean(dist <= tol))

    def test(ref):
        real = frac(cuts, ref)
        sims = []
        for _ in range(2000):
            sh = (cuts + rng.uniform(-1.0, 1.0)) % dur
            sims.append(frac(sh, ref))
        sims = np.array(sims)
        return dict(real=round(real, 2), azar=round(float(sims.mean()), 2), p=round(float(np.mean(sims >= real)), 3))
    dist_s = [round(float(np.min(np.abs(strong - c))) if len(strong) else 9, 3) for c in cuts]
    signed = [round(float((c - strong[np.argmin(np.abs(strong - c))])) if len(strong) else 9, 3) for c in cuts]
    r = dict(id=f.name.replace('.analisis.json', ''), n_cortes=len(cuts), tol=tol,
             golpes_fuertes=test(strong), beats_librosa=test(beats), corte_menos_golpe_s=signed,
             densidad_golpes_por_s=round(len(strong) / dur, 2))
    res.append(r)
    print(f"{r['id'][:34]:34s} cortes {len(cuts):2d}  golpes fuertes ±{int(tol*1000)}ms: {r['golpes_fuertes']}  "
          f"beats: {r['beats_librosa']}  corte-golpe {signed}")
allc = sum(r['n_cortes'] for r in res)
if res:
    rf = sum(r['golpes_fuertes']['real'] * r['n_cortes'] for r in res) / allc
    af = sum(r['golpes_fuertes']['azar'] * r['n_cortes'] for r in res) / allc
    rb = sum(r['beats_librosa']['real'] * r['n_cortes'] for r in res) / allc
    ab = sum(r['beats_librosa']['azar'] * r['n_cortes'] for r in res) / allc
    print(f'TOTAL {allc} cortes: en golpe fuerte {rf:.2f} (azar {af:.2f}); en beat {rb:.2f} (azar {ab:.2f})')
if out_json:
    Path(out_json).write_text(json.dumps(res, indent=1, ensure_ascii=False))
