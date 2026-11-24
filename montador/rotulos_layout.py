"""Partición 06B independiente del motor de dibujo (medidas en píxeles)."""
import re
from functools import lru_cache
from itertools import combinations

FIXED_SIZE = 58  # como solían quedar los rótulos de Codex (50–64): dos líneas con cortes de frase
MAX_LINES = 3
MIN_CUE_SECONDS = 0.8


def useful_width(size=FIXED_SIZE):
    return 886 - 2 * 0.05 * size - 12


def _tokens(text, glue=True):
    """Palabras y pistas `|`. Con `glue`, los emojis van pegados a la palabra anterior."""
    words, hints = [], set()
    for token in re.findall(r'\||[^\s|]+', str(text)):
        if token == '|':
            hints.add(len(words))
        elif glue and words and any(ord(ch) >= 0x2600 for ch in token) and all(not ch.isalnum() and (ord(ch) >= 0x2600 or ch in '\u200d\ufe0f') for ch in token.strip('\"“”„«».,!?')):
            words[-1] += ' ' + token
        else:
            words.append(token)
    return words, hints


def balanced_lines(font, text, size=FIXED_SIZE, max_lines=MAX_LINES, glue=True):
    """Mínimas líneas que caben; sin palabras sueltas si se puede; la de arriba ≤ 1,15 × la de abajo si se puede; y
    entre esas, las líneas más parejas (menor diferencia entre la más larga y la más corta). Con un 3 % del ancho útil
    de margen, gana el corte en puntuación o en un `|` de la referencia."""
    words, hints = _tokens(text, glue)
    if not words:
        return []
    @lru_cache(None)
    def width(a, b):
        return font.layout(' '.join(words[a:b]), size)[1]
    for n in range(1, min(max_lines, len(words)) + 1):
        candidates = []
        for cuts in combinations(range(1, len(words)), n - 1):
            edges = (0,) + cuts + (len(words),)
            widths = [width(a, b) for a, b in zip(edges, edges[1:])]
            if max(widths) > useful_width(size):
                continue
            # «Palabra suelta»: una línea de una sola palabra corta (una palabra larga sola no queda coja).
            singles = sum(b - a == 1 and width(a, b) < 0.4 * useful_width(size) for a, b in zip(edges, edges[1:])) if n > 1 else 0
            shape = max(0, widths[0] - 1.15 * widths[-1])
            preferred = sum(c in hints or words[c-1].endswith((',', '.', '…', '!', '?', ':', '–')) for c in cuts)
            candidates.append((singles, shape, max(widths) - min(widths), -preferred, max(widths), edges))
        if candidates:
            fewest_singles = min(c[0] for c in candidates)
            candidates = [c for c in candidates if c[0] == fewest_singles]
            top_not_longer = [c for c in candidates if c[1] == 0]
            candidates = top_not_longer or candidates
            best_spread = min(c[2] for c in candidates)
            pool = [c for c in candidates if c[2] <= best_spread + 0.03 * useful_width(size)]
            chosen = min(pool, key=lambda c: (c[1], c[3], c[2], c[4]))
            return [' '.join(words[a:b]) for a, b in zip(chosen[-1], chosen[-1][1:])]
    return None


def split_cue_texts(font, text, size=FIXED_SIZE, max_lines=MAX_LINES):
    """Primero con los emojis pegados a su palabra; si una palabra larga con sus emojis no cabe en una línea, los
    emojis pueden bajar a la línea siguiente."""
    for glue in (True, False):
        result = _split(font, text, size, max_lines, glue)
        if result is not None:
            return result
    raise ValueError('Una palabra excede el ancho útil al tamaño fijo; no se puede partir por espacios')


def _split(font, text, size, max_lines, glue):
    """Divide sin perder palabras; prefiere frases, luego comas y partes de longitud similar."""
    words, hints = _tokens(text, glue)
    def fragment(a, b):
        return ' '.join(word + (' |' if i+1 in hints else '') for i, word in enumerate(words[a:b], a))
    @lru_cache(None)
    def lines(a, b):
        return balanced_lines(font, fragment(a, b), size, max_lines, glue)
    @lru_cache(None)
    def solve(a):
        if a == len(words):
            return (0, 0, 0, 0, 0, [])
        options = []
        for b in range(a+1, len(words)+1):
            block = lines(a, b)
            if block is None:
                break
            tail = solve(b)
            if tail is None:
                continue
            penalty = 0 if b == len(words) or words[b-1].endswith(('.', '!', '?', '…')) else (1 if words[b-1].endswith(',') else 2)
            length = len(' '.join(block))
            widths = [font.layout(line, size)[1] for line in block]
            singles = sum(len(_tokens(line)[0]) == 1 and w < 0.4 * useful_width(size) for line, w in zip(block, widths)) if len(block) > 1 else 0
            shape = max(0, widths[0] - 1.15 * widths[-1])
            # Orden: menos rótulos, corte en fin de frase (luego coma), sin palabras sueltas, forma, partes parecidas.
            options.append((1+tail[0], penalty+tail[1], singles+tail[2], shape+tail[3], length*length+tail[4], [block]+tail[5]))
        return min(options, key=lambda x: x[:5]) if options else None
    result = solve(0)
    return None if result is None else result[5]


def prepare_cues(font, cues):
    """Copia metadatos y reparte el intervalo exacto, con mínimo 0,8 s si hay tiempo."""
    out = []
    for cue in cues:
        text = cue.get('text') or ' | '.join(cue.get('lines') or [])
        # Las líneas antiguas aportan pistas, nunca saltos obligatorios.
        if cue.get('lines') and ' '.join(cue['lines']) == text.replace('|', ' '):
            text = ' | '.join(cue['lines'])
        size = FIXED_SIZE
        try:
            parts = split_cue_texts(font, text)
        except ValueError:
            # Solo si UNA palabra sola no cabe al tamaño fijo (rarísimo): ese rótulo, al mayor tamaño en que cabe.
            parts = [[w] for w in _tokens(text, False)[0]]
            parts = [sum(parts[i:i + MAX_LINES], []) for i in range(0, len(parts), MAX_LINES)]
            while size > 12 and max(font.layout(w, size)[1] for p in parts for w in p) > useful_width(size):
                size -= 1
        weights = [len(' '.join(p)) for p in parts]
        duration = cue['end'] - cue['start']
        durations = [duration*w/sum(weights) for w in weights]
        if duration >= len(parts)*MIN_CUE_SECONDS:
            pending = set(range(len(parts)))
            remaining = duration
            while pending:
                total = sum(weights[i] for i in pending)
                short = [i for i in pending if remaining*weights[i]/total < MIN_CUE_SECONDS]
                if not short:
                    for i in pending:
                        durations[i] = remaining*weights[i]/total
                    break
                for i in short:
                    durations[i] = MIN_CUE_SECONDS
                    remaining -= MIN_CUE_SECONDS
                    pending.remove(i)
        start = cue['start']
        for i, (lines, dt) in enumerate(zip(parts, durations)):
            end = cue['end'] if i == len(parts)-1 else start+dt
            out.append(dict(cue, start=start, end=end, lines=lines, text=' '.join(lines),
                            font_size_px=size, split_continuation=i > 0))
            start = end
    return out


class PillowFont:
    def __init__(self, path):
        from PIL import ImageFont
        self.font = ImageFont.truetype(str(path), FIXED_SIZE)

    def layout(self, text, size):
        return [], self.font.getlength(text) * size / FIXED_SIZE
