# Cómo se hace una imagen que vale — receta validada el 2026-09-02

Emmanuel, sobre el frame del Lidl: *«está demasiado bien, ha mejorado demasiado, este tipo de
resultado es el que busco en TODAS las imágenes»*. Es la primera imagen que aprueba sin reservas
después de siete intentos. Esta es la receta, y **está montada en `EDITOR/frame.py` para que salga
así por defecto**, no porque me acuerde.

El listón es `REFERENCIA_CALIDAD/FRAME_IDEAL_2026-09-02.jpg` y su prompt está al lado.

## 1. El prompt es PROSA, nunca bloques

Documentación oficial de Google para Nano Banana Pro: *«Describe the scene, don't just list
keywords. A narrative, descriptive paragraph will almost always produce a better, more coherent
image than a simple list.»*

Mis prompts eran **10.400 caracteres en bloques de MAYÚSCULAS** (`CRITICAL —`, `NEGATIVE:`,
`STRICT REQUIREMENTS:`) con veinte líneas de prohibiciones. Trabajaban **contra** el resultado.
El bueno son **4.900 caracteres en párrafos corridos**. La puerta bloquea a partir de 3 bloques.

## 2. Los negativos se escriben en POSITIVO

Regla oficial: en vez de «no cars», escribir «an empty, deserted street with no signs of traffic».
Aplicado: en vez de «no studio lighting», **describir la luz fea que sí hay** — «lit only by the
shop's own recessed ceiling fluorescent tubes, falling from directly above, so the light is bland
and shadowless and there is nothing dramatic anywhere».

## 3. Lista negra (la puerta la veta)

`cinematic` · `studio lighting` · `softbox` · `golden hour` (el default más pegajoso del modelo) ·
`color grading` · `moody` · `dramatic lighting` · `professional photograph` · `editorial` ·
`hyperrealistic` · `8K` · `masterpiece` · `octane render` · `subsurface scattering` · `bokeh` ·
`shallow depth of field` · `flawless skin` · `dewy` · `airbrushed` · `glowing skin`

## 4. Lo que sí hay que describir

- **Todo enfocado.** A 1x el iPhone equivale a ƒ/6.3 en full frame. Cualquier desenfoque bonito
  delata la IA al instante. Es el rasgo número uno.
- **Sombras levantadas, luces quemadas.** Lo oscuro se queda en gris; los tubos del techo sí van a
  blanco puro con halo.
- **Afilado por zonas.** Cartón, letras, tela y pelo crujientes; paredes y sombras **lavadas** por
  la reducción de ruido. Las dos cosas a la vez.
- **Piel real** con la formulación que tiene evidencia visual en este modelo: poros y textura
  acordes a la edad, tono desigual, rojez en nariz y mejillas, pequeñas imperfecciones, asimetría
  natural, brillo en frente y nariz. *«Keep it subtle and true to life, without smoothing.»*
- **Encuadre descuidado y cuantificado**: descentrado, aire de sobra arriba, borde que corta,
  «tilted about two degrees».
- **Perspectiva de 24 mm**: primer plano agrandado, líneas algo arqueadas en los bordes.

## 5. La imagen NO se retoca — corregido el 2026-09-02

### Piel y luz: corrección de Emmanuel del 2026-09-09

Para próximos frames, aplicar [[lecciones/2026-09-09-la-piel-y-la-luz-se-verifican-no-se-presuponen]]. No basta escribir «poros» al final del prompt: describir textura localizada en cara y manos, cambios de tono, cutículas y vello acordes al avatar, y comprobarlo a tamaño de móvil. La luz debe producir sombras de contacto, reflejos y caída de intensidad coherentes con una fuente física. El nivel exigido se juzga sobre la imagen, no sobre el texto del prompt ni un aprobado automático. No alterar POV, producto o identidades para resolver la textura.

Aquí me equivoqué y hay que dejarlo claro para no repetirlo.

Medí que el modelo no obedece «shadows lifted»: devolvía los negros en **4,1** cuando la foto real
de Emmanuel está en **11,4**. Monté `EDITOR/firma.py` para igualar la firma tonal en post y lo dejé
aplicándose **solo**, convencido por los números.

**Emmanuel rechazó ese resultado en cuanto lo vio: le había salido AMARILLA.** Y tenía razón: el
ajuste subía la temperatura de **+14,7** a **+34,3**. Lo que aprueba es **el crudo del modelo**.

> **Las medidas sirven para DIAGNOSTICAR, no para corregir por encima de su ojo.** Si un valor se
> desvía, se cambia el **prompt** y se vuelve a generar. La imagen no se toca. `firma.py` queda como
> herramienta manual, solo si él la pide.

Y una lección de comprensión, no de técnica: *«la última imagen generada»* significa **la última que
generó el modelo**, no la última que yo envié. Un retoque mío no es una generación.

## 6. Ajustes

**2K, nunca 4K** — el 4K sobre-afila los poros. Y recomprimir a **JPEG ~75**: hay literatura de
detección que muestra que la compresión reduce la huella de altas frecuencias de lo sintético.

## 7. Placebo comprobado

**JSON / metadata prompting estilo EXIF no sirve.** Un test controlado sobre este mismo modelo:
*«Skip the JSON. It's a placebo.»* **ISO y velocidad de obturación no tienen ninguna evidencia**;
focal y apertura **sí** están documentados como controlables.

Relacionado: [[firma-medida-de-una-foto-real]] · [[firma-del-iphone-17-pro-max]] · [[organico-no-publicidad]] · [[2026-09-02-la-prosa-gana-a-los-bloques-en-mayusculas]]
