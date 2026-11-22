# La firma MEDIDA de una foto real de móvil

No es una opinión: son medidas. El 2026-09-02, después de cinco intentos fallidos «mejorando el
realismo» a ojo, medí la foto real de Emmanuel contra mis generaciones con `EDITOR/medir.py`.
El resultado desmontó lo que yo estaba haciendo.

## Interior de tienda con fluorescentes — su foto real vs mis intentos

| medida | SU FOTO REAL | intento 1 | intento 2 (el verdoso) | intento 3 |
|---|---|---|---|---|
| negro más oscuro (p1) | **11,4** | 1,4 | 8,4 | 1,0 |
| sombras (p5) | **29,2** | 20,4 | 30,8 | 16,0 |
| blanco más claro (p99) | **218,6** | 203,1 | 232,3 | 185,4 |
| rango tonal usado | **207,3** | 201,8 | 223,9 | 184,4 |
| % negro puro | **0,42 %** | 1,92 % | 0,39 % | 2,17 % |
| saturación media | **33,8** | 23,1 | 25,5 | 29,3 |
| temperatura (R−B) | **+34,4** | +15,9 | +16,3 | +28,4 |
| desvío verde | **+6,5** | −0,8 | **+22,1** | −2,7 |

## Lo que dicen los números

1. **Los negros NO son negros.** Su foto no baja de 11: son grises levantados, lavados. Yo los
   aplastaba a 1 y generaba 5 veces más negro puro que ella. Eso es lo que da aspecto de foto
   «con intención» en vez de foto de móvil.
2. **Los blancos suben alto sin quemarse** (218 con solo 0,09 % quemado). Yo me quedaba en 185:
   apagado. Una foto de móvil ABRE la imagen, no la apaga.
3. **Usa MÁS rango tonal, no menos.** 207 frente a mis 184.
4. **Está MÁS saturada que las mías** (33,8 vs 23-29). Desaturar fue un error.
5. **Es más cálida** (+34 frente a mis +16).
6. **Sí tiene desvío verde, pero sutil: +6,5.** Mi intento verdoso tenía **+22**, tres veces más, y
   por eso se veía como un tinte. Luego me fui al otro extremo (−2,7, magenta). El verde correcto
   está ahí, pequeño.

## La conclusión que me estaba perdiendo

Una foto de móvil no es una foto **apagada y contrastada**. Es lo contrario: **abierta, levantada
y algo saturada**, con negros grises y blancos altos. Eso es el HDR del teléfono trabajando. Yo
llevaba cinco intentos quitando luz y color, que es exactamente lo que la alejaba de la realidad.

## Cómo se usa

Antes de dar un frame por bueno, **medirlo contra la referencia real**:

```
python3 EDITOR/medir.py --comparar <foto_real> <lo_generado>
```

Si los negros están aplastados, los blancos bajos o la saturación por debajo, se regenera. Y esto
no se juzga a ojo: se mira la tabla.

Relacionado: [[2026-09-02-la-firma-real-se-mide-no-se-opina]] · [[organico-no-publicidad]]
