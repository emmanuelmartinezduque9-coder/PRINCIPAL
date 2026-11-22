# Patrón de montaje de los virales de EisWerk (para el montador v1)

Fecha: 22/11/2026. Pregunta del dueño: **cómo y cuándo cortan cada plano los vídeos virales**, para editar igual.
Lo aplica `montador/montador.py` v1 (ver `docs/piloto-pedido-54/montaje-v1.md`). Complementa `wearheelit.md` y
`parametros-para-el-montador.md` (que se basaban en otra cuenta).

**Marcas:** [medido] = número calculado; [visto] = comprobado mirando hojas/tiras; [inferido] = deducción.

## 1. Material

| Grupo | Qué | Dónde (Mac) |
|---|---|---|
| A — verdad de lo que funciona | **TOP 10 de @eiswerrk** (292–895 mil reproducciones), versiones publicadas 1080×1920 | `/Volumes/T7/AUTOMATIZACION SEGA/EisWerk - TOP 10 virales - 2026-11-20/` |
| B — referencias virales que el dueño eligió para replicar | 8 reels de referencia del pedido 54 (`post-edit/reference-v1/v2`, `sources/*/ref.mp4` de V3–V8) | enlaces en `/Volumes/T7/PRINCIPAL/referencias-edicion/referencias-pedido-54/` |
| C — otra cuenta (ya medida) | 10 reels de @wearheelit | `/Volumes/T7/PRINCIPAL/referencias-edicion/wearheelit/` |

Resultados por vídeo (`*.analisis.json`, hojas a 4 fps `*.hojas/`, **tiras a 8 fps alrededor de cada corte**
`*.tiras/`): `/Volumes/T7/PRINCIPAL/referencias-edicion/eiswerk-top10/` y `…/referencias-pedido-54/`. Resumen
agregado: `eiswerk-top10/_resumen.json`; test de ritmo: `eiswerk-top10/_ritmo-cortes.json` y
`referencias-pedido-54/_ritmo-cortes.json` (incluye wearheelit).

**Método.**
- `montador/analizar_referencia.py` (ampliado en v1): cortes con el detector de escena de ffmpeg (umbral 0,20),
  **actividad** fotograma a fotograma (diferencia media entre fotogramas a 96 px) para saber si el plano se corta
  con la acción en marcha o con una cola quieta, zoom/movimiento con ORB, texto con Vision, y **tiras de cada corte**.
- Se repitió con umbral 0,12: añade 13 «cortes» en el TOP 10; **miré las tiras y eran todos falsos** (la misma toma
  continua: tela, cámara en mano). Se quedan los cortes a 0,20, que coinciden con lo visto.
- `~/.principal-tools/analisis/ritmo_cortes.py`: ¿caen los cortes en beats o en golpes fuertes de la música más que
  por azar? Compara con 2000 desplazamientos aleatorios del mismo patrón de cortes (p-valor por vídeo).
- `~/.principal-tools/analisis/resumen_patron.py`: tabla de planos por vídeo y agregados.

## 2. Las dos plantillas del TOP 10 [visto]

**A. «Destape» (nº 2, 3, 4, 7; 12,9–16,7 s).** Rótulo tipo «Weihnachts-Mädels, RENNT ZU LIDL!».
1. Gancho en **una sola toma** de 3,6–6,0 s (persona con tela/campana sobre la caja, o tienda con tela).
2. Destape: **el corte llega 0,35–0,5 s después de que asome la caja, con la tela todavía en el aire**
   (nº 2: caja visible a 4,25–4,38 s → corte 4,73; nº 4: caja a 3,13 → corte 3,60).
3. Unboxing 1,3–1,9 s: manos sacando la máquina de la caja; **se corta a mitad del gesto de sacarla**.
4. A menudo un plano de 0,7 s del resultado (bol de helado) antes del proceso (nº 2 y 4).
5. Proceso, un plano por acción: nevera → verter leche → tapa → botón → toppings → sirope.
6. Último plano: resultado con cuchara + CTA (2,8–3,0 s; en el nº 4 1,2 s).

