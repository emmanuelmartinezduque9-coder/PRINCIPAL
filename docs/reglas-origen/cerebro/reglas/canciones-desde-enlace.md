# Canciones: importar desde un enlace público

La biblioteca existente acepta un enlace en **Añadir desde un enlace → Importar a MP3**.
`music_import.py` guarda una cola SQLite durable y ejecuta un trabajador local independiente
de Codex y de las pestañas. `music_extract.py` descarga mediante yt-dlp y convierte con
FFmpeg (MP3 192 kb/s); `music_library.upload` mantiene numeración, validación y deduplicación.

- Sin IA, API de pago, control del PC, sesiones de navegador ni renders de Creatomate.
- El audio se conserva tal como suena: **no separa voces y música**, no inventa otra canción.
- TikTok: vídeo público o audio expuesto por la página del sonido exacto. Si la página del
  sonido no expone su audio, pedir un vídeo que lo use; jamás elegir un vídeo al azar.
- Otros enlaces: compatibles con el extractor y accesibles públicamente. No prometer todas
  las páginas; no sortear login/DRM. Listas, perfiles y directos no se importan.
- Hasta 20 minutos, descarga temporal máxima 180 MB, MP3 final hasta 30 MB. Fallos visibles,
  reintento explícito, doble clic/enlace repetido no duplica la canción. Máximo 20 en cola.
- Red de extracción bloquea destinos privados, incluso redirecciones/resolución DNS;
  FFmpeg solo lee archivos locales. No se cargan plugins ni cookies de navegador.
- Conversión temporal se conserva ante una interrupción entre conversión y guardado;
  el hash recupera la canción sin duplicarla. Los números y MP3 existentes no se cambian.
- La llegada de una canción nueva no interrumpe el reproductor ni borra el segundo que el
  usuario esté escribiendo. Selección por número/inicio y secciones siguen como antes.
- Guardar un audio no concede derechos para publicarlo; las confirmaciones del montaje
  permanecen intactas.

Pruebas: `EDITOR/test_music_import.py`, `EDITOR/music_import_20260913/live_probe.py`
y `ui_probe.cjs`. El ejemplo público usado para probar la descarga está en una biblioteca
temporal aislada, nunca en la biblioteca real del usuario.
