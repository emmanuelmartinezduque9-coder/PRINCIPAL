#!/usr/bin/env python3
"""Pruebas de montar_auto.py: el plan que sale de cada ficha, las pistas de una referencia de edición y un
montaje de verdad con clips y canción diminutos hechos con ffmpeg (se salta si faltan ffmpeg, numpy, Pillow o
una fuente TTF). Sin red. Se lanza con `python3 -I montador/test_montar_auto.py` (también desde vitest,
tests/montar-auto.test.ts)."""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

HAS_NUMPY = importlib.util.find_spec('numpy') is not None
HAS_PIL = importlib.util.find_spec('PIL') is not None
FFMPEG = shutil.which('ffmpeg') and shutil.which('ffprobe')
FONTS = [p for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf',
                     '/Library/Fonts/Arial.ttf') if Path(p).is_file()]

import montar_auto as ma  # noqa: E402

FPS = ma.FPS


def shot(start, end, texts=()):
    return dict(start=start, end=end, layers=[dict(kind='title', texts=list(texts))] if texts else [])


def breakdown(durations, texts_from=None, bpm=114.8):
    shots, t = [], 0.0
    for i, d in enumerate(durations):
        shots.append(shot(round(t, 3), round(t + d, 3), ['Kommentiere!'] if texts_from is not None and i >= texts_from else ['Hook']))
        t += d
    return dict(shots=shots, audio=dict(music=dict(tempo_bpm=bpm)))


SPEC = dict(version=1, videoId=12, title='Vídeo 12', kind='solo_gancho', product=dict(name='EisWerk', language='de'),
            hookMs=4000, texts=dict(main='EISWERK 😍', cta='Kommentiere „EisWerk“, wenn du auch eine willst! 🤩'),
            song=dict(path='/tmp/c.mp3', dropMs=9320, startMs=1500), editReferenceUrl=None)


class Pistas(unittest.TestCase):
    def test_cortes_ritmo_gancho_y_cta_en_el_ultimo_corte(self):
        p = ma.pistas_referencia(breakdown([3.2, 1.0, 0.8, 1.2, 1.0, 2.4], texts_from=5))
        self.assertEqual(p['planos'], 6)
        self.assertEqual(p['cortes_s'], [3.2, 4.2, 5.0, 6.2, 7.2])
        self.assertEqual(p['gancho_s'], 3.2)
        self.assertEqual(p['bpm'], 114.8)
        lo, tgt, hi = p['ritmo']['body']
        self.assertTrue(lo <= tgt <= hi)
        self.assertAlmostEqual(tgt, 1.0)
        self.assertEqual(p['ritmo']['final'][1], 2.4)
        self.assertEqual(p['cta'], 'ultimo')

    def test_cta_en_el_penultimo_y_pocos_planos(self):
        self.assertEqual(ma.pistas_referencia(breakdown([3.0, 1.0, 1.0, 1.0, 1.3, 1.2], texts_from=4))['cta'], 'penultimo')
        self.assertIsNone(ma.pistas_referencia(breakdown([3.0, 2.0])))
        self.assertIsNone(ma.pistas_referencia({}))
        # Planos rotos (sin tiempos o al revés) no cuentan.
        bad = dict(shots=[dict(start=0, end=1), dict(start='x', end=2), dict(start=3, end=2), dict(start=1, end=2), dict(start=2, end=3)])
        self.assertEqual(ma.pistas_referencia(bad)['planos'], 3)

    def test_valores_raros_se_acotan(self):
        p = ma.pistas_referencia(breakdown([0.5, 0.1, 0.1, 0.1, 9.0]))
        self.assertIsNone(p['gancho_s'])
        self.assertEqual(p['ritmo']['body'][0], 0.4)
        self.assertLessEqual(p['ritmo']['final'][2], 4.0)


