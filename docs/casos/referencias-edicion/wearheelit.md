# @wearheelit: análisis del estilo de edición

Fecha: 22/11/2026. Referencia propuesta por el dueño porque «edita buenos vídeos con intención de conectar con la
audiencia». Objetivo: saber qué hace su montaje para que el montador lo pueda imitar (cortes con la canción, drop,
movimiento, gancho). Los parámetros concretos para el montador están en `parametros-para-el-montador.md`.

**Marcas:** [medido] = sale de un número calculado (script, ffprobe, librosa, Vision); [visto] = lo vi en las hojas de
contactos; [inferido] = deducción mía, no comprobada.

**Método.**
- **Selección.** Cuadrícula de reels y bio leídas en el Brave del dueño (solo lectura; dos desplazamientos; 20 reels
  visibles). Se descargaron con yt-dlp los 8 más vistos y los 2 más recientes que no estaban ya entre ellos (los 2 más
  recientes de todos, DgBeOllh7X- y DgBRG11Bzpc, ya estaban en el top 8).
- **Medición.** Cada vídeo se midió con `montador/analizar_referencia.py`: cortes con umbral de escena 0,20, música,
  movimiento, texto con Vision y voz con mlx_whisper.
- **Revisión a ojo.** Todos se miraron en hojas de contactos a 4 fps. Alrededor del drop, del barrido del gancho y de la
  parte de la niebla, además, a 10–12 fps.
- **Alineación de la canción.** `alinear_cancion.py` alineó la canción de los 10 vídeos con la del más visto para
  expresar todos los cortes en «tiempo de canción».
- **Umbral de cortes.** Una primera pasada con umbral 0,30 perdía cortes reales dentro del mismo sitio (saltos en la
  escalera y en la niebla, con puntuación 0,21–0,29). Se repitió todo con 0,20 y se comprobó a ojo.

**Dónde están los datos (Mac):** `/Volumes/T7/PRINCIPAL/referencias-edicion/wearheelit/`.
- Por vídeo: `<id>.mp4`, `<id>.info.json` (yt-dlp), `<id>.analisis.json`, `<id>.whisper.json` y `<id>.hojas/`.
- Alineación de la canción: `_alineacion-cancion.json`.
- Scripts auxiliares: `~/.principal-tools/analisis/` (`alinear_cancion.py`, `rejilla_comun.py`).

## 1. La cuenta

