"""Transcribe (sin escuchar) los archivos de voz dados, con mlx_whisper. Solo para comprobar qué se dice."""
import sys, json
import mlx_whisper
for p in sys.argv[1:]:
    r = mlx_whisper.transcribe(p, path_or_hf_repo='mlx-community/whisper-large-v3-turbo', word_timestamps=True)
    words = [(round(w['start'], 2), round(w['end'], 2), w['word']) for s in r['segments'] for w in s.get('words', [])]
    print(json.dumps(dict(archivo=p, idioma=r.get('language'), texto=r['text'], palabras=words), ensure_ascii=False))
