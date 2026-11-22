# EisZwilling: escala fisica y entrega escalada — 2026-09-07

Emmanuel detecto que el articulo del desembalaje C2 clip2 era demasiado pequeno.
Comparar siempre la maquina con la mano, los vasos y el hueco de espuma, no solo
comprobar que tiene dos vasos. Cambiar el color o reconocer la silueta no valida escala.
Corregir la escala del articulo y su embalaje sin acercar la camara para disimularlo.
El nuevo frame necesita aprobacion antes del video; no declarar aprobacion por el usuario.

Nueva orden: videos Seedance a 480p y upscale posterior; la entrega final es el upscale.
`EDITOR/upscale.py` conserva el original, registra el job Topaz, evita envios duplicados,
reutiliza el audio original y valida dimensiones, encuadre y duracion.
`EDITOR/entregar.py` lo ejecuta automaticamente antes de publicar cualquier entrega Seedance.
Final elegido en esta implementacion: Topaz 1080p, sin interpolacion. Kling no se escala.
No prometer que el upscale reconstruye fielmente detalles inexistentes: comprobar resultado.

Resultado de esta correccion: el nuevo frame 3ace8772 aumenta la escala. Verificador detecta
selector superior ausente; Emmanuel informado dice literalmente "el nuevo frame esta bien,
usa el clip con ese". Se acepta por decision expresa, no por falsa aprobacion automatica.
No se genero el segundo intento preparado. Clip2 se regenera con media c04b9e67 conservando escala.
Emmanuel confirma que el upscale debe ser 1080p, no 4K; coincide con la configuracion ejecutada.

## Cambio posterior — 8 de septiembre, 22:37

Lo anterior describe la entrega histórica del día 7, no el valor por defecto vigente.
Emmanuel cambió después a 4K y ahora pide **ByteDance Standard, 4K, 60 fps, Common**
para los próximos vídeos. Aplicar `CEREBRO/reglas/upscale-bytedance-2026-09-08.md`.
No repetir ni modificar los trabajos antiguos al cambiar el preset.
