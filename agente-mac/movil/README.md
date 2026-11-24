# Manejar el iPhone con WDA

Python 3.9+, sin instalar paquetes. iPhone desbloqueado, WDA arrancado y ambos equipos en la misma Wi-Fi. Abrir previamente la cuenta deseada.

```sh
python3 -B foto_perfil.py /ruta/logo.jpg --app instagram
python3 -B foto_perfil.py /ruta/logo.jpg --app facebook
python3 -B publicar_reel.py /ruta/video.mp4 --texto /ruta/descripcion.txt --app instagram --simular
python3 -B publicar_reel.py /ruta/video.mp4 --texto /ruta/descripcion.txt --app facebook --simular
```

**Quitar `--simular` permite publicar. Ese modo no se ha probado con un envío real.** La descripción se lee como UTF-8 sin traducirla. No se añade música.

En este Instagram, la acción final se llama «Avanti» y tiene identificador `share-sheet-share-button`: la simulación se detiene antes de tocarla, aunque pudiera quedar otra confirmación después. En Facebook se detiene ante «Condividi ora». Las capturas quedan en `resultados/<app>-reel-prima-di-pubblicare.png`.

Opciones comunes: `--wda http://192.168.1.139:8100`, `--salida /ruta/evidencias`. También se admite `WDA_URL`. Con varias redes, fijar `MOVIL_HOST_IP` a la IP del Mac accesible desde el teléfono. El firewall debe permitir el puerto libre que abre el servidor.

Las imágenes pasan por Safari → pulsación larga de 2 s → «Salva in Foto». Los MP4 pasan por Safari → descarga con nombre único → Archivos → iCloud Drive/Download → vista previa → compartir → «Salva video». Si Archivos usa otra ubicación, abrir Download previamente. Se sirven los originales sin copiarlos ni crear temporales. Las descargas y las copias en Fotos permanecen en el teléfono; no añadir otros medios durante la ejecución, que selecciona el recién importado.

Un bloqueo devuelve **3**, con captura y JSON `resultados/bloqueo-*`, incluyendo el paso y la fuente WDA resumida. El éxito devuelve 0; argumentos incorrectos, 2. No se aceptan avisos, términos, permisos ni vinculaciones, ni se escriben contraseñas. Los borradores pendientes detienen el programa: resolverlos manualmente antes de repetir. Si falla después de intentar enviar, comprobar la cuenta antes de reintentar: podría haberse publicado.

La foto de Facebook desmarca únicamente «compartir actualización en el feed» de esa foto. Su guardado final no se probó porque la cuenta abierta tiene otra marca. No hay ayuda opcional de `codex exec`; los pasos fijos no consumen IA. Los textos alternativos españoles e ingleses no se han validado en el teléfono, configurado en italiano.

```sh
python3 -B -m unittest -v test_movil
```

`movil.py` ofrece sesión, `wait`, `tap`, `shot`, `hold`, `type` y `home`. Incluye dos excepciones comprobadas de WDA para el menú completo de Facebook y su botón de cerrar teclado, sin usar coordenadas fijas. `pruebas/` contiene el MP4 azul de tres segundos y el texto alemán usados. Los resultados detallados están en [INFORME_CODEX.md](INFORME_CODEX.md).