**B. «Proceso» (nº 1, 5, 6, 8, 9, 10; 8,8–10,1 s).** Rótulo tipo «Hab's meiner Freundin gekauft – jetzt macht sie
nonstop Eis!». Abre con el resultado (0,6–1,2 s) y sigue con el mismo proceso, un plano por acción, y el CTA al final.

El **gancho 1,2,3 + tela** del dueño (V1, V2, V12) es la plantilla A.

## 3. Números por sección (TOP 10, 71 cortes) [medido]

| Sección | n | Mediana | p25–p75 | Mín–máx |
|---|---|---|---|---|
| Duración total | 10 | 10,1 s | 9,0–12,9 | 8,8–16,7 |
| Nº de cortes | 10 | 6,5 | 5–9 | 4–12 |
| Gancho de una toma (plantilla A) | 4 | 4,4 s | 3,6–4,7 | 3,6–6,0 |
| Destape visible antes del corte (A) | 2 medidos a 8 fps | **0,4–0,5 s** | — | — |
| Unboxing / producto en mano (A) | 4 | 1,5 s | 1,3–1,75 | 1,3–1,9 |
| Primer plano (plantilla B) | 6 | 0,9 s | 0,6–1,0 | 0,1–1,2 |
| **Planos de proceso (cuerpo)** | 57 | **1,0 s** | **0,75–1,33** | 0,3–4,2 |
| Último plano (resultado + CTA) | 10 | 2,6 s | 1,2–2,8 | 1,1–3,0 |

El único plano de cuerpo largo (4,2 s, nº 9) es una toma IA continua en la que pasan varias acciones seguidas (botón,
toppings, sirope): nunca hay un plano largo sin acción.

**Referencias del pedido 54 (grupo B):** más lentas. Las de HaarZauber (V5, V6, V8, demostraciones habladas) tienen
planos de 2,1–4,1 s, uno por frase del rótulo; la de V3 tiene cortes de 0,5–0,9 s en el gancho y una toma de 5 s;
la de V2 (impresora Bildglück) es una toma con saltos (el detector no los ve) y el **mismo destape: corte ~0,35 s
después de ver la caja**.

## 4. En qué momento de la acción se sale de cada plano

- [medido] Actividad del último tercio de segundo de cada plano frente a la media del plano: **mediana 0,99**
  (p25 0,80). Solo 9 de 71 planos se cortan ya calmados (< 0,5). **Cola quieta antes del corte: mediana 0,01 s**
  (p75 0,03 s; máx. 0,73 s).
- [visto, tiras a 8 fps] Se corta **en cuanto se ve el resultado del gesto, sin esperar a que se asiente**:
  - nevera: corte cuando la máquina llega al objetivo (nº 1, 2,08 s);
  - verter: corte con la leche todavía cayendo; el plano siguiente entra ya en acción (nº 1, 2);
  - toppings: corte con los trozos cayendo;
  - unboxing: corte con la máquina a medio sacar/subiendo (nº 2, 4);
  - destape: corte con la tela en el aire (nº 2, 4).
- [visto] Ningún virales deja ver el final «muerto» de un clip ni un salto de imagen. El montaje antiguo de V2 sí:
  el clip 209 termina en 3 fotogramas con **la foto del producto sobre gris** (8,92–9,04 s) y antes la cámara se va
  a otra cocina (8,33 s): es la «imagen que aparece» que vio el dueño.

## 5. Cortes y música [medido]

| Conjunto | Cortes | En beat de librosa (±60 ms) | Azar | En golpe fuerte (onset del 25 % superior) | Azar |
|---|---|---|---|---|---|
| TOP 10 EisWerk | 71 | 24 % | 26 % | 22 % | 18 % |
| Referencias pedido 54 + wearheelit | 131 | 25 % | 24 % | 24 % | 16 % |