| Campo | Valor | Marca |
|---|---|---|
| Nombre | Heelit (@wearheelit) | [visto] |
| Seguidores / seguidos / publicaciones | 6.453 / 0 / 114 | [visto] |
| Bio | «Stay safe. Look sick doing it 💡 / LED shoe lights for night runs / Seen by every driver. Noticed by every runner. / 👇 Free US…» (cortada en «más») | [visto] |
| Enlace | wearheelit.com | [visto] |
| Producto | Luces LED que se enganchan al talón de la zapatilla («LED HEEL LIGHTS 2 PCS»), roja o azul | [visto] |
| Mercado | EE. UU. (captions en inglés, #unitedstates, «Free US…») | [visto] |
| Caption tipo | «Comment “RUN” if you want this! 🏃‍♀️ #runninggear #strava #unitedstates #runnerslife #nightrun»: casi idéntico en los 10 | [visto] |
| Ritmo de publicación | Los 10 son del 17 al 22/11/2026; varios por día | [medido] |

**Cómo están hechos [visto + inferido].** Los 10 reels son **la misma plantilla**: un gancho distinto en cada vídeo
pegado a **un cuerpo idéntico**:
1. un chico en una escalera se pone las luces y enseña la caja;
2. primer plano de la luz que se enciende;
3. carrera nocturna con luz roja;
4. cuatro planos en un campo con niebla y luz azul.

El cuerpo es material real tipo UGC. Los ganchos de los vídeos más vistos son siempre la misma escena con distinta
actriz y distinta tienda: una corredora con dorsal pone cara de susto, se le cae el vaso y el café se derrama sobre
una pista pintada en el suelo. La cámara barre hasta un expositor de cajas Heelit y una mano coge una caja.

[inferido] Esos ganchos parecen **generados con IA**:
- la misma composición se repite en seis tiendas distintas;
- el texto del envase sale deformado («LED HEL LIGHTS»);
- la mano y la caja son idénticas en todas las variantes.

Es decir, hacen casi lo mismo que el dueño (gancho IA + cuerpo de producto). La diferencia está en el montaje y en el
gancho.

## 2. Vídeos analizados

- **Datos de la tabla.** Vistas = las de la cuadrícula (redondeadas por Instagram; yt-dlp no devolvió vistas). Likes del
  info.json. Todos son 720×1280 a 30 fps.
- **«% en beat».** Cortes a ±80 ms de un beat en una rejilla de 117,5 bpm anclada en el golpe del drop, medidos en
  tiempo de canción. Por azar saldría un 31 %. Ver §4.3 sobre el tempo.
- **«Zooms».** Zooms digitales de edición (punch-in/push-in) vistos o medidos.

| # | Vídeo | Fecha | Vistas | Likes | Duración | Cortes | Plano mediana (mín–máx) | % en beat | Zooms | Gancho |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [Df2tD5fhMff](https://www.instagram.com/reel/Df2tD5fhMff/) | 17/11 | 321 mil | 8.799 | 13,4 s | 10 | 1,03 s (0,37–3,63) | 40 % | ninguno | vaso derramado → barrido → caja |
| 2 | [DgAoWOlR1-h](https://www.instagram.com/reel/DgAoWOlR1-h/) | 21/11 | 171 mil | 1.567 | 12,6 s | 10 | 1,03 s (0,37–3,10) | 40 % | ninguno | vaso derramado → barrido → caja |
| 3 | [Df7vmV9lC0G](https://www.instagram.com/reel/Df7vmV9lC0G/) | 19/11 | 120 mil | 2.647 | 13,1 s | 10 | 1,03 s (0,40–3,40) | 40 % | ninguno | vaso derramado → barrido → caja (sin rótulo) |
| 4 | [Df43FelRxC9](https://www.instagram.com/reel/Df43FelRxC9/) | 18/11 | 73 mil | 972 | 13,1 s | 10 | 1,03 s (0,37–3,40) | 40 % | ninguno | vaso derramado → barrido → caja |
| 5 | [Df25pYjBecl](https://www.instagram.com/reel/Df25pYjBecl/) | 17/11 | 29,2 mil | 119 | 13,5 s | 9 | 1,11 s (0,73–2,60) | 56 % | ninguno | «The idea 🤮»: zapatillas en llamas (idea / vs / resultado) |
| 6 | [DgBeOllh7X-](https://www.instagram.com/reel/DgBeOllh7X-/) | 22/11 | 20,8 mil | 199 | 13,1 s | 11 | 1,02 s (0,37–2,87) | 36 % | ninguno | corredora se asusta y señala → barrido (pasa tras un pilar) → caja; sin vaso |
| 7 | [DgBRG11Bzpc](https://www.instagram.com/reel/DgBRG11Bzpc/) | 21/11 | 20,7 mil | 341 | 13,0 s | 11 | 1,05 s (0,40–1,70) | 45 % | ninguno | entrada a una tienda Decathlon → expositor → caja |
| 8 | [Df8LPzniIPz](https://www.instagram.com/reel/Df8LPzniIPz/) | 19/11 | 13,3 mil | 160 | 12,9 s | 10 | 1,03 s (0,37–3,17) | 40 % | ninguno | corredora se asusta y señala → barrido → caja; sin vaso |
| 9 | [DgA1T9jB3YR](https://www.instagram.com/reel/DgA1T9jB3YR/) | 21/11 | 10,2 mil | 90 | 10,6 s | 9 | 1,03 s (0,37–1,80) | 44 % | ninguno | primer plano del producto encendido (0,8 s) |
| 10 | [DgBHxyzhMMe](https://www.instagram.com/reel/DgBHxyzhMMe/) | 21/11 | 3.377 | 38 | 12,5 s | 7 | 1,03 s (0,37–5,53) | 57 % | ninguno | dos corredoras en un maletero, destape lento (5,5 s, cámara fija) |

El % en beat casi no varía porque el cuerpo es el mismo. Lo que lo sube son los 4 cortes finales, que están en beat
(§4.3). Con la rejilla que saca librosa de cada vídeo por separado salen valores sin sentido (10–56 %, con tempos de
112–152 bpm para la misma canción). Están en cada `analisis.json`, pero no deben usarse.

**Voz [medido con whisper; nadie lo ha escuchado].** Ninguno lleva narración.
- Whisper devuelve «It's you» / «is you» en 7 vídeos sobre los primeros 5–7 s: casi seguro es la letra de la canción.
- Nº 4: «Oh my god» en 0–0,56 s (la exclamación de la corredora).
- Nº 8: «Yes, yes, yes, yes».
- Nº 10: «Three, two, one. Let's see how it comes out» (audio real de la escena).
- No se distinguen efectos de sonido; habría que escucharlo.

## 3. La plantilla, segundo a segundo (tiempo de canción alineado con el nº 1)

La canción es la misma en los 10 y está colocada siempre igual respecto al cuerpo. Por eso la estructura se puede dar
en segundos de canción. [medido] El desfase se calculó por correlación de la envolvente de onsets; los cortes son la
media de los vídeos, con el rango entre paréntesis.

| Canción (s) | Qué suena [medido] | Qué se ve [visto] | Plano |
|---|---|---|---|
| 0 – ~1,9 | intro a −20 dB, voz «It's you» | Gancho: cara de susto mirando a cámara (0–0,5 s); el vaso cae hacia el segundo 1 | |
| ~1,9 – 2,3 | caída de energía (−30 dB) | el café se derrama | |
| ~2,65 | pequeña subida (+7 a +10 dB) | **barrido de cámara** desde la mancha hasta el expositor | |
| **3,69** (3,61–3,84) | — | **corte a la caja en la mano**: primer plano del producto; la caja se acerca a cámara | gancho 3,1–3,6 s en tiempo de vídeo |
| **4,78** (4,64–4,81) | — | corte a la escalera: el chico se pone las luces | caja 1,0–1,2 s |
| **5,85** (5,83–5,94) | empieza el **silencio** (−38 a −48 dB) | salto en el mismo plano: el chico ya sostiene la caja hacia cámara | 1,03 s |
| **6,44** (6,43–6,45) | — | corte a primer plano de los pies enganchando la luz | 0,60 s (todo el break) |
| **6,55** | **drop**: +21 a +27 dB, el golpe más fuerte de la canción | — | |
| ~7,05 | golpe fuerte (1 beat después del drop) | **la luz roja se enciende** | 0,93 s |
| 7,37 / 7,74 | — | plano de 0,37 s desde otro ángulo; corte a carrera nocturna con luz roja | 0,37 s / 1,40 s |
| **9,13 / 10,17 / 11,17 / 12,20** | energía estable a −15 dB | cuatro planos de niebla con luz azul (de pie, corriendo, agachado, de espaldas) | 1,03 / 1,00 / 1,03 / ~1,17 s |
| ~12,6 – 13,4 | final | se acaba sin cierre: no hay loop ni plano de CTA (en 4 vídeos, rótulo CTA en los últimos 1–2 s) | |

## 4. Patrones que se repiten en los más vistos

### 4.1 El cuerpo es una plantilla fija pegada a la canción; el gancho se recorta para encajar
- [medido] En los 10 vídeos, los cortes del cuerpo caen en los mismos puntos de la canción con un error de ±20 ms:
  6,44 / 7,37 / 7,74 / 9,13 / 10,17 / 11,17 / 12,20 s, y 4,78 y 5,85 en los 8 que conservan la escalera completa.
- [medido] El gancho dura entre 0,8 y 5,5 s. Para que el cuerpo caiga siempre en el mismo sitio, lo que se mueve es el
  inicio de la canción: hasta 2,8 s más tarde en el nº 9, cuyo gancho dura 0,8 s.
- [medido] El primer plano del producto en la mano cae hacia el segundo 3,6–3,8 de la canción en 8 de los 10 (nº 1, 2,
  3, 4, 6, 7, 8 y 9). Ese es el **segundo ancla** de la plantilla.
- [inferido] Es la misma lógica del montador («inicio de la canción = drop − momento del producto»), pero con **dos
  anclas** (producto en mano y transformación) y con un cuerpo **cortado a propósito en 7–8 planos**, no un clip entero.

### 4.2 El drop cae en la transformación, no en la primera aparición del producto
- [medido] En los 9 vídeos alineados, el corte del drop entra **unos 110 ms antes del golpe** (3 fotogramas a 30 fps):
  corte a 6,43–6,45 s, golpe a 6,55 s. Si se mide desde el inicio del onset (6,525 en el nº 1), son 80–95 ms.
- [medido] Antes del drop hay un **silencio de unos 0,6 s** (de −20 dB se pasa a −40/−48 dB y luego a −14 dB). El drop
  es el mayor salto de energía del vídeo en los 10 (+21 a +27 dB). En el silencio hay un salto de plano en el que el
  chico sostiene la caja hacia cámara: la pausa de la música coincide con un momento quieto y legible del producto.
- [visto] Lo que entra con el drop es el primer plano de las luces en las zapatillas. La luz se enciende ~0,5 s
  después, con el golpe del beat siguiente (7,05 s de canción). La caja ya se había visto 2,9 s antes. El «payoff»
  (correr de noche con la luz) llega a +1,2 s del drop.

### 4.3 Ritmo en tres tiempos: gancho largo en movimiento, ráfaga en el drop y pulso regular de 1 s al final
- [medido] Entre 7 y 11 cortes en 10,6–13,5 s, con una mediana de plano de 1,02–1,11 s. Por tercios, el ritmo
  **acelera**: 1 corte en el primer tercio, 5 en el segundo y 4 en el tercero (nº 1, 3, 4 y 8; los demás, parecido).
- **Gancho** (los 4 más vistos):
  - [medido + visto] un plano largo de 3,1–3,6 s **con la cámara moviéndose todo el rato** (sigue el vaso, barre hasta
    el expositor y se acerca a la caja);
  - después, un plano corto de 1,0–1,2 s de la caja en la mano.
- **Antes del drop:** planos de 1,03 y 0,60 s. **Ráfaga del drop:** 0,93 / 0,37 / 1,40 s (tres cortes en 1,3 s).
- **Final:** 4 planos de 1,00–1,03 s (30–31 fotogramas), muy regulares.
- [medido] **Solo el final va al beat.**
  - Los 4 cortes de la niebla caen en los beats 5, 7, 9 y 11 después del drop (uno de cada dos, siempre detrás del
    golpe) a +0–54 ms, en los 10 vídeos (40 de 40 cortes) con una rejilla de 117,5 bpm (beat de 0,511 s) anclada en
    el drop.
  - Los cortes anteriores no caen en esa rejilla (quedan a 100–240 ms).
  - En total, 42 de 97 cortes están a ±80 ms, contra un 31 % que saldría por azar.
- [medido] Por qué 117,5 bpm:
  - es el tempo que da librosa en 6 de los 10 vídeos;
  - cuadra con el golpe de la luz (7,05 s = beat 1 tras el drop) y con el pulso de los planos finales (2 beats = 1,02 s).
  - La autocorrelación da también 0,395 s (152 bpm), que parece un patrón sincopado de la percusión. Con 152 bpm
    encajan los cortes de 7,37 y 7,74, pero no los finales.
  - **Nadie ha escuchado la canción para confirmar el tempo.**
- [medido + visto] Sincronías fuera del beat:
  - el corte del drop;
  - la luz que se enciende con el golpe siguiente;
  - la caja hacia cámara durante el silencio;
  - el barrido del gancho, que coincide a ±0,2 s con la pequeña subida del ~2,65 en 3 vídeos (nº 3, 6 y 8; en los demás el desenfoque impide
    medirlo).

### 4.4 Cero zooms de edición: el movimiento lo pone la cámara y la acción
- [medido] Dentro de los planos del cuerpo, la escala medida entre fotogramas (ORB a 12 fps) se queda en 1,00 ± 0,01.
  - En la niebla la medida falla (hasta 1,29, sin textura) y en los ganchos mide el movimiento real de la cámara; las
    hojas confirman que no son zooms de edición.
- [visto] No hay punch-ins, push-ins digitales, rampas de velocidad, transiciones, destellos ni sacudidas añadidas:
  todos los cortes son secos.
  - Única «transición»: en el nº 6 la cámara pasa por detrás de un pilar verde durante el barrido. El detector lo marca
    como corte (2,87 s); puede ser un corte escondido o el mismo plano.
- [visto] El dinamismo viene de:
  - cámara en mano que persigue (gancho);
  - barrido rápido con desenfoque de movimiento (~0,4–0,6 s);
  - la caja que se acerca al objetivo;
  - la luz que se enciende;
  - cambios de luz: de día a noche, de rojo a azul;
  - la acción del corredor (corre, se agacha, salta).
- [inferido] Por eso no se sienten estáticos aunque no lleven zooms: no hay ni un plano sin algo que se mueva, y ningún
  plano del cuerpo pasa de 1,4 s. Los cuerpos IA del dueño suelen tener menos movimiento y planos más largos: ahí sí
  pueden hacer falta zooms suaves para compensar (ver parámetros).

### 4.5 Texto: un solo rótulo corto arriba, durante todo el vídeo
- [medido con Vision + visto] En 8 de los 10 hay **un único rótulo** de 5–7 palabras con un emoji al final:
  - Ejemplos: «Send this to a RUNNER 🏃», «DON'T let a RUNNER see this 👀», «Every runner needs this! 🫣».
  - Duración: del fotograma 0 al final; **no cambia con los cortes**.
  - Excepción: el nº 3 (120 mil) no lleva ningún rótulo.
- [medido] Posición:
  - el borde superior de la línea queda al 15–19 % de la altura (290–365 px en 1080×1920), centrado;
  - altura de línea del 3,8–4,6 % del fotograma (≈73–88 px en 1920);
  - una sola línea que ocupa el 60–80 % del ancho.
- [visto] Estilo: blanco, sans-serif condensada en negrita, sin caja de fondo y con una sombra suave. Es pequeño y
  discreto y no tapa el producto. Mayúsculas solo en la palabra clave (RUNNER, DON'T, SEND, SHOW).
- [medido] En 4 vídeos (nº 5, 7, 8 y 10) el rótulo se sustituye en los últimos 1,0–2,2 s por un CTA en dos líneas
  («Comment "RUN" if you want this!»), algo mayor (5,5 % de altura). En 2 de ellos entra con el último corte.
- [medido] Solo el nº 5 cambia el rótulo con los cortes: «The idea 🤮» → «Vs..👀» (6,07 s) → «The result 🔥» (7,87 s),
  cada cambio a ±10 ms de un corte.

### 4.6 Gancho: susto y accidente en el primer segundo, y producto antes de 3,6 s
- [visto] Los 4 más vistos abren con una cara de sorpresa mirando a cámara en el fotograma 0. En menos de 1 s pasa algo
  físico (el vaso cae) y antes de 2 s hay un resultado visible (la mancha).
- [visto + medido] Tiempos (de vídeo):
  - la caja aparece en el expositor hacia los 2,7–3,0 s;
  - la caja en la mano, a los 3,1–3,6 s;
  - la transformación (la luz se enciende), a los 5,8–7,0 s.
- [inferido] La «conexión» que ve el dueño viene más del gancho y del texto que del montaje:
  - el texto le habla a una persona concreta («Send this to a RUNNER», que empuja a compartir);
  - la reacción humana se lee sin sonido;
  - la acción tiene causa y efecto (vaso → mancha → expositor → caja).

## 5. Qué hacen los más vistos que no hacen los menos vistos

Correlación con 10 vídeos de una sola cuenta: **no demuestra causa**. Además, los vídeos del 21–22/11 tienen 1–2 días y
aún están sumando vistas.

- **Mismo día, mismo cuerpo y misma canción; solo cambia el gancho [medido]:**
  - 21/11: nº 2, vaso derramado, **171 mil** · nº 7, Decathlon, 20,7 mil · nº 9, primer plano del producto, 10,2 mil ·
    nº 10, maletero con cámara fija, 3,4 mil.
  - 19/11: nº 3, vaso derramado, **120 mil** · nº 8, susto y señala sin vaso, 13,3 mil.
  - 17/11: nº 1, vaso derramado, **321 mil** · nº 5, zapatillas en llamas, 29,2 mil.
  - Los 4 vídeos con «vaso derramado» son los 4 más vistos (73–321 mil). Los otros 6 se quedan entre 3,4 y 29 mil.
- **Lo que difiere en el montaje [medido]:**
  - Los 4 primeros tienen un gancho de 3,1–3,6 s con mucho movimiento de cámara y la caja en la mano a los 3,1–3,6 s.
  - El último (nº 10) tiene el gancho más largo (5,5 s), con la cámara fija y el producto hacia los 4,6 s, y se salta
    la escalera.
  - El nº 9 enseña el producto desde el fotograma 0, sin intriga.
  - El número de cortes y la mediana de plano casi no cambian (7–11 cortes, 1,02–1,11 s), porque el cuerpo es el mismo.
    **La diferencia no está en el ritmo de corte, sino en el contenido del gancho.**
- El rótulo no parece decisivo: el nº 3 (120 mil) no lleva ninguno.

## 6. Límites
- 10 vídeos de una cuenta, todos de la misma plantilla y de 6 días. Cualquier comparación de vistas es indicativa; los
  vídeos de 1–2 días tienen las vistas incompletas.
- Las vistas son las de la cuadrícula (redondeadas). yt-dlp no devuelve vistas de Instagram.
- **Nadie ha escuchado los vídeos.** La música se describe con números (energía, onsets). La letra «It's you», la
  exclamación «Oh my god» y la ausencia de efectos de sonido salen de whisper y de la energía, y whisper inventa texto
  cuando hay música.
- El tempo no es seguro (117,5 bpm o 152 bpm sincopado). Lo que no depende del tempo:
  - el silencio y el drop;
  - la alineación entre vídeos;
  - el pulso regular de 1,00–1,03 s de los planos finales.
- El detector de cortes con umbral 0,30 perdía cortes dentro del mismo sitio; con 0,20 se revisaron a ojo y solo queda
  un caso dudoso (el pilar del nº 6). El script queda con 0,20 por defecto.
- La medida de zoom con opencv falla en planos sin textura (niebla) y con desenfoque de movimiento. Para eso valen las
  hojas, no los números.
- Que los ganchos estén hechos con IA es una inferencia, no un dato.
- Solo se leyó la cuadrícula y la bio. No se abrieron comentarios ni la tienda.
