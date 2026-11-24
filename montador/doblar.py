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
        si se da; si no, sobre negro). Imprime un JSON con niveles por pista, `voz` (si hay palabras, su idioma y sus
        frases con los datos de Whisper) y `candidatas` (frases del mismo idioma que quedaron en la música).
  python doblar.py rescatar <carpeta> [desde:hasta …] [--video ref.mp4]
      → pasa a la voz las frases de la música que son habla y rehace dialogue-only.mp4.
  python doblar.py mezclar <carpeta> <doblaje.mp4|wav> <salida.m4a>
      → salida.m4a = música + efectos originales + voz doblada, con la duración del original.
  python doblar.py comprobar <montaje.m4a> [--origen en] [--destino de]
      → las frases que siguen en el idioma original (Whisper, idioma frase a frase).
  python doblar.py tramo <carpeta> <desde> <hasta> <trozo.mp4> [--video ref.mp4]
      → el MP4 con solo la voz de ese trozo (moviendo a la voz lo que quedara en la música), para volver a doblarlo.
  python doblar.py injertar <voz_doblada> <trozo_doblado> <desde> <salida.wav>
      → la voz doblada con el trozo nuevo en su sitio.
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


RELLENO_S = 0.25      # margen alrededor de una frase al moverla o doblarla
FUNDIDO_S = 0.04
WHISPER_RATE = 16000


