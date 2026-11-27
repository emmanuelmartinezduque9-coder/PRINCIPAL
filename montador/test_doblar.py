#!/usr/bin/env python3
"""Pruebas de doblar.py («Traducir el diálogo al alemán»): la mezcla deja la música y los efectos ORIGINALES y solo
cambia la voz, con la duración del original; un doblaje de otra duración no se mezcla; y, si el modelo BandIt v2
está en la máquina (imagen de Railway o rea-video en el Mac), la separación deja voz, música, efectos y el vídeo
con solo la voz. Sin red. `python3 -I montador/test_doblar.py` (también desde vitest, tests/doblaje.test.ts)."""
import importlib.util
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

HAS_NUMPY = importlib.util.find_spec('numpy') is not None
FFMPEG = shutil.which('ffmpeg') and shutil.which('ffprobe')

if HAS_NUMPY:
    import numpy as np
    import doblar  # noqa: E402

RATE = 48000


def tono(path, freq, segundos, canales=2, volumen=0.3):
    t = np.arange(int(RATE * segundos)) / RATE
    x = (volumen * np.sin(2 * np.pi * freq * t)).astype('<f4')
    x = np.repeat(x[:, None], canales, axis=1)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', str(canales), '-i', 'pipe:0',
                    '-c:a', 'pcm_f32le', str(path)], input=x.tobytes(), check=True)


def leer(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0', '-ac', '2', '-ar', str(RATE), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<f4').reshape(-1, 2).astype('float64')


def video_con(audio, salida, segundos):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c=black:s=64x64:r=24:d={segundos}', '-i', str(audio),
                    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', str(salida)],
                   check=True)


@unittest.skipUnless(HAS_NUMPY, 'falta numpy')
class IdiomaOriginal(unittest.TestCase):
    """Qué frase del vídeo montado sigue en el idioma original (lote 10, 25/11/2026)."""

    def frase(self, idioma, prob, desde=1.0, hasta=2.4, no_habla=0.05):
        return dict(desde=desde, hasta=hasta, texto='Ten seconds, I promise.', idioma=idioma, prob=prob, no_habla=no_habla, confianza=-0.3)

    def test_el_ingles_de_verdad_cuenta(self):
        self.assertTrue(doblar.en_idioma_original(self.frase('en', 1.0), 'en', 'de'))  # «Ten seconds, I promise.»
        self.assertTrue(doblar.en_idioma_original(self.frase('en', 0.6), None, 'de'))

    def test_una_frase_alemana_corta_con_whisper_dudando_no_cuenta(self):
        # «Der hier ist nur für mich.» salió «en» al 0,25 con large-v3-turbo.
        self.assertFalse(doblar.en_idioma_original(self.frase('en', 0.25), 'en', 'de'))
        self.assertFalse(doblar.en_idioma_original(self.frase('de', 1.0), 'en', 'de'))

    def test_lo_muy_corto_o_que_no_es_habla_no_se_juzga(self):
        self.assertFalse(doblar.en_idioma_original(self.frase('en', 0.63, 5.62, 5.82), 'en', 'de'))  # «Ja.»
        self.assertFalse(doblar.en_idioma_original(self.frase('en', 0.99, no_habla=0.9), 'en', 'de'))

    def test_una_palabra_suelta_no_cuenta(self):
        # «I.» de «but the fire is so delightful» (vídeo 46) se dobló como diálogo.
        self.assertFalse(doblar.en_idioma_original(dict(self.frase('en', 0.9), texto='I.'), 'en', 'de'))
        self.assertTrue(doblar.en_idioma_original(dict(self.frase('en', 0.9), texto='Wait, what?'), 'en', 'de'))

    def test_con_idioma_original_conocido_otro_idioma_no_cuenta(self):
        self.assertFalse(doblar.en_idioma_original(self.frase('es', 0.9), 'en', 'de'))