class Plan(unittest.TestCase):
    def test_gancho_y_cuerpos_en_orden_con_el_drop_al_empezar_el_cuerpo(self):
        clips = [('hook', '/w/0.mp4'), ('body', '/w/1.mp4'), ('body', '/w/2.mp4')]
        plan, avisos = ma.construir_plan(SPEC, clips, '/w', '/f.ttf', gancho=(3, 99))
        self.assertEqual(plan['tipo'], 'gancho+cuerpo')
        self.assertEqual(plan['clips'], [dict(role='hook', path='/w/0.mp4', in_frame=3, out_frame=99),
                                         dict(role='body', auto=True, path='/w/1.mp4'),
                                         dict(role='body', auto=True, path='/w/2.mp4')])
        self.assertEqual(plan['audio']['mode'], 'cancion')
        self.assertEqual(plan['audio']['drop'], 9.32)
        self.assertEqual(plan['audio']['product_shown'], {})
        self.assertEqual([t['role'] for t in plan['texts']], ['main', 'cta'])
        self.assertEqual(plan['texts'][1]['text'], SPEC['texts']['cta'])
        self.assertEqual(plan['output'], '/w/salida.mp4')
        self.assertFalse(plan['zoom']['enabled'])
        self.assertEqual(avisos, [])

    def test_replica_con_cancion_drop_en_el_segundo_plano_y_sin_drop_desde_el_inicio(self):
        spec = dict(SPEC, kind='replicar', hookMs=None)
        plan, _ = ma.construir_plan(spec, [('clip', '/w/0.mp4')], '/w', '/f.ttf')
        self.assertEqual(plan['tipo'], 'replica')
        self.assertEqual(plan['clips'], [dict(role='replica', auto=True, path='/w/0.mp4')])
        self.assertEqual(plan['audio']['product_shown'], {'plano': 1})
        nodrop = dict(spec, song=dict(path='/c.mp3', dropMs=None, startMs=1500))
        plan, avisos = ma.construir_plan(nodrop, [('clip', '/w/0.mp4')], '/w', '/f.ttf')
        self.assertEqual((plan['audio']['drop'], plan['audio']['product_shown']), (1.5, {'t': 0.0}))
        self.assertTrue(avisos)

    def test_sin_cancion_audio_del_clip_o_silencio(self):
        spec = dict(SPEC, kind='replicar', song=None)
        plan, avisos = ma.construir_plan(spec, [('clip', '/w/0.mp4')], '/w', '/f.ttf', con_audio=True)
        self.assertEqual((plan['audio'], avisos), (dict(mode='original'), []))
        plan, avisos = ma.construir_plan(spec, [('clip', '/w/0.mp4')], '/w', '/f.ttf', con_audio=False)
        self.assertEqual(plan['audio'], dict(mode='silencio'))
        self.assertEqual(avisos, [ma.SIN_AUDIO])
        # Gancho sin cuerpos: se monta como una réplica.
        plan, _ = ma.construir_plan(dict(SPEC), [('hook', '/w/0.mp4')], '/w', '/f.ttf')
        self.assertEqual(plan['clips'][0]['role'], 'replica')

    def test_audio_original_es_el_de_la_referencia_desde_0(self):
        # Sin canción y con el audio de la referencia: suena desde 0, en réplica y en gancho + cuerpos.
        spec = dict(SPEC, kind='replicar', song=None, referenceAudio=dict(path='/w/ref.m4a'))
        for clips in ([('clip', '/w/0.mp4')], [('hook', '/w/0.mp4'), ('body', '/w/1.mp4')]):
            plan, avisos = ma.construir_plan(spec, clips, '/w', '/f.ttf', gancho=(0, 48), con_audio=True)
            self.assertEqual(plan['audio'], dict(mode='externo', path='/w/ref.m4a', offset=0, nota=ma.NOTA_REFERENCIA))
            self.assertEqual(avisos, [])
        # Con canción, manda la canción.
        plan, _ = ma.construir_plan(dict(SPEC, referenceAudio=dict(path='/w/ref.m4a')), [('clip', '/w/0.mp4')], '/w', '/f.ttf')
        self.assertEqual(plan['audio']['mode'], 'cancion')

    def test_las_pistas_de_la_referencia_entran_en_el_ritmo(self):
        pistas = ma.pistas_referencia(breakdown([3.0, 1.0, 1.0, 1.0, 1.3, 1.2], texts_from=4))
        plan, _ = ma.construir_plan(SPEC, [('hook', '/0'), ('body', '/1')], '/w', '/f.ttf', gancho=(0, 96), pistas=pistas)
        self.assertEqual(plan['ritmo']['body'], pistas['ritmo']['body'])
        self.assertEqual(plan['ritmo']['final'], pistas['ritmo']['final'])
        self.assertGreater(plan['ritmo']['cta_min_s'], pistas['ritmo']['final'][2])
        self.assertIn('Referencia de edición', ' '.join(plan['notas']))

    def test_rango_del_gancho(self):
        an = dict(tramos=[dict(usable=[2, 50]), dict(usable=[60, 140])])
        self.assertEqual(ma.rango_gancho(an, 4.0, 150), (2, 98))
        # El objetivo cae entre dos tramos (un corte o una cola): sale al final del anterior.
        self.assertEqual(ma.rango_gancho(an, 2.2, 150), (2, 50))
        # Nunca más de 6 s.
        self.assertEqual(ma.rango_gancho(dict(tramos=[dict(usable=[0, 300])]), 9.0, 300), (0, 144))
        # Sin tramos usables: el clip desde el principio.
        self.assertEqual(ma.rango_gancho(dict(tramos=[]), 3.0, 100), (0, 72))

    def test_motivo_corto(self):
        self.assertEqual(ma.motivo('La canción se acaba antes que el vídeo con este desfase'), 'La canción se acaba antes que el vídeo con este desfase')
        self.assertEqual(ma.motivo('ERROR en ffmpeg:\n...\nInvalid data found'), 'ERROR en ffmpeg: Invalid data found')
        self.assertEqual(len(ma.motivo('x' * 1000)), 400)


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


