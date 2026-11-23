#!/usr/bin/env python3
"""doblar: «Traducir el diálogo al alemán» — separa la voz de la música, y vuelve a mezclar la voz doblada.

Copia de lo que funcionó en Codex el 19/11/2026 (`EDITOR/dialogue_stems.py` + `EDITOR/reference_dubbing.py`,
prueba real `AUTOMATIZACION SEGA/Audio/Pruebas/Df5AlGsNWCn/DE`):
  1. BandIt v2, checkpoint multilingüe (Watcharasupat et al., pesos CC BY-SA 4.0), separa el audio en
     voz (`speech`), música (`music`) y efectos (`sfx`), canal a canal, a 48 kHz.
  2. Un MP4 con SOLO la voz (`dialogue-only.mp4`) se sube a Higgsfield, modelo `dubbing`
     (`target_language: deu`), que la vuelve a decir en alemán. Eso lo hace la web (montaje-nube.ts).
  3. La voz alemana se mezcla sobre la música y los efectos ORIGINALES, sin tocarlos:
     `amix=inputs=3:normalize=0` + limitador a 0,98 (el mismo filtro de Codex). La duración no cambia.

Única diferencia con Codex: el modelo corre en ONNX (la conversión de rea-video, mismos pesos, ya en la imagen de
Railway) en vez de PyTorch, para no meter PyTorch en la imagen. `test_doblar.py` comprueba que da lo mismo.

Uso (`--resultado <archivo.json>` antes de la orden deja también el resultado en ese archivo):
  python doblar.py separar <audio_o_video> <carpeta> [--video <referencia.mp4>]
      → carpeta/{mix,speech,music,sfx}.wav y carpeta/dialogue-only.mp4 (la voz sobre la imagen de la referencia
        si se da; si no, sobre negro). Imprime un JSON con niveles por pista y `voz`: si hay diálogo y su idioma
        (Whisper), para no doblar lo que no tiene diálogo o ya está en el idioma del anuncio.
  python doblar.py mezclar <carpeta> <doblaje.mp4|wav> <salida.m4a>
      → salida.m4a = música + efectos originales + voz doblada, con la duración del original.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np

RATE = 48000
STEMS = ('speech', 'music', 'sfx')  # orden de las máscaras del modelo (rea-video las llama speech/music/effects)
TOLERANCIA_S = 0.15  # la de Codex: si el doblaje dura distinto, no se mezcla
NEGRO = 'color=c=black:s=720x1280:r=24'


class Fallo(Exception):
    """Un motivo para la persona."""


def ffmpeg(*args, entrada=None):
    r = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', *map(str, args)], input=entrada, capture_output=True)
    if r.returncode:
        raise Fallo(f'ffmpeg falló: {r.stderr.decode(errors="replace").strip().splitlines()[-1:]}')
    return r.stdout


def duracion(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        raise Fallo(f'No se puede leer la duración de {Path(path).name}') from None


def tiene_audio(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0',
                          str(path)], capture_output=True, text=True)
    return bool(out.stdout.strip())


def modelo():
    """La sesión ONNX de BandIt v2 (rea-video la baja una vez a $REA_VIDEO_MODELS y comprueba su SHA-256)."""
    try:
        import onnxruntime as ort
        from rea_video import effects
        from rea_video.stems import MODEL_THREADS
    except ImportError as error:
        raise Fallo(f'Falta rea-video/onnxruntime para separar la voz ({error})') from None
    so = ort.SessionOptions()
    so.intra_op_num_threads = MODEL_THREADS
    return effects, ort.InferenceSession(str(effects.ensure_model()), so, providers=['CPUExecutionProvider'])


def rms_db(x):
    return round(float(20 * np.log10(np.sqrt(np.mean(np.square(x, dtype='float64'))) + 1e-9)), 1)


WHISPER_MODELO = 'base'
UMBRAL_VOZ_DB = -45.0
UMBRAL_IDIOMA = 0.5


def detectar_dialogo(voz, voz_db):
    """¿Hay diálogo en la voz separada y en qué idioma? Whisper (faster-whisper, modelo `base`, CPU) con detector de
    voz: sin palabras, o con una voz casi muda, no hay diálogo; un idioma dudoso (< 0,5) tampoco cuenta (suele ser la
    letra de la canción colándose en la voz). `None` si falta Whisper: entonces no se dobla."""
    if voz_db < UMBRAL_VOZ_DB:
        return dict(hay=False, idioma=None, probabilidad=None, texto='', motivo='voz casi muda')
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    modelo = WhisperModel(WHISPER_MODELO, device='cpu', compute_type='int8',
                          download_root=os.environ.get('WHISPER_MODELS') or str(Path.home() / '.cache' / 'principal-whisper'))
    trozos, info = modelo.transcribe(str(voz), vad_filter=True, beam_size=1, without_timestamps=True)
    texto = ' '.join(t.text for t in trozos).strip()
    prob = round(float(info.language_probability), 2)
    hay = bool(texto) and prob >= UMBRAL_IDIOMA
    return dict(hay=hay, idioma=info.language, probabilidad=prob, texto=texto[:300],
                motivo=None if hay else ('sin palabras' if not texto else 'idioma dudoso'))


def separar(fuente, carpeta, video=None):
    """Voz, música y efectos de `fuente` en `carpeta` (WAV estéreo de 48 kHz en coma flotante) y `dialogue-only.mp4`."""
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    if not tiene_audio(fuente):
        raise Fallo('La referencia no trae audio: no hay diálogo que traducir')
    mezcla = ffmpeg('-i', fuente, '-map', '0:a:0', '-vn', '-ac', '2', '-ar', RATE, '-f', 'f32le', 'pipe:1')
    x = np.frombuffer(mezcla, dtype='<f4').reshape(-1, 2)
    if len(x) < RATE // 2:
        raise Fallo('El audio de la referencia dura menos de medio segundo')
    effects, sesion = modelo()
    # Como en Codex: canal a canal (el modelo es mono).
    pistas = np.stack([effects.separate(np.ascontiguousarray(x[:, c]), sesion) for c in range(2)], axis=-1)  # 3, n, 2

    def escribir(nombre, datos):
        ffmpeg('-f', 'f32le', '-ar', RATE, '-ac', 2, '-i', 'pipe:0', '-c:a', 'pcm_f32le', carpeta / f'{nombre}.wav',
               entrada=np.ascontiguousarray(datos, dtype='<f4').tobytes())

    escribir('mix', x)
    for i, nombre in enumerate(STEMS):
        escribir(nombre, pistas[i])
    dialogo = carpeta / 'dialogue-only.mp4'
    if video and Path(video).is_file():
        ffmpeg('-i', video, '-i', carpeta / 'speech.wav', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac',
               '-b:a', '256k', '-shortest', dialogo)
    else:
        ffmpeg('-f', 'lavfi', '-i', NEGRO, '-i', carpeta / 'speech.wav', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264',
               '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-shortest', dialogo)
    r = dict(ok=True, segundos=round(len(x) / RATE, 3), mix_db=rms_db(x),
             **{f'{n}_db': rms_db(pistas[i]) for i, n in enumerate(STEMS)}, dialogo=str(dialogo))
    r['voz'] = detectar_dialogo(carpeta / 'speech.wav', r['speech_db'])
    return r


def mezclar(carpeta, doblaje, salida):
    """Música y efectos originales + la voz doblada → `salida` (AAC), con la duración del original (filtro de Codex)."""
    carpeta = Path(carpeta)
    largo = duracion(carpeta / 'speech.wav')
    if not tiene_audio(doblaje):
        raise Fallo('El doblaje de Higgsfield no trae audio')
    if abs(duracion(doblaje) - largo) > TOLERANCIA_S:
        raise Fallo(f'El doblaje dura {duracion(doblaje):.2f} s y el original {largo:.2f} s: no se mezcla')
    ffmpeg('-i', carpeta / 'music.wav', '-i', carpeta / 'sfx.wav', '-i', doblaje,
           '-filter_complex', '[0:a][1:a][2:a]amix=inputs=3:duration=first:normalize=0,alimiter=limit=0.98:level=0:latency=1[a]',
           '-map', '[a]', '-c:a', 'aac', '-b:a', '256k', '-ar', RATE, '-t', f'{largo:.3f}', salida)
    return dict(ok=True, segundos=round(duracion(salida), 3), salida=str(salida))


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument('--resultado', type=Path, help='además de imprimirlo, deja el JSON del resultado en este archivo')
    cmds = p.add_subparsers(dest='orden', required=True)
    s = cmds.add_parser('separar')
    s.add_argument('fuente', type=Path)
    s.add_argument('carpeta', type=Path)
    s.add_argument('--video', type=Path)
    m = cmds.add_parser('mezclar')
    m.add_argument('carpeta', type=Path)
    m.add_argument('doblaje', type=Path)
    m.add_argument('salida', type=Path)
    a = p.parse_args(argv)
    try:
        r = separar(a.fuente, a.carpeta, a.video) if a.orden == 'separar' else mezclar(a.carpeta, a.doblaje, a.salida)
    except Fallo as error:
        r = dict(ok=False, error=str(error))
    print(json.dumps(r, ensure_ascii=False))
    if a.resultado:
        a.resultado.write_text(json.dumps(r, ensure_ascii=False))
    return 0 if r['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
