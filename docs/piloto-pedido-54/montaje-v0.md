# Pedido 54: montaje con ritmo, versión 0 (fase B del piloto)

Fecha: 22/11/2026. Herramienta: `montador/` en este repositorio (copia que se ejecuta en el Mac: `~/.principal-tools/montador/`).

## 1. Para Emmanuel: qué tienes y qué mirar

**Dónde están los vídeos:** `/Volumes/T7/AUTOMATIZACION SEGA/videos editados/2026-11-22/PRINCIPAL-pedido-54/`

| Vídeo | Archivo principal | Variante para comparar | Audio |
|---|---|---|---|
| V3 EisWerk | `EisWerk - DE/03 - EisWerk - DE.mp4` | `03 - EisWerk - DE (mini-zooms).mp4` | el original del Genjutsu |
| V5 HaarZauber | `HaarZauber - DE/05 - HaarZauber - DE.mp4` | `05 - … (mini-zooms).mp4` | el original del Genjutsu |
| V8 HaarZauber | `HaarZauber - DE/08 - HaarZauber - DE.mp4` | `08 - … (mini-zooms).mp4` | el original del Genjutsu |
| V12 FalterPfote | `FalterPfote - DE/12 - FalterPfote - DE.mp4` (A, sin zoom) | `12 - … (mini-zooms).mp4` (B) | tu canción nº 2, con el drop al empezar el cuerpo |
| V9 FalterPfote | `FalterPfote - DE/09 - FalterPfote - DE.mp4` | `revision/09 - … (audio original).mp4` (solo para comparar) | tu canción nº 2, con el drop en el plano del collar |

Cada carpeta tiene una subcarpeta `revision/` con la **hoja de contactos** (un fotograma cada medio segundo) y el
**plan aplicado** (un registro de cada corte, velocidad, zoom, rótulo y ajuste de audio que se ha hecho).

**Qué te pido que mires:**
1. **V12, A contra B.** El drop de la canción cae justo cuando entra el cuerpo con la caja FalterPfote (segundo 5,42).
   ¿Te gusta ahí, o lo prefieres en el destape de las cajas del gancho (4,54 s)? En B hay cinco mini-zooms: uno más
   fuerte (7 %) en el drop y otros suaves (4–6 %) en cortes que caen en el beat.
2. **V3, V5 y V8, normal contra mini-zooms.** Son réplicas: cortes, velocidad y audio intactos. La variante solo añade
   unos pocos acercamientos suaves (4–6 %, 2 o 3 por vídeo). ¿Te parecen bien, pocos, demasiados o sobran en las réplicas?
3. **V9.** Aplicado lo que dijiste hoy: aunque es Genjutsu, lleva tu canción. **Ojo, el clip tiene un fallo de generación**:
   entre 2,7 y 3,1 s, al quitar la tela sale un **rottweiler con alas de dragón naranjas** en vez del husky con alas de
   mariposa. Dura menos de medio segundo, pero se ve. Decide si lo publicas así o se regenera (eso costaría créditos).
4. **El volumen de la voz en V12** (el «Eins, Zwei, Drei…» del gancho sobre la canción). Nadie lo ha escuchado todavía.

**Sin hacer:** las descripciones (`Beschreibung`) no se han escrito, porque nunca se guardó el pie de foto de las
referencias. V1, V2 y V7 necesitan tu visto bueno y Topaz (cuesta créditos). V4, V6, V10 y V11 hay que regenerarlos.

**Lo que se descargó de Higgsfield** (gratis, ya estaba generado; está en `/Volumes/T7/PRINCIPAL/pedido-54/descargas/`):
- **V1, gancho corregido (73c78aac):** el fallo parece arreglado. La tela blanca es opaca y no se ven las cajas rosas
  debajo en ningún momento de 0 a 4,5 s. El destape es a ~4,75 s. Está en 480p: necesita Topaz.
- **V2, gancho corregido (ed0559f6):** el fallo parece arreglado. Tela rosa opaca con el logo EisWerk; se ve la forma
  de la caja, pero no la caja. El destape es a ~4,75–5,0 s. Está en 480p: necesita Topaz.