@unittest.skipUnless(FFMPEG and HAS_NUMPY and HAS_PIL and FONTS, 'faltan ffmpeg, numpy, Pillow o una fuente TTF')
class MontajeDeVerdad(unittest.TestCase):
    """Clips y canción diminutos: el montador entero (análisis, plan, render, autocomprobación) y su resultado."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix='prueba-montar-auto-'))
        os.environ['MONTADOR_CACHE'] = str(cls.tmp / 'cache')
        src = cls.tmp / 'fuente'
        src.mkdir()
        cls.hook = src / 'gancho.mp4'
        cls.body = src / 'cuerpo.mp4'
        cls.song = src / 'cancion.mp3'
        # 30 fps y 270×480: montar_auto los pasa a 24 fps y 1080×1920.
        ffmpeg('-f', 'lavfi', '-i', 'testsrc2=s=270x480:r=30:d=4.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(cls.hook))
        ffmpeg('-f', 'lavfi', '-i', 'mandelbrot=s=270x480:r=30', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(cls.body))
        ffmpeg('-f', 'lavfi', '-i', 'anoisesrc=d=30:c=pink:a=0.3', '-c:a', 'libmp3lame', '-b:a', '64k', str(cls.song))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)
        os.environ.pop('MONTADOR_CACHE', None)

    def montar(self, name, spec):
        work = self.tmp / name
        spec_path = self.tmp / f'{name}.json'
        spec_path.write_text(json.dumps(spec, ensure_ascii=False))
        code = ma.main([str(spec_path), str(work), '--fuente', FONTS[0]])
        return code, json.loads((work / 'resultado.json').read_text()), work

    def probe(self, path):
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)],
                             capture_output=True, text=True, check=True).stdout
        return json.loads(out)

    def test_gancho_y_cuerpo_con_cancion(self):
        spec = dict(SPEC, hookMs=3000, clips=[dict(role='hook', path=str(self.hook)), dict(role='body', path=str(self.body))],
                    song=dict(path=str(self.song), dropMs=8000, startMs=0, durationMs=30000), avisos=['aviso del agente'])
        code, result, work = self.montar('gancho', spec)
        self.assertEqual(code, 0, result)
        self.assertTrue(result['ok'])
        self.assertEqual(result['salida'], 'salida.mp4')
        self.assertIn('aviso del agente', result['avisos'])
        info = self.probe(work / 'salida.mp4')
        video = next(s for s in info['streams'] if s['codec_type'] == 'video')
        self.assertEqual((video['width'], video['height']), (1080, 1920))
        self.assertTrue(any(s['codec_type'] == 'audio' for s in info['streams']))
        self.assertGreater(result['duracion_s'], 3.0)
        chk = result['autocomprobacion']
        self.assertGreaterEqual(chk['planos'], 2)
        self.assertRegex(chk['cortesEnBeat'], r'^\d+/\d+$')
        plan = json.loads((work / 'plan.json').read_text())
        self.assertLessEqual(plan['clips'][0]['out_frame'] - plan['clips'][0]['in_frame'], 3 * FPS)
        # La caché del análisis va a MONTADOR_CACHE, no junto al montador.
        self.assertTrue((self.tmp / 'cache' / 'analisis_clips').is_dir())

    def test_replica_sin_cancion_ni_audio_queda_en_silencio(self):
        spec = dict(SPEC, kind='replicar', hookMs=None, song=None, clips=[dict(role='clip', path=str(self.body))])
        code, result, work = self.montar('replica', spec)
        self.assertEqual(code, 0, result)
        self.assertIn(ma.SIN_AUDIO, result['avisos'])
        self.assertTrue(any(s['codec_type'] == 'audio' for s in self.probe(work / 'salida.mp4')['streams']))

    def test_replica_con_el_audio_de_la_referencia(self):
        ref_audio = self.tmp / 'referencia.m4a'
        ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=330:duration=10', '-c:a', 'aac', str(ref_audio))
        spec = dict(SPEC, kind='replicar', hookMs=None, song=None, clips=[dict(role='clip', path=str(self.body))],
                    referenceAudio=dict(path=str(ref_audio)))
        code, result, work = self.montar('replica-audio-referencia', spec)
        self.assertEqual(code, 0, result)
        self.assertNotIn(ma.SIN_AUDIO, result['avisos'])
        info = self.probe(work / 'salida.mp4')
        audio = next(s for s in info['streams'] if s['codec_type'] == 'audio')
        # Recortado a lo que dura el montaje (la referencia dura más).
        self.assertLessEqual(float(audio['duration']), result['duracion_s'] + 0.1)
        applied = json.loads((work / 'revision' / 'salida - plan-aplicado.json').read_text())
        self.assertEqual((applied['audio']['mode'], applied['audio']['offset_s']), ('externo', 0.0))
        # Sin el archivo: el motivo.
        code, result, _ = self.montar('sin-audio', dict(spec, referenceAudio=dict(path=str(self.tmp / 'no.m4a'))))
        self.assertEqual((code, result), (1, dict(ok=False, error='Falta el audio de la referencia descargado')))

    def test_replica_con_cancion_y_referencia_el_drop_al_empezar_el_segundo_plano(self):
        ref = self.tmp / 'breakdown.json'
        ref.write_text(json.dumps(breakdown([2.0, 0.8, 0.8, 0.9, 1.0, 2.0], texts_from=5)))
        spec = dict(SPEC, kind='replicar', hookMs=None, clips=[dict(role='clip', path=str(self.hook))],
                    song=dict(path=str(self.song), dropMs=6000, startMs=0, durationMs=30000), referencia=dict(breakdown=str(ref)))
        code, result, work = self.montar('replica-cancion', spec)
        self.assertEqual(code, 0, result)
        self.assertEqual(result['pistas_referencia']['cta'], 'ultimo')
        plan = json.loads((work / 'plan.json').read_text())
        self.assertEqual(plan['audio']['product_shown'], {'plano': 1})
        self.assertEqual(plan['ritmo']['final'], result['pistas_referencia']['ritmo']['final'])
        applied = json.loads((work / 'revision' / 'salida - plan-aplicado.json').read_text())
        if len(applied['planos']) > 1:
            self.assertAlmostEqual(applied['audio']['product_shown_s'], applied['planos'][1]['start_s'], delta=0.001)
            self.assertAlmostEqual(applied['comprobaciones']['drop_time_in_output_s'], applied['planos'][1]['start_s'], delta=0.02)

    def test_un_fallo_deja_el_motivo(self):
        spec = dict(SPEC, clips=[dict(role='hook', path=str(self.tmp / 'no-existe.mp4'))])
        code, result, _ = self.montar('roto', spec)
        self.assertEqual((code, result), (1, dict(ok=False, error='Falta un clip descargado')))
        short = dict(SPEC, kind='replicar', clips=[dict(role='clip', path=str(self.body))],
                     song=dict(path=str(self.song), dropMs=29000, startMs=0, durationMs=30000))
        code, result, _ = self.montar('corta', short)
        self.assertEqual(code, 1)
        self.assertIn('La canción se acaba antes que el vídeo', result['error'])


if __name__ == '__main__':
    unittest.main(verbosity=1)
