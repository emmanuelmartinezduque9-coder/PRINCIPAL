# Upscale vigente — 16/10/2026, posterior a prueba de 480p

Emmanuel aprueba Topaz Video, Theia (`thd-3`), 1080p y FPS originales como
predeterminado. Sustituye Theia 2K y defaults antiguos para solicitudes nuevas.
No interpolar. Comprobar resolución de generación Y dimensiones reales antes
de enviar: los nativos 1080p (incluidos tamaños cercanos por codificación) no
se escalan. Conservarlos literalmente; editar sobre ese final nativo.
Los inferiores se escalan una sola vez. Reutilizar recibos aceptados, nunca
reenviar pendientes/inciertos. No cambiar trabajos históricos ni sus parámetros.
Edición siempre sobre final Topaz verificado o final nativo exento; mantener audio.

Lote actual app-3124d9317bec4256bc6ecb9a77c52484-105: prueba correcta aprobada
v1-c2, original 480×854, source 74e36423-b856-402c-80b9-4dc44e0882a2,
Topaz c8ba96c6-a2f7-476e-8777-176b346ea9b6, 1080×1920, 24 FPS.
Reutilizarla. Prueba errónea v2-c1 ya nativo 1076×1928: conservar recibo,
no tratarla como necesidad de upscale ni repetir; entregar el original nativo.
