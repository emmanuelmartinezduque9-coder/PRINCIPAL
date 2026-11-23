#!/usr/bin/env python3
"""texto06b.py: los rótulos con el estilo fijo 06B del dueño, en cualquier sistema (sustituye a texto06b.swift).

Mismo resultado que el Swift del Mac (AppKit/CoreText), pieza a pieza:
  - TikTokDisplay-Medium, blanco #FFFFFF, contorno exterior negro de 0,05 em (en AppKit, strokeWidth -10 = trazo de
    0,10 em centrado en el contorno, dibujado debajo del relleno; aquí, trazo de radio 0,05 em debajo del relleno),
    uniones redondeadas (sin picos en M/N/V).
  - Cada rótulo es un PNG transparente de 886×318 (la caja invisible x112/y287 sobre 1080×1920), centrado H y V.
  - Interlínea 35/31 em. Alto de línea como AppKit: round(ascendente) + round(descendente).
  - El tamaño baja de 1 en 1 desde 74 hasta que todas las líneas caben (ancho ≤ 886 − 2·0,05·tamaño − 12;
    alto < 318), sin deformar ni omitir texto; por debajo de 13, error.
  - Formas como CoreText: HarfBuzz (uharfbuzz) aplica el kerning y las ligaduras de la fuente (fi, fl…); cada glifo
    se dibuja por su número con FreeType (freetype-py), sin hinting, con su posición fraccionaria.
  - Emojis: CoreText los dibuja con la fuente de emojis del sistema y avance de 1 em. Aquí, con la fuente de emojis
    a color que haya (Apple Color Emoji en el Mac, Noto Color Emoji en Linux: `EMOJI_FONT` la fija), escalada a 1 em
    y sobre la línea base como CoreText. El dibujo del emoji depende de la fuente (Apple ≠ Noto).

Uso: python texto06b.py cues.json carpeta_salida fuente.ttf     (como el Swift: imprime «cue i size=N»)
Dependencias: freetype-py, uharfbuzz, Pillow, numpy.
"""
import json
import os
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

import freetype
import numpy as np
import uharfbuzz as hb
from PIL import Image, ImageFont

W, H = 886, 318
START_SIZE = 74
MIN_SIZE = 12
STROKE_EM = 0.05
LEADING = 35 / 31
# macOS engorda un poco el relleno de las letras al dibujar (suavizado de fuentes): se imita ensanchando el relleno
# este radio (px). Medido contra texto06b.swift (montador/test_texto06b.py compara con sus PNG de referencia).
FILL_GROW_PX = 0.35
EMOJI_FONTS = [
    os.environ.get('EMOJI_FONT') or '',
    '/System/Library/Fonts/Apple Color Emoji.ttc',
    '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
    '/usr/share/fonts/noto/NotoColorEmoji.ttf',
]
# Emoji frente a CoreText con Apple Color Emoji (medido): el dibujo ocupa 0,92 em y su centro queda 0,4 em por encima
# de la línea base y centrado en su avance de 1 em.
EMOJI_SCALE_EM = 0.92
EMOJI_CENTER_EM = 0.4


def is_emoji(ch):
    cp = ord(ch)
    return (0x1F000 <= cp <= 0x1FAFF or 0x2600 <= cp <= 0x27BF or 0x2B00 <= cp <= 0x2BFF or cp in (0x200D, 0xFE0F, 0x20E3)
            or 0x1F1E6 <= cp <= 0x1F1FF or 0xE0020 <= cp <= 0xE007F)


def runs_of(line):
    """Trozos seguidos de texto normal y de emoji: [(es_emoji, texto)]."""
    out = []
    for ch in line:
        kind = is_emoji(ch)
        if out and out[-1][0] == kind:
            out[-1] = (kind, out[-1][1] + ch)
        else:
            out.append((kind, ch))
    return out


