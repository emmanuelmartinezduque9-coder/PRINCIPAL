# Producto del vídeo sin mockup — default global, 16/10/2026

## Imágenes: no extender la excepción Genjutsu — 23/10/2026
Emmanuel aclara expresamente que omitir el artículo por conservar el del vídeo
se refiere a replicación de VÍDEO Genjutsu, no a generación de imágenes.
En frames, adjuntar la referencia canónica del artículo o embalaje que realmente
debe verse. Si se piden cajas, usar el embalaje exacto y mostrar cajas cerradas,
no sustituirlas por artículos sueltos. Registrar índices efectivos y hashes.
Producto fuera de plano u oculto sigue respetando su visibilidad, sin introducirlo.
Corrección autorizada actual: V3 EisWerk y V6 HaarZauber del pedido
app-270f1a3cc20843e18f0f3688d186c77d-60; otros ocho aprobados e intactos.
Esta aclaración no acredita por sí sola un control automático nuevo.

## Regla vigente por motor — 21/10/2026, corrección posterior
Prevalece sobre «todos los motores» más abajo. En Genjutsu conservar el producto
del vídeo fuente SIN artículo/mockup adjunto por defecto. En Seedance adjuntar
OBLIGATORIAMENTE la imagen exacta del producto, aunque aparezca en el frame.
Si se solicita otro color/variante, adjuntar OBLIGATORIAMENTE esa variante exacta
en cualquier motor, incluido Genjutsu. El embalaje y el frame no la sustituyen.
Mantener las reglas de embalaje separadas: no omitir cajas por omitir mockup.

Al preparar el manifiesto, extraer las decisiones humanas (incluidas notas y
respuestas del chat) a `requested_product_variant` cuando haya cambio de variante.
Registrar `product_variant_reference: {variant, media_id, sha256}` con la imagen
real, y marcar su binding `asset: articulo`. Si no existe esa imagen, bloquear
solo ese envío; no inventarla ni resolverlo únicamente con el prompt.
Una petición explícita de producto sin cambio de variante se registra mediante
`product_reference_requested: true`. No deducir cambios por mera existencia de
variantes en catálogo. No modificar ni regenerar trabajos aceptados.

Control ejecutable: `EDITOR/product_reference_policy.py`, preparación en
`lanzar.preparar` y adjuntos efectivos en `submitted_video_context.validate_references`.
Pruebas locales en `EDITOR/test_product_reference_policy.py`. La extracción de
peticiones libres sigue siendo responsabilidad del agente: este control no es
un intérprete automático de todas las notas ni acredita pruebas reales del proveedor.

## Excepción expresa de variante — 21/10/2026
Si Emmanuel pide una variante/color diferente del vídeo fuente, esa petición
autoriza y exige adjuntar la referencia exacta de esa variante a la generación
del vídeo, además del frame inicial aprobado cuando el motor lo requiera.
Comprobar los adjuntos efectivos del envío y conservar su hash; mencionarla solo
en el prompt o mostrarla solo en el frame no acredita el adjunto de variante.
Caso menta de EisWerk: no regenerar los clips existentes por esta corrección.
No extender esta excepción a encargos sin cambio de variante solicitado.

Emmanuel confirma que TODOS los vídeos de referencia que aporta ya muestran
el producto que vende. Extiende a todas las cuentas la regla de FastLuxus.

En nuevas preparaciones basadas en sus referencias, para todos los motores:
- Conservar el producto del vídeo y sus variantes, colores, estampados, formas
  y componentes en cada toma. No uniformar variantes distintas.
- NO cargar, subir ni adjuntar imágenes externas de artículo/producto/mockup
  por defecto, aunque existan como assets canónicos en el catálogo.
- NO pedir sustituir el producto por el asset ni usar otra imagen para forzar
  indirectamente esa sustitución.
- Solo incluir el mockup cuando Emmanuel lo pida expresamente para ese encargo.
  La mera existencia del asset o una plantilla antigua no cuenta como petición.
- Conservar assets, fichas y recibos: no borrarlos del catálogo.
- No cambia por sí sola las instrucciones de avatar, marca, embalaje o edición;
  tampoco autoriza adjuntos de esos roles para imponer una variante de producto.
- Mantener las puertas de cada motor: Genjutsu sigue necesitando frame inicial
  aprobado, que respete el producto visible de la fuente. Prime no necesita frame.
- No modificar solicitudes aceptadas, trabajos en curso ni históricos.

Antes de enviar, comprobar los adjuntos efectivos y el prompt: cualquier inclusión
automática de artículo por reglas antiguas debe retirarse de la preparación
pendiente, manteniendo los controles. Para encargos sin vídeo fuente no inventar
una referencia ni asumir permiso para usar mockup: resolver según el encargo.

Esta instrucción sustituye la obligación general anterior de adjuntar artículo,
incluidas las reglas de Prime. Es memoria operativa persistente; no constituye
evidencia de despliegue o prueba de todos los ejecutores automáticos existentes.
