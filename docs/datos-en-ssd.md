# Datos de PRINCIPAL en el SSD (no en el disco del Mac)

Orden de Emmanuel (24/11/2026): todo lo que PRINCIPAL guarda en su Mac va al SSD T7, no al disco interno.

- El T7 es exFAT (Postgres no acepta sus permisos; uv se rompe con los «._»), así que los datos van en
  una imagen APFS dentro del T7: `/Volumes/T7/PRINCIPAL-DATOS.sparsebundle`, montada en
  `/Volumes/PRINCIPAL-DATOS` (crece según haga falta, tope 200 GB).
- Se monta sola al iniciar sesión y al conectar el T7: LaunchAgent `com.principal.disco`
  (`~/Library/Application Support/Principal/montar-disco.sh`).
- `~/.principal-tools`, `~/.principal`, `~/.cache/huggingface`, `~/.cache/rea-video`,
  `~/Library/Caches/uv-principal`, `~/.local/share/uv` y `~/.npm` son enlaces a esa imagen. Los
  temporales del agente van a `/Volumes/PRINCIPAL-DATOS/tmp` (`TMPDIR` en su plist).
- Todo lo deja así `bash agente-mac/disco-ssd.sh` (se puede repetir). Volver a ejecutar
  `instalar.sh` reescribe el plist del agente: después hay que repetir `disco-ssd.sh`.
- Sin el T7 conectado el agente no arranca; launchd lo reintenta cada 30 s y sigue solo al conectarlo.
- Lo que no se mueve: la carpeta temporal de Claude Code (`/private/tmp/claude-501`), que la gestiona
  la propia app.
- Resultado el 24/11/2026: libre en el disco interno de 22 GB a 33 GB; 13 GB pasaron al T7.
