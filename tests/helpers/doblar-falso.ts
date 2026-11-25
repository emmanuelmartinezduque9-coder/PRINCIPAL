/**
 * `doblar.py` de prueba para los montajes que no prueban el doblaje: la referencia no tiene diálogo («separar») y la
 * comprobación final del vídeo montado no oye nada en otro idioma («verificar»). El de verdad: `montador/test_doblar.py`;
 * el doblaje: `tests/doblaje.test.ts`.
 */
export const DOBLAR_SIN_DIALOGO = `
import json, sys
from pathlib import Path
args = sys.argv[1:]
out = Path(args[args.index('--resultado') + 1]); args = args[args.index('--resultado') + 2:]
if args[0] == 'separar':
    Path(args[2]).mkdir(parents=True, exist_ok=True)
    r = {'ok': True, 'voz': {'hay': False, 'idioma': None, 'probabilidad': None, 'texto': '', 'motivo': 'sin palabras', 'frases': []}, 'candidatas': []}
elif args[0] == 'verificar':
    r = {'ok': True, 'comprobado': True, 'quedan': [], 'frases': []}
else:
    r = {'ok': False, 'error': 'no se usa en esta prueba'}
out.write_text(json.dumps(r))
`;
