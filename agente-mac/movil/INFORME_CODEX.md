He creado los programas y los he probado contra el iPhone. No se publicó ningún reel ni se aceptaron opciones de Meta.

- **Funciona:** foto de Instagram y simulación completa de reels en Instagram y Facebook. Ocho pruebas locales pasan.
- **Sin validar:** publicación real y guardado final de la foto de Facebook, porque allí está abierta otra marca.
- En Instagram, la simulación se detiene antes del botón final «Avanti»; en Facebook, antes de «Condividi ora».

```bash
python3 -B foto_perfil.py imagen.jpg --app instagram
python3 -B publicar_reel.py video.mp4 --texto descripcion.txt --app instagram --simular
```

Para Facebook, cambia `--app facebook`. **Quitar `--simular` permite publicar.**

Uso y límites en [README.md](/Volumes/T7/PRINCIPAL-APP/agente-mac/movil/README.md). Resultados y capturas en [INFORME_CODEX.md](/Volumes/T7/PRINCIPAL-APP/agente-mac/movil/INFORME_CODEX.md).