- **Los virales de EisWerk no cortan en la rejilla del beat**: nada por encima del azar en ningún vídeo (todos los
  p > 0,18). Hay una tendencia débil a caer en golpes fuertes (22–24 % frente a 16–18 %), no significativa vídeo a
  vídeo. Lo que manda el corte es **la acción**.
- Excepción conocida: en @wearheelit los 4 cortes finales van cada 2 beats (40 de 40).
- Consecuencia para v1: el plano dura lo que pide la acción (sección del patrón) y, **dentro de ese margen**, el
  corte se mueve hasta ±½ beat para caer en un beat de la canción (lo pidió el dueño: «cambios de escena con el ritmo
  de la canción»). Nunca se sacrifica la acción por el beat.
- El drop sigue en el inicio del cuerpo (decisión del dueño, 22/11).
- Límite: el tempo de librosa no está validado a oído (152 / 117,5 bpm según la canción).

## 6. Rótulos [medido con Vision + visto]

- **Un rótulo principal desde el fotograma 0** hasta el CTA en los 10 vídeos (la primera muestra OCR, 0,125 s, ya lo
  tiene). No cambia con los cortes.
- **El CTA entra exactamente en un corte**: en el último en 8 de 10 y en el penúltimo en 2 (cuando el último plano es
  corto). Dura 1,0–2,9 s (mediana ~2,5 s). En los de plantilla A va con «Nur Spaß, wir verkaufen sie!».
- En las referencias habladas de HaarZauber (V5, V6, V8) el rótulo cambia **en cada corte** (una frase por plano).
- Ningún cambio de rótulo a mitad de plano en los 18 vídeos.

## 7. Zooms [medido + visto]

- Escala medida dentro de los planos de cuerpo del TOP 10: **1,00 ± 0,01** (ORB a 12 fps). Las desviaciones mayores
  (0,92–1,09) son movimientos de cámara en ganchos o en las referencias, no zooms de edición.
- En las hojas del TOP 10 (nº 1, 2, 3, 4, 9 mirados enteros) **no hay punch-ins, push-ins, rampas ni transiciones**:
  cortes secos. El dinamismo lo pone el plano corto que siempre tiene una mano haciendo algo.
- Consecuencia: **zoom apagado por defecto en v1**. Los mini-zooms de v0 no tienen respaldo en los datos.

## 8. Reglas que aplica el montador v1 (resumen)

| Regla | Valor | Base |
|---|---|---|
| Destape visible antes de cortar el gancho | 0,45 s | virales A: 0,35–0,5 s |
| Unboxing / primer plano del cuerpo | 1,0–1,9 s (objetivo 1,5) | mediana 1,5 |
| Planos de proceso | 0,6–1,5 s (objetivo 1,0) | mediana 1,0, p25–p75 0,75–1,33 |
| Último plano (CTA) | 1,5–3,0 s (objetivo 2,5) | mediana 2,6 |
| Salir del plano | con la acción en marcha; nunca cola quieta, salto ni imagen nueva | §4 |
| Corte en beat | solo moviendo el corte ≤ ½ beat dentro de la duración de la sección | §5 |
| Rótulos | principal desde 0; CTA en el corte del último plano (o el penúltimo si el último < 1,5 s) | §6 |
| Zooms | apagados | §7 |

## 9. Límites

- 10 vídeos de una cuenta y 8 referencias; correlación, no causa. Las vistas son las redondeadas de Instagram.
- El detector de escena pierde algunos saltos dentro de tomas IA (p. ej. en la referencia de V2); las hojas y tiras
  son la comprobación.
- Nadie ha escuchado los vídeos; la música se describe con números.
- La medida de actividad no distingue «acción» de «cámara que se mueve»; un vertido fino y constante da poca
  actividad aunque la acción siga.
