#!/usr/bin/env python3
"""Resumen compacto de <id>.analisis.json: planos, actividad al cortar, rótulos, zoom, cortes vs onsets/beats.
Uso: python3 resumen_patron.py carpeta_o_ficheros... [--json salida.json]"""
import json, sys
from pathlib import Path

files = []
out_json = None
args = sys.argv[1:]
if '--json' in args:
    i = args.index('--json'); out_json = args[i + 1]; args = args[:i] + args[i + 2:]
for a in args:
    p = Path(a)
    files += sorted(p.glob('*.analisis.json')) if p.is_dir() else [p]
rows = []
for f in files:
    if f.name.startswith('._'):
        continue
    d = json.loads(f.read_text())
    c = d['cortes']
    act = {p['desde']: p for p in d.get('actividad', {}).get('planos', [])}
    mov = {p['desde']: p for p in d.get('movimiento', {}).get('planos', [])}
    cm = {x['t']: x for x in (d.get('cortes_vs_musica') or {}).get('por_corte', [])}
    print(f"\n=== {f.name.replace('.analisis.json','')}  dur {d['ficha']['duracion']}  cortes {c['n_cortes']}  "
          f"mediana {c['plano_mediana']}  min {c['plano_min']}  max {c['plano_max']}")
    m = d.get('musica') or {}
    print(f"   tempo {m.get('tempo')}  drops {[(x['t'], x['subida_db']) for x in m.get('drops_candidatos', [])]}")
    b = [0.0] + [x['t'] for x in c['lista']] + [d['ficha']['duracion']]
    shots = []
    for i in range(len(b) - 1):
        a = act.get(round(b[i], 3), {}); mv = mov.get(round(b[i], 3), {})
        cut = cm.get(round(b[i + 1], 3), {})
        s = dict(desde=b[i], hasta=b[i + 1], dur=round(b[i + 1] - b[i], 3), ult_rel=a.get('ultimo_tercio_s_rel'),
                 cola=a.get('cola_quieta_s'), pico=a.get('pico_actividad_frac'), act=a.get('actividad_media'),
                 zoom=mv.get('zoom_acumulado'), desp=mv.get('desplazamiento_medio_px'),
                 a_beat=cut.get('a_beat'), a_onset=cut.get('a_onset'))
        shots.append(s)
        print(f"   {s['desde']:6.3f}-{s['hasta']:6.3f} ({s['dur']:5.3f})  act {s['act']}  ultimo⅓ {s['ult_rel']}  "
              f"cola {s['cola']}  pico {s['pico']}  zoom {s['zoom']}  desp {s['desp']}  corte→beat {s['a_beat']} onset {s['a_onset']}")
    tp = d.get('texto_pantalla', {})
    rot = [(r['inicio'], r['fin'], r['texto'][:70]) for r in tp.get('rotulos', [])] if isinstance(tp, dict) else []
    for r in rot:
        print(f"   TEXTO {r[0]:6.3f}-{r[1]:6.3f}  {r[2]}")
    cvm = d.get('cortes_vs_musica') or {}
    print(f"   % en beat {cvm.get('pct_en_beat')} (azar {cvm.get('pct_azar_beat')})  % en onset {cvm.get('pct_en_onset')} (azar {cvm.get('pct_azar_onset')})")
    rows.append(dict(id=f.name.replace('.analisis.json', ''), dur=d['ficha']['duracion'], shots=shots, textos=rot,
                     tempo=m.get('tempo'), drops=m.get('drops_candidatos'), pct_beat=cvm.get('pct_en_beat'),
                     pct_beat_azar=cvm.get('pct_azar_beat'), pct_onset=cvm.get('pct_en_onset'),
                     pct_onset_azar=cvm.get('pct_azar_onset')))
if out_json:
    Path(out_json).write_text(json.dumps(rows, ensure_ascii=False, indent=1))