def emoji_clusters(text):
    """Separa una cadena de emojis en emojis enteros (con sus uniones ZWJ, variantes y banderas)."""
    clusters = []
    for ch in text:
        if clusters and (ch in '‍️⃣' or clusters[-1].endswith('‍') or unicodedata.category(ch) == 'Mn'
                         or (0x1F3FB <= ord(ch) <= 0x1F3FF) or (0xE0020 <= ord(ch) <= 0xE007F)
                         or (0x1F1E6 <= ord(ch) <= 0x1F1FF and len(clusters[-1]) == 1 and 0x1F1E6 <= ord(clusters[-1]) <= 0x1F1FF)):
            clusters[-1] += ch
        else:
            clusters.append(ch)
    return clusters


class Fuente:
    def __init__(self, path):
        self.path = str(path)
        self.blob = hb.Blob.from_file_path(self.path)
        self.hb_face = hb.Face(self.blob)
        self.upem = self.hb_face.upem
        self.hb_font = hb.Font(self.hb_face)
        self.ft = freetype.Face(self.path)
        hhea = self.ft  # ascender/descender de la tabla hhea, como NSFont
        self.asc_em = hhea.ascender / self.upem
        self.desc_em = -hhea.descender / self.upem
        self.emoji_path = next((p for p in EMOJI_FONTS if p and Path(p).is_file()), None)

    def shape(self, text):
        """Glifos con su avance y desplazamiento (en em) para `text`, con kerning y ligaduras."""
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb_font, buf, {'kern': True, 'liga': True})
        return [(info.codepoint, pos.x_advance / self.upem, pos.x_offset / self.upem, pos.y_offset / self.upem)
                for info, pos in zip(buf.glyph_infos, buf.glyph_positions)]

    def layout(self, line, size):
        """Lo que hay que dibujar de una línea: [('g', gid, x, dy) | ('e', emoji, x)] y su ancho en píxeles."""
        x = 0.0
        items = []
        for emoji, text in runs_of(line):
            if emoji:
                for e in emoji_clusters(text):
                    if e in ('‍', '️'):
                        continue
                    items.append(('e', e, x))
                    x += size  # CoreText: avance de 1 em
            else:
                for gid, adv, xo, yo in self.shape(text):
                    items.append(('g', gid, x + xo * size, yo * size))
                    x += adv * size
        return items, x

    def line_height(self, size):
        return round(self.asc_em * size) + round(self.desc_em * size)

    @lru_cache(maxsize=4096)
    def glyph(self, gid, size, frac_x, stroke_px):
        """Bitmap (alpha, izquierda, arriba) del glifo `gid` a `size` px, movido `frac_x` px; con `stroke_px`, su trazo."""
        self.ft.set_char_size(int(round(size * 64)))
        self.ft.load_glyph(gid, freetype.FT_LOAD_NO_HINTING | freetype.FT_LOAD_NO_BITMAP)
        glyph = self.ft.glyph.get_glyph()
        if stroke_px:
            stroker = freetype.Stroker()
            stroker.set(int(round(stroke_px * 64)), freetype.FT_STROKER_LINECAP_ROUND, freetype.FT_STROKER_LINEJOIN_ROUND, 0)
            glyph.stroke(stroker, True)
        bmp = glyph.to_bitmap(freetype.FT_RENDER_MODE_NORMAL, freetype.Vector(int(round(frac_x * 64)), 0), True)
        b = bmp.bitmap
        arr = np.array(b.buffer, dtype=np.uint8).reshape(b.rows, b.pitch)[:, :b.width] if b.rows and b.width else np.zeros((0, 0), np.uint8)
        return arr, bmp.left, bmp.top

    @lru_cache(maxsize=256)
    def emoji_image(self, emoji, size):
        """El emoji a color, escalado a `size`×`size` px (o None si no hay fuente de emojis)."""
        if not self.emoji_path:
            return None
        for native in (160, 137, 109, 96, 64, 48, 40, 32, 20):  # tamaños de mapa de bits habituales
            try:
                font = ImageFont.truetype(self.emoji_path, native)
                box = font.getbbox(emoji)
                break
            except OSError:
                continue
        else:
            return None
        img = Image.new('RGBA', (box[2] - box[0] + 4, box[3] - box[1] + 4), (0, 0, 0, 0))
        from PIL import ImageDraw
        ImageDraw.Draw(img).text((2 - box[0], 2 - box[1]), emoji, font=font, embedded_color=True)
        bbox = img.getbbox()
        if not bbox:
            return None
        img = img.crop(bbox)
        scale = size / max(img.width, img.height)
        return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)