def whisper():
    """El modelo Whisper `base` (faster-whisper, CPU) o `None` si no está instalado."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    return WhisperModel(WHISPER_MODELO, device='cpu', compute_type='int8',
                        download_root=os.environ.get('WHISPER_MODELS') or str(Path.home() / '.cache' / 'principal-whisper'))


def leer(path, rate=RATE):
    """Audio estéreo float32 [n, 2] a `rate`."""
    raw = ffmpeg('-i', path, '-map', '0:a:0', '-vn', '-ac', '2', '-ar', rate, '-f', 'f32le', 'pipe:1')
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()


def escribir_wav(path, datos, rate=RATE):
    ffmpeg('-f', 'f32le', '-ar', rate, '-ac', 2, '-i', 'pipe:0', '-c:a', 'pcm_f32le', path,
           entrada=np.ascontiguousarray(datos, dtype='<f4').tobytes())


def mono16k(x):
    """[n, 2] a 48 kHz → mono a 16 kHz para Whisper."""
    m = x.mean(axis=1).astype(np.float32)
    n = int(len(m) * WHISPER_RATE / RATE)
    return np.interp(np.linspace(0, len(m) - 1, n), np.arange(len(m)), m).astype(np.float32)


MAX_NO_HABLA = 0.6  # `no_speech_prob` de Whisper por encima de esto: no es habla
UMBRAL_CANDIDATA = 0.3  # idioma de una frase de la música para ofrecérsela a Claude (habla o canto)


def frases(modelo, x, vad=True):
    """Frases de `x` ([n, 2] a 48 kHz) con su idioma (frase a frase) y lo seguro que está Whisper de que es habla:
    [{desde, hasta, texto, idioma, prob, no_habla, confianza}] (`no_habla` = `no_speech_prob`, `confianza` =
    `avg_logprob`). Sirven para decidir si es diálogo o letra cantada (`doblaje.ts` lo pregunta a Claude)."""
    audio = mono16k(x)
    trozos, _ = modelo.transcribe(audio, vad_filter=vad, beam_size=1)
    out = []
    for t in trozos:
        texto = t.text.strip()
        if not texto:
            continue
        a, b = int(t.start * WHISPER_RATE), int(t.end * WHISPER_RATE)
        trozo = audio[a:max(b, a + WHISPER_RATE // 2)]
        idioma, prob, _ = modelo.detect_language(trozo) if len(trozo) >= WHISPER_RATE // 4 else (None, 0.0, None)
        out.append(dict(desde=round(t.start, 2), hasta=round(t.end, 2), texto=texto[:200], idioma=idioma,
                        prob=round(float(prob), 2), no_habla=round(float(t.no_speech_prob), 2),
                        confianza=round(float(t.avg_logprob), 2)))
    return out


def detectar_dialogo(modelo, voz_wav, voz_db):
    """¿Hay voz con palabras en la pista de voz y en qué idioma? Sin palabras, con una voz casi muda o con un idioma
    dudoso (< 0,5) no hay. Devuelve también sus `frases`; si es HABLA o CANTO lo decide después `doblaje.ts` (Claude con
    el texto y los datos de Whisper). `None` si falta Whisper: entonces no se dobla."""
    if voz_db < UMBRAL_VOZ_DB:
        return dict(hay=False, idioma=None, probabilidad=None, texto='', motivo='voz casi muda', frases=[])
    if modelo is None:
        return None
    trozos, info = modelo.transcribe(str(voz_wav), vad_filter=True, beam_size=1, without_timestamps=True)
    texto = ' '.join(t.text for t in trozos).strip()
    prob = round(float(info.language_probability), 2)
    hay = bool(texto) and prob >= UMBRAL_IDIOMA
    lista = [f for f in frases(modelo, leer(voz_wav)) if f['no_habla'] <= MAX_NO_HABLA] if hay else []
    return dict(hay=hay, idioma=info.language, probabilidad=prob, texto=texto[:300], frases=lista,
                motivo=None if hay else ('sin palabras' if not texto else 'idioma dudoso'))


def voces_mdx(x):
    """Las voces de `x` ([n, 2] a 48 kHz) con UVR MDX-Net (rea-video): (voces, resto) a 48 kHz."""
    from rea_video import stems as mdx
    tmp = Path(os.environ.get('TMPDIR') or '/tmp') / f'doblar-mdx-{os.getpid()}.wav'
    try:
        escribir_wav(tmp, x)
        mezcla = mdx.load_stereo(tmp)  # [2, n] a 44,1 kHz
        voces, _ = mdx.separate(mezcla)
        escribir_wav(tmp, voces.T, rate=mdx.SR)
        v = leer(tmp)
    finally:
        tmp.unlink(missing_ok=True)
    n = min(len(v), len(x))
    v = np.pad(v[:n], ((0, len(x) - n), (0, 0)))
    return v, x - v


def ventana(n, a, b):
    """Peso 0–1 de la ventana [a, b) (muestras) con fundidos, sobre n muestras."""
    w = np.zeros(n, np.float32)
    a, b = max(0, a), min(n, b)
    if b <= a:
        return w
    f = max(1, int(FUNDIDO_S * RATE))
    w[a:b] = 1
    w[a:a + f] = np.linspace(0, 1, min(f, b - a))
    w[max(a, b - f):b] = np.linspace(1, 0, b - max(a, b - f))
    return w


def ampliar(voces, a, b, hueco=0.3, maximo=1.2, umbral_db=-42.0):
    """Amplía [a, b] (s) hacia los lados mientras sigan sonando voces (`voces`, [n, 2] a 48 kHz) con huecos de como mucho
    `hueco` s y hasta `maximo` s por lado: Whisper corta tarde o temprano las frases gritadas o pegadas a otra."""
    paso = int(0.05 * RATE)
    m = voces.mean(axis=1)
    n = len(m) // paso
    db = 20 * np.log10(np.sqrt(np.mean(np.square(m[:n * paso].reshape(n, paso), dtype='float64'), axis=1)) + 1e-9)
    activo = db > umbral_db

    def borde(i, d):
        limite, sin_voz = int(maximo / 0.05), 0
        j = i
        for k in range(1, limite + 1):
            t = i + d * k
            if not 0 <= t < n:
                break
            if activo[t]:
                j, sin_voz = t, 0
            else:
                sin_voz += 1
                if sin_voz * 0.05 > hueco:
                    break
        return j

    ia, ib = min(n - 1, max(0, int(a / 0.05))), min(n - 1, max(0, int(b / 0.05)))
    return round(borde(ia, -1) * 0.05, 2), round((borde(ib, 1) + 1) * 0.05, 2)


def mover_voz_de_la_musica(carpeta, tramos):
    """La voz que BandIt dejó en la música (o en los efectos) dentro de `tramos` [(desde, hasta) s] pasa a la pista de voz
    (UVR MDX separa voces y resto en esos trozos); fuera de ellos la música no se toca."""
    voz, musica, efectos = (leer(carpeta / f'{n}.wav') for n in STEMS)
    peso = np.zeros(len(musica), np.float32)
    for a, b in tramos:
        peso = np.maximum(peso, ventana(len(musica), int((a - RELLENO_S) * RATE), int((b + RELLENO_S) * RATE)))
    for nombre, pista in (('music', musica), ('sfx', efectos)):
        v, _ = voces_mdx(pista)
        movida = v * peso[:, None]
        voz = voz + movida
        pista -= movida
        escribir_wav(carpeta / f'{nombre}.wav', pista)
    escribir_wav(carpeta / 'speech.wav', voz)


def video_dialogo(carpeta, video, salida, desde=None, hasta=None):
    """MP4 con SOLO la voz (la que se sube a Higgsfield), con la imagen de la referencia o negro; con `desde`/`hasta`,
    solo ese trozo. La duración se fija con `-t` (con la fuente negra infinita, `-shortest` se pasa casi un segundo)."""
    corte = (['-ss', f'{desde:.3f}', '-to', f'{hasta:.3f}'] if desde is not None else [])
    largo = (hasta - desde) if desde is not None else duracion(carpeta / 'speech.wav')
    fin = ['-t', f'{largo:.3f}']
    if video and Path(video).is_file():
        ffmpeg(*corte, '-i', video, *corte, '-i', carpeta / 'speech.wav', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264',
               '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', *fin, salida)
    else:
        ffmpeg('-f', 'lavfi', '-i', NEGRO, *corte, '-i', carpeta / 'speech.wav', '-map', '0:v:0', '-map', '1:a:0', '-c:v',
               'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', *fin, salida)


def separar(fuente, carpeta, video=None, destino=None):
    """Voz, música y efectos de `fuente` en `carpeta` (WAV estéreo de 48 kHz en coma flotante) y `dialogue-only.mp4`.
    Las frases en otro idioma que el anuncio que haya en la música y los efectos salen como `candidatas` (BandIt mete a
    veces el diálogo en la música), sin mover nada; `doblaje.ts` decide con Claude si cada frase es habla o letra
    cantada y solo dobla la habla (`rescatar`). Una canción no se traduce nunca."""
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    if not tiene_audio(fuente):
        raise Fallo('La referencia no trae audio: no hay diálogo que traducir')
    x = leer(fuente)
    if len(x) < RATE // 2:
        raise Fallo('El audio de la referencia dura menos de medio segundo')
    effects, sesion = modelo()
    # Como en Codex: canal a canal (el modelo es mono).
    pistas = np.stack([effects.separate(np.ascontiguousarray(x[:, c]), sesion) for c in range(2)], axis=-1)  # 3, n, 2
    escribir_wav(carpeta / 'mix.wav', x)
    for i, nombre in enumerate(STEMS):
        escribir_wav(carpeta / f'{nombre}.wav', pistas[i])
    r = dict(ok=True, segundos=round(len(x) / RATE, 3), mix_db=rms_db(x),
             **{f'{n}_db': rms_db(pistas[i]) for i, n in enumerate(STEMS)})
    w = whisper()
    voz = detectar_dialogo(w, carpeta / 'speech.wav', r['speech_db'])
    candidatas = []
    if w is not None:
        # También con la voz muda: BandIt mete a veces TODO el diálogo en la música (vídeo 22: «Three, two, one,
        # let's…»). Son solo candidatas: Claude decide frase a frase si son habla o la letra de la canción.
        for i, nombre in ((1, 'music'), (2, 'sfx')):
            voces, _ = voces_mdx(pistas[i])  # Whisper oye mejor las voces aisladas que la música entera
            for f in frases(w, voces):
                # Umbral bajo a propósito: en frases cortas Whisper duda del idioma (la cuenta atrás del vídeo 22 salió
                # «en» al 0,50 una vez y por debajo otra, y se quedó sin doblar). Quien decide es Claude (habla/canto).
                if f['idioma'] and f['idioma'] != destino and f['prob'] >= UMBRAL_CANDIDATA and f['no_habla'] <= MAX_NO_HABLA:
                    a, b = ampliar(voces, f['desde'], f['hasta'])
                    candidatas.append(dict(f, pista=nombre, desde=a, hasta=b))
    dialogo = carpeta / 'dialogue-only.mp4'
    video_dialogo(carpeta, video, dialogo)
    r.update(dialogo=str(dialogo), voz=voz, candidatas=candidatas)
    return r


def rescatar(carpeta, tramos, video=None, habla=None):
    """Deja en la pista de voz SOLO lo que es habla: pasa a la voz la voz de la música en `tramos` [(desde, hasta)] (frases
    de habla que BandIt dejó en la música) y, con `habla` (todas las ventanas de habla), devuelve a la música lo que la
    voz tenga fuera de ellas (canto: no se dobla y sigue sonando igual). Rehace `dialogue-only.mp4`."""
    carpeta = Path(carpeta)
    if tramos:
        mover_voz_de_la_musica(carpeta, tramos)
    if habla is not None:
        voz, musica = leer(carpeta / 'speech.wav'), leer(carpeta / 'music.wav')
        peso = np.zeros(len(voz), np.float32)
        for a, b in habla:
            peso = np.maximum(peso, ventana(len(voz), int((a - RELLENO_S) * RATE), int((b + RELLENO_S) * RATE)))
        n = min(len(voz), len(musica))
        fuera = voz[:n] * (1 - peso[:n, None])
        escribir_wav(carpeta / 'music.wav', musica[:n] + fuera)
        escribir_wav(carpeta / 'speech.wav', voz[:n] - fuera)
    video_dialogo(carpeta, video, carpeta / 'dialogue-only.mp4')
    return dict(ok=True, tramos=[[a, b] for a, b in tramos], habla=[[a, b] for a, b in (habla or [])])


def comprobar(audio, origen, destino, ventanas=None):
    """Frases del montaje doblado que siguen en el idioma ORIGINAL del diálogo (`origen`) DENTRO de las ventanas del
    diálogo (`ventanas` [(desde, hasta)]; fuera está la canción, que no se traduce nunca): [{desde, hasta, texto, idioma}].
    Whisper detecta el idioma frase a frase."""
    w = whisper()
    if w is None:
        return None
    quedan = []
    for f in frases(w, leer(audio)):
        dentro = ventanas is None or any(f['desde'] < b + RELLENO_S and f['hasta'] > a - RELLENO_S for a, b in ventanas)
        # En el idioma original del diálogo cuenta aunque Whisper dude (el vídeo 22 pasó con «en» al 58 %); sin saber
        # el idioma original, solo si está seguro.
        if (dentro and f['idioma'] and f['idioma'] != destino and f['no_habla'] <= MAX_NO_HABLA
                and (f['idioma'] == origen or (origen is None and f['prob'] >= 0.6))):
            quedan.append(dict(desde=f['desde'], hasta=f['hasta'], texto=f['texto'][:120], idioma=f['idioma'], probabilidad=f['prob']))
    return quedan


def tramo(carpeta, desde, hasta, salida, video=None):
    """Prepara un trozo para volver a doblarlo: la voz que quede en la música en [desde, hasta] pasa a la pista de voz y
    se hace el MP4 con solo ese trozo de voz (con margen)."""
    carpeta = Path(carpeta)
    mover_voz_de_la_musica(carpeta, [(desde, hasta)])
    a = max(0.0, desde - RELLENO_S)
    b = min(duracion(carpeta / 'speech.wav'), hasta + RELLENO_S)
    video_dialogo(carpeta, video, salida, a, b)
    return dict(ok=True, desde=round(a, 3), hasta=round(b, 3), salida=str(salida))


def injertar(doblaje, trozo, desde, salida):
    """La voz doblada entera con el trozo vuelto a doblar puesto en su sitio (desde `desde` s), con fundidos."""
    voz = leer(doblaje)
    nuevo = leer(trozo)
    a = int(desde * RATE)
    b = min(len(voz), a + len(nuevo))
    w = ventana(len(voz), a, b)[:, None]
    pieza = np.zeros_like(voz)
    pieza[a:b] = nuevo[:b - a]
    escribir_wav(salida, voz * (1 - w) + pieza * w)
    return dict(ok=True, salida=str(salida))


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
    s.add_argument('--destino', help='idioma del anuncio (ISO 639-1)')
    c = cmds.add_parser('comprobar')
    c.add_argument('audio', type=Path)
    c.add_argument('--origen')
    c.add_argument('--destino')
    c.add_argument('--ventanas', nargs='*', help='desde:hasta del diálogo (fuera no se mira: es la canción)')
    rs = cmds.add_parser('rescatar')
    rs.add_argument('carpeta', type=Path)
    rs.add_argument('tramos', nargs='*', help='desde:hasta en segundos')
    rs.add_argument('--video', type=Path)
    rs.add_argument('--habla', nargs='*', help='desde:hasta de TODA la habla (fuera, la voz vuelve a la música)')
    t = cmds.add_parser('tramo')
    t.add_argument('carpeta', type=Path)
    t.add_argument('desde', type=float)
    t.add_argument('hasta', type=float)
    t.add_argument('salida', type=Path)
    t.add_argument('--video', type=Path)
    j = cmds.add_parser('injertar')
    j.add_argument('doblaje', type=Path)
    j.add_argument('trozo', type=Path)
    j.add_argument('desde', type=float)
    j.add_argument('salida', type=Path)
    m = cmds.add_parser('mezclar')
    m.add_argument('carpeta', type=Path)
    m.add_argument('doblaje', type=Path)
    m.add_argument('salida', type=Path)
    a = p.parse_args(argv)
    try:
        if a.orden == 'separar':
            r = separar(a.fuente, a.carpeta, a.video, a.destino)
        elif a.orden == 'comprobar':
            ventanas = [tuple(float(v) for v in x.split(':')) for x in a.ventanas] if a.ventanas is not None else None
            quedan = comprobar(a.audio, a.origen, a.destino, ventanas)
            r = dict(ok=True, comprobado=quedan is not None, quedan=quedan or [])
        elif a.orden == 'rescatar':
            habla = [tuple(float(v) for v in x.split(':')) for x in a.habla] if a.habla is not None else None
            r = rescatar(a.carpeta, [tuple(float(v) for v in x.split(':')) for x in a.tramos], a.video, habla)
        elif a.orden == 'tramo':
            r = tramo(a.carpeta, a.desde, a.hasta, a.salida, a.video)
        elif a.orden == 'injertar':
            r = injertar(a.doblaje, a.trozo, a.desde, a.salida)
        else:
            r = mezclar(a.carpeta, a.doblaje, a.salida)
    except Fallo as error:
        r = dict(ok=False, error=str(error))
    print(json.dumps(r, ensure_ascii=False))
    if a.resultado:
        a.resultado.write_text(json.dumps(r, ensure_ascii=False))
    return 0 if r['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