@unittest.skipUnless(HAS_NUMPY and FFMPEG, 'faltan numpy o ffmpeg')
class Mezcla(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix='doblar-'))
        tono(self.dir / 'music.wav', 220, 3)
        tono(self.dir / 'sfx.wav', 3000, 3, volumen=0.05)
        tono(self.dir / 'speech.wav', 500, 3)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_la_musica_y_los_efectos_quedan_igual_y_solo_cambia_la_voz(self):
        tono(self.dir / 'voz-de.wav', 700, 3)
        video_con(self.dir / 'voz-de.wav', self.dir / 'dub.mp4', 3)
        r = doblar.mezclar(self.dir, self.dir / 'dub.mp4', self.dir / 'salida.m4a')
        self.assertTrue(r['ok'])
        self.assertAlmostEqual(r['segundos'], 3.0, delta=0.06)
        salida, dub = leer(self.dir / 'salida.m4a'), leer(self.dir / 'dub.mp4')
        fondo = leer(self.dir / 'music.wav') + leer(self.dir / 'sfx.wav')
        n = min(len(salida), len(dub), len(fondo)) - RATE // 10
        resto = salida[RATE // 10:n] - dub[RATE // 10:n]
        # Lo que queda al quitar la voz doblada es la música + efectos originales (solo la pérdida del AAC).
        self.assertGreater(np.corrcoef(resto.ravel(), fondo[RATE // 10:n].ravel())[0, 1], 0.99)
        # Y la voz inglesa (500 Hz) no está.
        espectro = np.abs(np.fft.rfft(salida[:, 0]))
        f = np.fft.rfftfreq(len(salida), 1 / RATE)
        self.assertLess(espectro[np.abs(f - 500) < 3].max(), espectro[np.abs(f - 700) < 3].max() / 50)

    def test_un_doblaje_de_otra_duracion_no_se_mezcla(self):
        tono(self.dir / 'corta.wav', 700, 2)
        video_con(self.dir / 'corta.wav', self.dir / 'dub.mp4', 2)
        with self.assertRaises(doblar.Fallo):
            doblar.mezclar(self.dir, self.dir / 'dub.mp4', self.dir / 'salida.m4a')

    def test_la_orden_deja_el_resultado_en_el_archivo_pedido(self):
        tono(self.dir / 'voz-de.wav', 700, 3)
        video_con(self.dir / 'voz-de.wav', self.dir / 'dub.mp4', 3)
        out = self.dir / 'r.json'
        code = doblar.main(['--resultado', str(out), 'mezclar', str(self.dir), str(self.dir / 'dub.mp4'), str(self.dir / 's.m4a')])
        self.assertEqual(code, 0)
        self.assertIn('"ok": true', out.read_text())


@unittest.skipUnless(HAS_NUMPY and FFMPEG, 'faltan numpy o ffmpeg')
class Reparar(unittest.TestCase):
    def test_restaurar_pone_el_original_solo_en_las_ventanas(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            tono(d / 'doblado.wav', 300, 3.0)
            tono(d / 'original.wav', 900, 3.0)
            r = doblar.main(['restaurar', str(d / 'doblado.wav'), str(d / 'original.wav'), str(d / 'r.m4a'), '--ventanas', '1:2'])
            self.assertEqual(r, 0)
            x = leer(d / 'r.m4a')[:, 0]
            def tono_de(a, b):
                seg = x[int(a * RATE):int(b * RATE)]
                f = np.fft.rfftfreq(len(seg), 1 / RATE)
                return f[np.argmax(np.abs(np.fft.rfft(seg)))]
            self.assertAlmostEqual(tono_de(0.2, 0.8), 300, delta=10)   # fuera: el doblado
            self.assertAlmostEqual(tono_de(1.2, 1.8), 900, delta=10)   # dentro: el original
            self.assertAlmostEqual(tono_de(2.2, 2.8), 300, delta=10)

    def test_injertar_pone_el_trozo_nuevo_en_su_sitio_y_deja_el_resto(self):
        d = Path(tempfile.mkdtemp(prefix='doblar-injertar-'))
        try:
            tono(d / 'voz.wav', 300, 4)
            tono(d / 'trozo.wav', 900, 1)
            doblar.injertar(d / 'voz.wav', d / 'trozo.wav', 2.0, d / 'salida.wav')
            x = leer(d / 'salida.wav')[:, 0]

            def pico(a, b):
                seg = x[int(a * RATE):int(b * RATE)]
                f = np.fft.rfftfreq(len(seg), 1 / RATE)
                return f[np.argmax(np.abs(np.fft.rfft(seg)))]
            self.assertAlmostEqual(pico(0.5, 1.5), 300, delta=5)
            self.assertAlmostEqual(pico(2.2, 2.8), 900, delta=5)
            self.assertAlmostEqual(pico(3.2, 3.9), 300, delta=5)
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_ampliar_coge_la_voz_pegada_a_la_frase(self):
        x = np.zeros((RATE * 6, 2), np.float32)
        t = np.arange(int(RATE * 2.5)) / RATE
        x[int(1.5 * RATE):int(4.0 * RATE)] = (0.3 * np.sin(2 * np.pi * 200 * t))[:, None]  # voz de 1,5 a 4 s
        a, b = doblar.ampliar(x, 2.5, 3.5)  # Whisper solo vio 2,5–3,5
        self.assertAlmostEqual(a, 1.5, delta=0.06)
        self.assertAlmostEqual(b, 4.0, delta=0.06)


def modelo_disponible():
    try:
        from rea_video import effects
        from rea_video.stems import models_dir
    except ImportError:
        return False
    return (models_dir() / effects.MODEL_NAME).is_file()


@unittest.skipUnless(HAS_NUMPY and FFMPEG and modelo_disponible(), 'sin el modelo BandIt v2 de rea-video en esta máquina')
class Separacion(unittest.TestCase):
    def test_separa_voz_musica_y_efectos_y_hace_el_video_con_solo_la_voz(self):
        d = Path(tempfile.mkdtemp(prefix='doblar-sep-'))
        try:
            tono(d / 'mezcla.wav', 220, 5)
            r = doblar.separar(d / 'mezcla.wav', d / 'pistas')
            self.assertTrue(r['ok'])
            for nombre in ('mix', 'speech', 'music', 'sfx'):
                self.assertAlmostEqual(doblar.duracion(d / 'pistas' / f'{nombre}.wav'), 5.0, delta=0.02)
            self.assertAlmostEqual(doblar.duracion(d / 'pistas' / 'dialogue-only.mp4'), 5.0, delta=0.1)
            # Un tono sostenido es música, no voz.
            self.assertGreater(r['music_db'], r['speech_db'])
        finally:
            shutil.rmtree(d, ignore_errors=True)



@unittest.skipUnless(HAS_NUMPY, 'falta numpy')
class TranscribirCancion(unittest.TestCase):
    def test_whisper_cancion_entera_sin_vad_con_tiempos(self):
        from unittest.mock import Mock, patch
        from types import SimpleNamespace as NS
        model = Mock()
        model.transcribe.return_value = ([NS(start=0.2, end=1.8, text=' Oma Hildegard', words=[
            NS(word=' Oma', start=0.2, end=0.7), NS(word=' Hildegard', start=0.7, end=1.8)])], NS(language='de'))
        with patch.object(doblar, 'whisper', return_value=model), patch.object(doblar, 'tiene_audio', return_value=True), \
             patch.object(doblar, 'duracion', return_value=20):
            result = doblar.transcribir(Path('/referencia.mp4'))
        model.transcribe.assert_called_once_with('/referencia.mp4', vad_filter=False, beam_size=1, word_timestamps=True)
        self.assertEqual(result['idioma'], 'de')
        self.assertEqual(result['texto'], 'Oma Hildegard')
        self.assertEqual(result['segundos'], 20)
        self.assertEqual(result['words'][0], dict(word='Oma', startMs=200, endMs=700))

    def test_sin_whisper_falla_en_vez_de_generar_sin_contexto(self):
        from unittest.mock import patch
        with patch.object(doblar, 'whisper', return_value=None), patch.object(doblar, 'tiene_audio', return_value=True):
            with self.assertRaisesRegex(doblar.Fallo, 'Falta Whisper'):
                doblar.transcribir(Path('/referencia.mp4'))

if __name__ == '__main__':
    unittest.main(verbosity=2)
