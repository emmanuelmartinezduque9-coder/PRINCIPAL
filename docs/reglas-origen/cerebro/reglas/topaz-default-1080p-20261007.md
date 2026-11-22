# Topaz Video 1080p — decisión de Emmanuel, 07/10/2026

Orden directa en AUTOMATIZACION IA 2.0: «1080p vale pues usa este por defecto».

Los nuevos upscales utilizan Topaz Video (`topaz_video`) a `1080p` mediante
la conexión directa. Sustituye el destino predeterminado anterior Topaz WEB 2K
y los antiguos valores por defecto 4K. No usar Hyperion ni ByteDance como sustituto.

La implementación está en `EDITOR/upscale.py`: `default_resolution()` devuelve
1080p. La configuración de un trabajo ya registrado prevalece sobre el valor
predeterminado; conservar originales, audio, recibos y solicitudes inciertas,
sin reenvíos ni regeneración de entregas anteriores.

Este cambio no declara terminada la integración de ejecución ni ningún vídeo.