def fit_size(font, lines):
    """El tamaño más grande (de 1 en 1 desde 74) con el que caben todas las líneas, como el Swift."""
    size = START_SIZE
    while size > MIN_SIZE:
        widths = [font.layout(line, size)[1] for line in lines]
        adv = size * LEADING
        fits_w = max(widths) <= W - 2 * size * STROKE_EM - 12
        fits_h = font.line_height(size) + adv * (len(lines) - 1) + 2 * size * STROKE_EM < H
        if fits_w and fits_h:
            return size
        size -= 1
    raise ValueError('El rótulo no cabe sin omitir texto')


def render(font, lines, size):
    """La imagen RGBA del rótulo (886×318)."""
    stroke = np.zeros((H, W), np.float32)
    fill = np.zeros((H, W), np.float32)
    adv = size * LEADING
    line_h = font.line_height(size)
    total = line_h + adv * (len(lines) - 1)
    emojis = []

    def paste(mask, arr, left, top):
        h, w = arr.shape
        x0, y0 = max(0, left), max(0, top)
        x1, y1 = min(W, left + w), min(H, top + h)
        if x1 <= x0 or y1 <= y0:
            return
        part = arr[y0 - top:y1 - top, x0 - left:x1 - left].astype(np.float32) / 255
        np.maximum(mask[y0:y1, x0:x1], part, out=mask[y0:y1, x0:x1])

    for j, line in enumerate(lines):
        items, width = font.layout(line, size)
        x0 = (W - width) / 2
        top = (H - total) / 2 + j * adv
        baseline = top + round(font.asc_em * size)
        for item in items:
            if item[0] == 'e':
                emojis.append((item[1], x0 + item[2], baseline))
                continue
            _, gid, x, dy = item
            gx = x0 + x
            ix, fx = int(np.floor(gx)), gx - np.floor(gx)
            iy = int(round(baseline - dy))
            arr, left, btop = font.glyph(gid, size, round(fx * 64) / 64, STROKE_EM * size)
            paste(stroke, arr, ix + left, iy - btop)
            arr, left, btop = font.glyph(gid, size, round(fx * 64) / 64, 0)
            paste(fill, arr, ix + left, iy - btop)
            if FILL_GROW_PX:
                arr, left, btop = font.glyph(gid, size, round(fx * 64) / 64, FILL_GROW_PX)
                paste(fill, arr, ix + left, iy - btop)

    # Negro (trazo) debajo y blanco (relleno) encima: «over» de uno sobre otro.
    alpha = fill + stroke * (1 - fill)
    white = np.divide(fill, alpha, out=np.zeros_like(fill), where=alpha > 0)
    rgb = np.repeat((white * 255 + 0.5).astype(np.uint8)[:, :, None], 3, axis=2)
    out = Image.fromarray(np.dstack([rgb, (alpha * 255 + 0.5).astype(np.uint8)]), 'RGBA')
    for emoji, x, baseline in emojis:
        img = font.emoji_image(emoji, round(EMOJI_SCALE_EM * size))
        if img is None:
            continue
        ex = int(round(x + (size - img.width) / 2))
        ey = int(round(baseline - EMOJI_CENTER_EM * size - img.height / 2))
        out.alpha_composite(img, (max(0, ex), max(0, ey)))
    return out


def main(argv):
    if len(argv) != 4:
        sys.exit('uso: python texto06b.py cues.json carpeta fuente.ttf')
    cues = json.loads(Path(argv[1]).read_text())
    out_dir = Path(argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    font = Fuente(argv[3])
    for i, cue in enumerate(cues):
        lines = cue['lines']
        if not lines:
            sys.exit('Rótulo vacío')
        try:
            size = fit_size(font, lines)
        except ValueError as error:
            sys.exit(str(error))
        render(font, lines, size).save(out_dir / f'cue-{i}.png')
        print(f'cue {i} size={float(size)}')


if __name__ == '__main__':
    main(sys.argv)
