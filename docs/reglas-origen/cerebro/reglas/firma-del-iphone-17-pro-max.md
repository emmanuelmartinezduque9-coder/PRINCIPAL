# La firma del iPhone 17 Pro Max (investigado 2026-09-02)

Investigación con fuentes (Apple, DPReview, DXOMARK, GSMArena, Lux). Los bloques listos para
pegar están en `EDITOR/frames_prompts/_IPHONE_TIENDA.txt`.

## Lo que hace reconocible una foto de iPhone

1. **Profundidad de campo PROFUNDA** — es el rasgo nº1. A 1x el equivalente es ƒ/6.3 en full frame:
   el fondo se lee entero. **Cualquier bokeh cremoso delata la IA al instante.**
2. **Sombras levantadas + fuentes de luz quemadas de golpe**, en la misma imagen. Smart HDR levanta
   las sombras (casi nada llega a negro puro) pero las bombillas y focos **sí** se van a blanco puro
   con un halo. Coincide exactamente con la medición: negros a 11, blancos a 218, 0,09 % quemado.
3. **Curva plana**: prácticamente ningún negro puro ni blanco puro fuera de las lámparas.
4. **Sharpening por zonas**: micro-textura crujiente en tela, cartón, letras y pelo; paredes y
   sombras **lavadas** por la reducción de ruido. Las dos cosas conviven.
5. **Grano fino de luminancia en las sombras** junto a esos parches emborronados.
6. **Piel cálida y algo saturada**, altas luces de la cara protegidas, rasgos ligeramente alisados
   pero con poros. GSMArena lo critica como «caras innecesariamente cálidas y saturadas» — y eso es
   precisamente lo que hay que reproducir.
7. **Perspectiva de 24 mm**: primer plano agrandado, esquinas estiradas, arqueo residual en bordes.
8. **Flash on-axis** cuando hay flash: sujeto plano de frente, **sombra dura pegada detrás**, caída
   brutal (a 2-3 m casi negro), y tono **neutro-cálido, nunca azul** (True Tone lo iguala al ambiente).
9. **Balance de blancos homogeneizado por zonas** en luz mixta, no dominantes cruzados.
10. **Aspecto plano** al verse en SDR, por el gain map de Adaptive HDR.

## Frente a una cámara profesional

La pro deja negros negros, separa el sujeto con poca profundidad, tiene grano coherente y hace
sharpening global y suave. El iPhone **levanta sombras, deja todo enfocado, alisa la piel hacia
cálido y afila por zonas**. Y dispara a 24 mm, no a 50-85.

## Lo que la investigación NO pudo confirmar

- El comportamiento medido del balance de blancos **bajo fluorescentes de tienda** en este modelo:
  no hay test publicado. Lo del residuo verdoso leve es extrapolación razonada — pero **coincide con
  la medición de la foto real de Emmanuel (+6,5 de verde)**, así que se da por buena con esa base.
- Si el flash sigue siendo la matriz de 9 LEDs (documentado para el 14 Pro, no para el 17).
- «Tone Mapping» no existe como función con nombre en Apple: es Smart HDR 5 + Adaptive HDR.

Relacionado: [[firma-medida-de-una-foto-real]] · [[organico-no-publicidad]]
