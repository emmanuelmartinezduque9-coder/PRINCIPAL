# El vídeo no se regenera para acomodar el texto

En la primera prueba EisWerk C20–C22 interpreté erróneamente la duración de la
CTA original (~2 s) como un mínimo para el vídeo generado. Propuse regenerar por
esa diferencia. Emmanuel corrigió: el texto se adapta a la duración y a los cortes
del resultado; no hay un tiempo fijo de dos segundos.

Aplicación: mantener los tres MP4 actuales, sincronizar la CTA con su último corte
real, conservar textos/música y exportar sin repetir ni estirar clips. Las propuestas
de corrección `videos_correccion1.json` quedan canceladas antes de enviarse.

Aceptó expresamente mantener el bol para terminar esta prueba. Se conservan los
veredictos técnicos por separado de su autorización de continuar; aceptar una
prueba no convierte un defecto en corregido ni implica permiso de publicación.

La prueba de exportación detectó otros dos fallos de implementación: la precisión
del final de texto se redondeaba fuera del final del MP4, y el sondeo de medios
omitía los fps (un upscale 60fps terminaba en un borrador de 24fps). Ambos se
corrigieron y tienen tests. El borrador ahora incluye la composición compilada en
su identidad, para no reutilizar tiempos obsoletos tras verificar un corte.

Observación pendiente de la prueba real de Creatomate: C20 y C22 muestran ambos
textos juntos durante el fotograma del cambio (524 a 60fps y 212 a 24fps).
No basta con que dos intervalos decimales compartan la misma frontera: revisar
la inclusión del último fotograma de cada capa. No está corregido en estos dos
MP4; se entregan señalados para revisión, sin pagar de nuevo ni alterar los clips.
