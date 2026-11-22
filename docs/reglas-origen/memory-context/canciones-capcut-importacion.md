# Canciones por enlace — integración verificada 17/10/2026

Emmanuel solicita importar enlaces públicos a MP3 y guardar automáticamente en
`/Users/emmanuelmartinezduque/Movies/CapCut/Resources/Biblioteca musical Nano Banana`.

Implementado en la app activa local-access-v1 mediante `EDITOR/local_music_import.py`
y `music_extract.py`, con sesión/CSRF y propietario Emmanuel. No modifica históricos,
no habilita producción ni cambia los controles generales de mantenimiento.
Recibos persistentes en code-packages/runtime/music-imports-emmanuel; extracción
aislada y validación de red pública, límites de tamaño/duración, sin cookies ni
evasión de autenticación. No sustituye ni borra archivos existentes.

Verificación real: TikTok 7696607735550381343 → canción 12, CHANEL,
`12 - CHANEL.mp3`, MP3 44100 Hz, 22,33 s; SHA256
25d37d575c517838c3264b7c84594897aa3d7bfb38a4c048a882ea5982c813d5.
Visible en Canciones; repetir el mismo enlace devuelve canción 12 sin duplicar.
Cinco pruebas unitarias pasan (PYTHONPATH=EDITOR y Python de autoedit/.venv).
Respaldo y sellado de despliegue: code-packages/music-capcut-20261017.

No garantiza descarga de enlaces privados, retirados o bloqueados por la plataforma.
Importa el audio del enlace, incluidas voces; no separa instrumentos ni voces.
El Mac y el servicio local deben estar disponibles para descargar y copiar.