- **V7, gancho (5505b172):** cuatro clientes cogen cajas de un palé en una tienda con el cartel «ACTION». Las cajas
  parecen de HaarZauber (no se lee bien la marca a 480p). El vídeo dura 4,04 s, pero el audio solo 3,2 s: hay que cortar
  en 3,2 s como estaba previsto. Necesita Topaz y tu revisión.
- **V9, Topaz (66469331):** el reescalado está bien (1080×1920, nítido). El fallo del rottweiler viene de la generación
  original, no del Topaz.

## 2. Notas técnicas

### Cómo funciona el montador
Un programa en Python (`montador/montador.py`, ~420 líneas) y un pequeño script Swift (`texto06b.swift`) que dibuja los
rótulos. Cada vídeo tiene un plan JSON (`montador/planes/`, generado con `planes.py`). Formato y uso en
`montador/README.md`. En el Mac se lanza con `./montar.sh planes/V12.json`. librosa se carga con
`uv run --with librosa --with soundfile --with numpy`, con `UV_CACHE_DIR=$HOME/Library/Caches/uv-principal` y
`COPYFILE_DISABLE=1`. No se crea ningún entorno virtual en el T7.

**Beats.** Se usa `librosa.beat.beat_track` (tightness 100) sobre la canción, o sobre el audio original en las réplicas.
El mapa se guarda en `~/.principal-tools/montador/beatmaps/<sha256>.json`. Los compases (1 de cada 4 beats) se alinean con
el beat más cercano al drop guardado.

**Drop.** Inicio de la canción = drop guardado − momento en que se muestra el producto. La canción suena desde el primer
fotograma, seguida y a volumen constante (sin ducking). Solo se aplica una ganancia global para que el pico no pase de
0,94. Nunca se alarga el gancho. **Decisión del dueño (22/11):** el «producto mostrado» es el **inicio del cuerpo**, donde
aparece el producto en sí. Se aplica así en V12 y, en V9 (sin cuerpo), en el primer fotograma del plano del collar.

**Comprobación numérica independiente del drop.** Después de exportar, el programa busca por correlación (FFT, 16 kHz) en
qué punto de la canción está sonando el vídeo entre el momento del producto y el final, y de ahí calcula dónde cae el
drop en el vídeo terminado:

| Vídeo | Producto mostrado | Desfase previsto | Desfase medido | Drop en el vídeo final | Diferencia |
|---|---|---|---|---|---|
| V12 (A y B) | 5,4167 s (fotograma 130, primer fotograma del cuerpo) | 3,9033 s | 3,9033 s | **5,4167 s** | 0,03 ms |
| V9 | 3,1667 s (fotograma 76, primer plano del husky/collar) | 6,1533 s | 6,1533 s | **3,1667 s** | 0,03 ms |

El desfase de V12 coincide con el de la edición antigua (3,903). Aviso: el marcador humano del drop (9,32 s) cae a
0,26 s del beat más cercano que detecta librosa (9,06 / 9,59 s). La energía de la canción sube hacia los 9,0–9,15 s.
Se ha respetado el marcador, como mandan las reglas, pero conviene que Emmanuel lo escuche.

**Ajuste de cortes a beats.** Solo en clips marcados para ello, solo recortando (tolerancia 0,08 s) y nunca en el corte
que sostiene el drop. En este pedido no se ha movido ningún corte. El único corte libre era el de gancho a cuerpo de V12,
y ese corte es el ancla del drop. Cuerpos y réplicas conservan sus cortes y su velocidad, así que el ritmo lo ponen los
mini-zooms.

**Velocidad.** V12: el gancho pasa de 145 a 130 fotogramas (1,1154×, por debajo del máximo de 1,12×), quitando fotogramas
repartidos. La lista de fotogramas quitados está en el plan aplicado. Igual que la edición antigua: el destape (fotograma
fuente 122) queda en el fotograma de salida 109 (4,54 s, menos de 5 s), y las cajas se ven 21 fotogramas (menos de 1 s)
antes del cuerpo. El resto de vídeos van a 1×.

