#!/usr/bin/env python3
"""Pruebas de texto06b.py: los rótulos tienen que verse como los del Swift del Mac (texto06b.swift).

`referencias-06b/` guarda lo que dibujó el Swift en el Mac (23/11/2026) para `referencias-06b/cues.json`. Aquí se
dibujan los mismos rótulos y se comparan píxel a píxel sobre un fondo gris: mismo tamaño de letra, misma caja
y diferencia media de color pequeña. Necesita la fuente (`MONTADOR_FUENTE` o la ruta del disco del Mac) y
freetype-py, uharfbuzz, Pillow y numpy; si falta algo, se salta. Se lanza con `python3 montador/test_texto06b.py`.
"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
REF = HERE / 'referencias-06b'
FONT = os.environ.get('MONTADOR_FUENTE') or '/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/EDITOR/fonts/TikTok-Display-Medium.ttf'
DEPS = all(importlib.util.find_spec(n) for n in ('freetype', 'uharfbuzz', 'PIL', 'numpy'))
# Tamaños que eligió el Swift para cada rótulo de cues.json.
SWIFT_SIZES = [74, 58, 74, 26, 64]
# Rótulos sin emoji (el dibujo del emoji depende de la fuente de emojis del sistema).
TEXT_ONLY = [2, 3, 4]


@unittest.skipUnless(DEPS and Path(FONT).is_file(), 'faltan la fuente de los rótulos o freetype-py/uharfbuzz/Pillow/numpy')
class Texto06B(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import numpy as np
        from PIL import Image
        import texto06b
        cls.np, cls.Image, cls.t = np, Image, texto06b
        cls.font = texto06b.Fuente(FONT)
        cls.cues = json.loads((REF / 'cues.json').read_text())

    def gray(self, img):
        a = self.np.asarray(img.convert('RGBA')).astype(float)
        al = a[..., 3:4] / 255
        return a[..., :3] * al + 128 * (1 - al)

    def test_mismo_tamano_que_el_swift(self):
        self.assertEqual([self.t.fit_size(self.font, c['lines']) for c in self.cues], SWIFT_SIZES)

    def test_se_ve_igual_que_el_swift(self):
        np = self.np
        for i, cue in enumerate(self.cues):
            img = self.t.render(self.font, cue['lines'], SWIFT_SIZES[i])
            self.assertEqual(img.size, (886, 318))
            ref = self.Image.open(REF / f'cue-{i}.png')
            diff = np.abs(self.gray(img) - self.gray(ref))
            mean = diff.mean()
            off = (diff.max(2) > 64).mean() * 100
            # Caja del texto (sin emoji) a 2 px como mucho.
            if i in TEXT_ONLY:
                for axis in (0, 1):
                    a = np.where(np.asarray(img)[..., 3].max(axis) > 0)[0]
                    b = np.where(np.asarray(ref)[..., 3].max(axis) > 0)[0]
                    self.assertLessEqual(abs(a.min() - b.min()), 2, f'rótulo {i}')
                    self.assertLessEqual(abs(a.max() - b.max()), 2, f'rótulo {i}')
            self.assertLess(mean, 3.5 if i in TEXT_ONLY else 6.0, f'rótulo {i}: diferencia media {mean:.2f}')
            self.assertLess(off, 2.0 if i in TEXT_ONLY else 4.0, f'rótulo {i}: {off:.2f} % de píxeles muy distintos')

    def test_programa_como_el_swift(self):
        with tempfile.TemporaryDirectory() as tmp:
            sys.argv = ['texto06b.py', str(REF / 'cues.json'), tmp, FONT]
            from io import StringIO
            from contextlib import redirect_stdout
            out = StringIO()
            with redirect_stdout(out):
                self.t.main(sys.argv)
            self.assertIn('cue 1 size=58.0', out.getvalue())
            self.assertTrue((Path(tmp) / 'cue-4.png').is_file())

    def test_no_cabe(self):
        with self.assertRaises(ValueError):
            self.t.fit_size(self.font, ['W' * 400])


if __name__ == '__main__':
    unittest.main()
