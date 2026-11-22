"""Separa la voz del audio de un gancho con HTDemucs (demucs de PyPI, modelo htdemucs).

uso: python separar.py <entrada.mp4> <salida_voz.wav> [hasta_segundos]
Escribe también <salida>.resto.wav (todo lo que no es voz) y muestra métricas.
No certifica una voz limpia: hay que mirar/escuchar. Nadie ha escuchado nada aquí.
En el Mac: uv run --no-project --python 3.11 --with demucs --with soundfile --with numpy python separar.py …
(TORCH_HOME=/Volumes/T7/PRINCIPAL/pedido-54/trabajo/torch-cache).
"""
import sys, subprocess, json
import numpy as np, torch
from demucs.pretrained import get_model
from demucs.apply import apply_model

FF = '/Users/emmanuelmartinezduque/.local/bin/ffmpeg'
src, out = sys.argv[1], sys.argv[2]
hasta = float(sys.argv[3]) if len(sys.argv) > 3 else None
model = get_model('htdemucs').eval()
rate = model.samplerate
cmd = [FF, '-nostdin', '-v', 'error', '-i', src, '-map', '0:a:0', '-vn', '-ac', '2', '-ar', str(rate)]
if hasta:
    cmd += ['-t', str(hasta)]
raw = subprocess.run(cmd + ['-f', 'f32le', 'pipe:1'], check=True, capture_output=True).stdout
x = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()
wav = torch.from_numpy(x.T.copy()); ref = wav.mean(0); m = ref.mean(); s = ref.std() + 1e-8
with torch.inference_mode():
    o = apply_model(model, ((wav - m) / s)[None], device='cpu', shifts=1, split=True, overlap=.25, progress=False)[0]
    o = (o * s + m).cpu().numpy().transpose(0, 2, 1)
voc = o[model.sources.index('vocals')]
resto = sum(o[i] for i, n in enumerate(model.sources) if n != 'vocals')

def w(p, a):
    subprocess.run([FF, '-nostdin', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(rate), '-ac', '2', '-i', 'pipe:0',
                    '-c:a', 'pcm_s16le', p], input=a.astype('<f4').tobytes(), check=True)

w(out, voc); w(out.replace('.wav', '.resto.wav'), resto)
rms = lambda a: float(np.sqrt((a.astype('float64') ** 2).mean()) + 1e-12)
win = int(rate * .25)
perfil = [round(20 * np.log10(rms(voc[i:i + win])), 1) for i in range(0, len(voc), win)]
print(json.dumps(dict(entrada=src, segundos=len(x) / rate, rms_original_db=round(20 * np.log10(rms(x)), 1),
                      rms_voz_db=round(20 * np.log10(rms(voc)), 1), rms_resto_db=round(20 * np.log10(rms(resto)), 1),
                      perfil_voz_db_cada_025s=perfil, escuchado=False), ensure_ascii=False))