**Mini-zooms.** Son acercamientos al centro: suben en 0,12 s (seno) y vuelven en hasta 0,9 s (coseno), sin cruzar nunca
el siguiente corte. Valores: 1,04 en compás, 1,06 en corte y 1,07 en el drop, con una separación mínima de 1,6 s.
- **Prioridad:** primero el drop, luego un corte que cae en el beat, luego cualquier corte y por último el primer beat de
  un compás.
- **Cuándo no se ponen:** en los 0,6 s siguientes a la aparición de un rótulo, justo antes de que aparezca uno, ni con
  rótulos de más de 70 caracteres en pantalla.
- **Cortes:** se detectan con el detector de escena de ffmpeg (umbral 0,2).
- **Rótulos:** el zoom se aplica solo a la imagen (zoompan sobre la imagen escalada al doble). Los rótulos se ponen
  después, así que no se mueven ni se recortan.
- **Comprobado fotograma a fotograma en V3:** las variantes con y sin zoom solo difieren dentro de las ventanas de zoom
  (PSNR ≥45 dB fuera, ~21–22 dB dentro).
- **En réplicas** están apagados por defecto; las variantes «mini-zooms» los activan expresamente.

Zooms aplicados (segundo, intensidad):

| Vídeo | Zooms |
|---|---|
| V3 | 2,83 (corte, 6 %), 4,71 (compás, 4 %), 9,50 (compás, 4 %) |
| V5 | 4,30 (compás, 4 %), 10,58 (corte, 6 %). De 0 a 2,6 s no hay zooms porque el primer rótulo tiene 78 caracteres. |
| V8 | 7,04, 8,99 y 10,98 (compás, 4 %) |
| V12 B | 2,09 (compás, 4 %), **5,42 (drop, 7 %)**, 8,17 y 10,00 (corte en beat, 6 %), 12,63 (corte, 6 %) |

**Textos 06B.**
- **Fuente:** `/Volumes/AutomatizacionProyecto/AUTOMATIZACION IA VIDEOS/EDITOR/fonts/TikTok-Display-Medium.ttf` (la del
  motor antiguo).
- **Estilo:** blanco, contorno exterior negro de 0,05 em (AppKit strokeWidth −10 debajo del relleno), interlínea 35/31 em.
- **Caja:** invisible, x112/y287/886×318, con el texto centrado.
- **Tamaño:** baja desde 74 px hasta que el texto cabe, con salto de línea a 34 caracteres, igual que el motor antiguo.
- **Textos y tiempos:** los de `source-overlay-boundaries.json`; en V12, los de la edición antigua.
- **Tamaños resultantes:** V3 74/58 px; V5 y V8 55/58/72/52 px; V12 74/54 px; V9 64 px.

**Exportación.** Igual que el pedido 81 (probado en `01 - EisWerk - DE.mp4`): H.264 High, yuv420p, 1080×1920, 24 fps,
CRF 18 (preset fast), AAC 192 kb/s a 44,1 kHz estéreo, faststart. Salen entre 7,5 y 8,7 Mb/s. En las réplicas con audio
original, la pista se copia sin recodificar.

**Audio de V12.**
- **Voz:** la pista separada con Demucs por el motor antiguo (`post-edit/audio-review/separation-v12/v12/voice-demucs.wav`,
  0–4,95 s, solo el habla del gancho). Medida a −20,2 LUFS y subida +6,2 dB, hasta −14 LUFS. Lleva atempo 1,1154, la
  misma velocidad que el gancho, sin cambiar el tono.
- **Canción:** en el tramo del gancho está a −19,4 LUFS, unos 5 dB por debajo de la voz. El cuerpo va sin audio propio.
- **Mezcla:** pico previo de 0,0 dBFS, ganancia global de −0,54 dB, pico final de −0,6 dBFS.

**Audio de V9.**
- **Versión principal:** solo la canción. Ganancia 0 dB y pico de −5,7 dBFS, sin tocar (suena algo más baja que V12).
- **Audio generado:** se quitó, igual que la música original. **No se ha escuchado** si llevaba voz. La variante con el
  audio original está en `revision/` para comparar.

### Lo que verifiqué mirando
- **V3 (prueba antes del resto):** comparé la hoja de contactos y fotogramas a resolución completa con la edición antigua
  (`final-v3-r1`) y con el vídeo 01 del pedido 81. El rótulo sale en la misma posición, tamaño y fuente que en la edición
  antigua, y la zona y el estilo coinciden con los del pedido 81. Se lee bien sobre fondo claro gracias al contorno
  (en V3 pasa por encima del cartel «ACTION» de la tienda).
- **V12:**
  - Fotogramas 109, 129, 130 y 133. El destape está en el 109; el último fotograma del gancho (129) aún muestra las cajas;
    el 130 es la caja FalterPfote del cuerpo.
  - En la variante B, el zoom del drop agranda la imagen sin recortar el producto ni el rótulo.
  - El CTA aparece a 11,29 s, sobre el paseo con alas.
- **V9:**
  - Corte al husky en el fotograma 76, que coincide con el drop. Fotogramas 73–75: rottweiler con alas de dragón (el
    defecto).
  - El emoji 👱‍♀️ se dibuja bien.
- **V5 y V8:** hojas de contactos revisadas. Los rótulos cambian en los cortes de la referencia y son legibles.
- **Duraciones (ffprobe):**
  - Todos los vídeos tienen exactamente los fotogramas previstos (241, 313, 289, 355 y 281) y pista de audio.
  - V12: vídeo 14,792 s, audio 14,791 s. V9: 11,708 / 11,708 s.
  - Réplicas: el audio original empieza a 0,09 s y dura lo mismo que en el clip, sin cambios.

### Límites conocidos de v0
- **Escucha:** no se ha escuchado ningún vídeo. Las comprobaciones de audio son numéricas.
- **Beats:** son automáticos. El tempo de librosa sale cuantizado (152 o 117 bpm) y puede ir al doble o a la mitad del real.
- **Audio original:** solo se admite con un clip entero (réplica fiel).
- **Hoja de contactos:** a veces deja una fila vacía al final.
- **Zooms:** pocos (2 a 5 por vídeo) y conservadores. La intensidad y la frecuencia siguen pendientes de que el dueño las
  defina con ejemplos. Se cambian en el plan con `zoom.amounts`, `drop_amount` y `min_gap`.
- **Revisión independiente:** las reglas piden una revisión de cortes, audio, textos y drop que no ha hecho nadie
  distinto del montador. Los vídeos son candidatos para que Emmanuel los revise, no entregas verificadas.
- **Carpeta de entrega:** se llama `PRINCIPAL-pedido-54` (no `app-…-54`), para no mezclarla con el sistema antiguo.

### Pendiente
- **V1, V2 y V7:** que Emmanuel revise los ganchos descargados. Después, Topaz (**cuesta créditos**) y montaje con canción
  (V1 nº 2 con drop 9,32; V2 nº 11 con drop 7,49; V7 nº 3 con drop 17,74, cortando el gancho en 3,2 s). El cuerpo de V1
  sigue en 480p y tiene el defecto del sirope.
- **V4, V10 y V11:** regenerar (rechazados). **V6:** generar el vídeo (llevará la canción nº 6, según la decisión del 22/11).
- **V9:** decidir sobre el defecto del rottweiler.
- **Descripciones (`NN - Beschreibung - DE.txt`):** no se han escrito. Hay que sacar los pies de foto de las referencias
  o que los escriba el dueño.
- **Validar con el dueño:** el punto del drop en V12 y V9, la intensidad y frecuencia de los zooms, el volumen de la voz
  de V12 y el marcador del drop de la canción nº 2.

### Dónde escribí en el Mac
- `~/.principal-tools/montador/`: `montador.py`, `texto06b.swift`, `planes.py`, `montar.sh`, `planes/` y `beatmaps/`.
- `/Volumes/T7/PRINCIPAL/pedido-54/`:
  - `descargas/`: los cuatro MP4 de Higgsfield y sus hojas de contactos.
  - `trabajo/`: rótulos PNG, mezclas, registros y las pruebas de V3 y V12 en `trabajo/prueba/`.
- La carpeta de entrega indicada arriba.

No se tocó nada del sistema antiguo, que solo se leyó: clips, voz separada, canción, fuente y planes antiguos. No se llamó
a ninguna herramienta de Higgsfield que gaste créditos; solo se usó `show_generations` para listar resultados.
