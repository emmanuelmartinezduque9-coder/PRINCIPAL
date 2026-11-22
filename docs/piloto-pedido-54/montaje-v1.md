# Pedido 54: montaje v1 con el ritmo de los virales

Fecha: 22/11/2026. Herramienta: `montador/` (la copia que se ejecuta está en el Mac, `~/.principal-tools/montador/`).

## 1. Para Emmanuel

**Lo que dijiste del 02:** el 2º clip duraba demasiado y al final aparecía una imagen, los mini-zooms no tenían
sentido y los cambios de texto estaban mal puestos. Tenías razón en las tres cosas, y ya está corregido.

**Lo que hacen tus 10 virales de EisWerk (medido y mirado plano a plano):**
- Cada plano dura **~1 segundo** (la mitad dura entre 0,75 y 1,3 s). El unboxing, 1,3–1,9 s. El último, con el
  «Kommentiere…», unos 2,5 s.
- **Se corta en mitad del gesto, en cuanto se ve el resultado**: la máquina llega a cámara, la leche aún cae, la tela
  aún vuela. Nunca dejan que el clip «se pare» ni que se vea el final del clip.
- En el destape, la caja se ve **solo 0,4–0,5 s** antes de cortar.
- **Ningún zoom.** Cortes secos.
- **Un solo texto** desde el principio y el «Kommentiere…» entra **justo en un corte**.
- No cortan siguiendo el beat de la música (lo que manda es la acción). Aun así, como tú pediste cambios con el ritmo,
  el montador ajusta cada corte unas décimas para que caiga en un beat, sin estropear la acción.

**Qué hace ahora el montador (v1):** elige solo el trozo con acción de cada clip, quita las colas paradas y los finales
raros de la IA (la imagen que viste en el 02), deja cada plano ~1 s, pone los cortes en el beat, el texto CTA en un
corte y no pone zooms. Después de montar, revisa él mismo el vídeo (planos demasiado largos, finales parados, imágenes
que aparecen, textos fuera de corte) y lo arregla antes de entregar.

**Qué mirar** (carpeta `/Volumes/T7/AUTOMATIZACION SEGA/videos editados/2026-11-22/PRINCIPAL-pedido-54/`; los
antiguos siguen ahí sin tocar):

| Vídeo | Nuevo | Antes → ahora |
|---|---|---|
| **02 EisWerk** (el que criticaste) | `EisWerk - DE/02 - EisWerk - DE (v1).mp4` | 20,1 s → **12,7 s**; 8 planos |
| 01 EisWerk (canción + cuerpo reutilizado) | `EisWerk - DE/01 - EisWerk - DE (v1).mp4` | 16,0 s → 12,6 s; 9 planos |
| 03 EisWerk (Genjutsu, audio original) | `EisWerk - DE/03 - EisWerk - DE (v1).mp4` | 10,0 s → 7,3 s; 7 planos |
| 12 FalterPfote | `FalterPfote - DE/12 - FalterPfote - DE (v1).mp4` | 14,8 s → 11,5 s; 9 planos |

Para ver el cambio de un vistazo: `EisWerk - DE/revision/02 - EisWerk - DE (v1) - comparacion v0-v1.jpg` (antes a la
izquierda, ahora a la derecha). En cada `revision/` hay además `… (v1) - cortes.jpg` (cómo acaba cada plano, a 8
fotogramas por segundo) y `… (v1) - autocomprobacion.txt`.

**Qué te pido:** mira el 02 nuevo y dime si este ritmo es el que quieres. Si sí, rehago con v1 el resto del pedido.
Dos cosas para que decidas: (1) en el 02 la voz «…wie es geworden ist» termina medio segundo ya dentro del unboxing
(para no cortar la frase y no enseñar la caja más de 0,5 s); (2) el 03 queda en 7,3 s, más corto que tu viral más corto
(8,8 s), porque el clip tiene poca acción útil; si prefieres las réplicas más largas, se ajusta.

Nadie ha escuchado los vídeos todavía.

## 2. Qué cambió en el 02 (comparando las hojas de contactos)

| | Antes (v0) | Ahora (v1) |
|---|---|---|
| Gancho | 0–6,0 s; la caja se ve ~1 s quieta antes de cortar | 0–4,79 s; entra 0,46 s más tarde (justo antes de «Eins») y corta con la tela aún en el aire, 0,45 s después de asomar la caja |
| 2º clip (unboxing, cuerpo 209) | 6,0–9,04 s (3,0 s, el clip entero): plástico de burbujas, manos, la cámara se va a otra cocina (8,33 s) y **los 3 últimos fotogramas son la foto del producto sobre gris (8,92–9,04 s)** | 4,79–6,42 s (1,6 s): manos ya en la caja → sacan la máquina; **corta a mitad del gesto, en el fotograma 56 de 73 del clip**. La foto del producto y el giro de cámara se descartan solos |
| Nevera | 9,04–11,83 s (2,8 s; 2 s con la máquina quieta) | 6,42–7,33 s: solo el tirón hacia cámara, corte cuando llega al objetivo |
| Verter / tapa | 11,83–15,25 s, un plano de 3,4 s | 7,33–8,25 verter; 8,25–9,13 tapa |
| Toppings / sirope / resultado | 15,25–20,08 s, un plano de 4,8 s | 9,13–10,0 toppings; 10,0–10,88 sirope; 10,88–12,71 resultado |
| Cambio a CTA | 16,58 s, **en mitad del plano** (durante el sirope) | 10,875 s, **en el corte** al resultado (y en beat) |
| Zooms | variante con 7 mini-zooms (2,27 y 4,11 s sobre el gancho quieto, drop, cortes, 18,27 s) | ninguno |
| Cortes en beat | ninguno buscado | 6 de 7 (±45 ms); el 7º es el drop, anclado al inicio del cuerpo |
| Drop | inicio del cuerpo (6,00 s) | inicio del cuerpo (4,79 s), medido a 0,03 ms |

Lo vi en las tiras de cada corte: ningún plano termina parado ni con imagen nueva; la autocomprobación lo confirma.

## 3. Notas técnicas

### 3.1 El patrón viral (detalle en `docs/casos/referencias-edicion/patron-viral-eiswerk.md`)
- Datos: TOP 10 de @eiswerrk (292–895 mil vistas), 8 referencias del pedido 54 y los 10 de @wearheelit.
  `analizar_referencia.py` ampliado con **actividad por plano** (¿se corta con la acción en marcha?) y **tiras a
  8 fps en cada corte**; `ritmo_cortes.py` (test contra el azar) y `resumen_patron.py`.
- TOP 10, por sección: gancho de una toma 3,6–6,0 s (plantilla «destape»); destape visible 0,4–0,5 s; unboxing
  1,3–1,9 s (mediana 1,5); **cuerpo mediana 1,00 s (p25–p75 0,75–1,33; n = 57)**; último plano mediana 2,6 s;
  total 8,8–16,7 s (mediana 10,1).
- Momento del corte: actividad del último ⅓ s / media del plano = 0,99 (mediana); cola quieta mediana 0,01 s.
- Música: 24 % de cortes en beat frente a 26 % por azar (golpes fuertes 22 % frente a 18 %): no siguen el beat.
- Rótulos: uno desde 0; CTA en el último corte (8/10) o el penúltimo (2/10). Zooms: escala 1,00 ± 0,01, ninguno visto.

### 3.2 Reglas que aplica v1 y de dónde salen

| Regla | Valor en `PATRON` | Dato |
|---|---|---|
| Destape antes del corte | `hook_hold_s` 0,45 s | virales 0,35–0,5 s |
| Unboxing / primer plano del cuerpo | `reveal` 1,0 / 1,5 / 1,9 s (mín/obj/máx) | 1,3–1,9, mediana 1,5 |
| Planos de cuerpo | `body` 0,6 / 1,0 / 1,5 s | mediana 1,0, p25–p75 0,75–1,33 |
| Último plano | `final` 1,5 / 2,5 / 3,0 s | mediana 2,6 |
| Salida del plano | ventana que termina con acción; nunca cola quieta (< 25 % del p80 del tramo), corte interno, cola IA (+0,6 s de margen) | §4 del patrón |
| Ventanas por tramo | 1–4, solo si todas tienen acción (≥ 45 % del p80) | planos largos IA con varias acciones |
| Beat | ±½ beat (máx. 0,22 s) moviendo in/out, nunca velocidad | petición del dueño; los datos no lo exigen |
| CTA | en el corte del último plano (penúltimo si el último < 1,5 s) | 10/10 en un corte |
| Zooms | apagados | 0 en los virales |

Reglas del dueño que siguen: canción desde el primer fotograma, continua y sin ducking; drop en el inicio del cuerpo;
textos 06B; solo el gancho podría ir a ≤ 1,12× (en v1 ninguno se acelera); réplica con audio original continuo; voz
del gancho a −14 LUFS; no cortar palabras (la voz puede seguir ≤ 0,6 s en el cuerpo). **Cambio autorizado por el
coordinador:** los cuerpos ya no se usan enteros: se eligen in/out (sin cambiar la velocidad).

### 3.3 Resultado de los 4 montajes

| Vídeo | Planos (s) | Cortes en beat | Autocomprobación |
|---|---|---|---|
| 02 | gancho 4,79 · 1,62 · 0,92 · 0,92 · 0,88 · 0,88 · 0,88 · final 1,83 | 6/7 | OK (1 montaje) |
| 01 | gancho 5,54 · 0,71 · 0,75 · 0,79 · 0,83 · 0,79 · 0,79 · 0,67 · final 1,71 | 6/8 | OK |
| 12 | gancho 5,42 · 0,50 · 0,58 · 0,58 · 1,00 · 0,79 · 0,79 · 0,83 · final 0,96 (CTA desde 9,67 s, 2 planos) | 5/8 | OK |
| 03 | 1,33 · 0,79 · 0,83 · 0,79 · 0,79 · 0,79 · final 1,96 | 6/6 | OK (1 montaje) |

- Fotogramas de salida = previstos en los 4; audio = duración del vídeo; drop medido a 0,03 ms del inicio del cuerpo
  (02: 4,792 s; 01: 5,542 s; 12: 5,417 s). Picos −0,50 / −0,51 / −0,55 dBFS; 03 −1,29 dBFS (audio original).
- Colas descartadas solas: 02 → cuerpo 209: «destello» f70–73 (la foto del producto) y «transición a cola IA» f56–67;
  12 → trozo de 0,33 s entre dos saltos del cuerpo; 03 → trozo de 0,38 s entre dos saltos del plano largo.
- Ganchos: entrada y destape marcados mirando a 8 fps y con la energía de la voz separada (02: f11/f115;
  01: f10/f132; 12: f3/f122 → destape a 4,96 s, por debajo de tus 5 s y sin acelerar).
- Se montó varias veces mientras se afinaba el análisis (los archivos «(v1)» son la versión final). Fallos que se
  vieron y se corrigieron: el detector de cortes no veía los saltos dentro del plano largo del 03 (umbral demasiado
  alto por la toma de tienda con barridos); un veto descartaba medio tramo; el umbral de «cola quieta» confundía un
  vertido fino con un plano parado; la tolerancia de beat usaba el hueco mínimo entre beats en vez del típico.

### 3.4 Límites
- **El destape (`reveal_frame`) y la entrada del gancho se marcan a mano** en el plan (mirando); el resto es automático.
- La elección de ventanas mira **movimiento**, no significado: puede quedarse con la parte que más se mueve aunque no
  sea la más clara (en el 02, el plano de la tapa enseña la mano sujetando, no el momento de apretar). Se puede fijar
  a mano con `"ventanas": [[in_s, out_s]]`.
- Saltos dentro de una misma toma IA quedan como cortes en salto (12: caja → collar; 01: los dos últimos planos; 03:
  la tienda).
- 01: el defecto conocido del cuerpo (sirope sobre la tapa del motor) sigue en el plano del sirope.
- Beats de librosa sin validar a oído; nadie ha escuchado nada.
- Los planes v0 se siguen montando igual, salvo `snap_out` (ajuste a beat por recorte), que v1 ya no aplica (en este
  pedido no movía ningún corte).

### 3.5 Dónde está todo
- Repo: `montador/montador.py` (v1), `analizar_referencia.py`, `resumen_patron.py`, `ritmo_cortes.py`,
  `planes_v1.py`, `planes/V0{1,2,3}-v1.json`, `planes/V12-v1.json`, `montar_v1.sh`, `README.md`.
- Mac: lo mismo en `~/.principal-tools/montador/` (v0 guardado como `montador_v0.py`); análisis de clips en
  `analisis_clips/`; trabajo y logs en `/Volumes/T7/PRINCIPAL/pedido-54/trabajo/v1/`; mediciones en
  `/Volumes/T7/PRINCIPAL/referencias-edicion/eiswerk-top10/` y `…/referencias-pedido-54/`.
- No se tocó nada del sistema antiguo ni ningún vídeo anterior; no se usó Higgsfield.

### 3.6 V7 HaarZauber (montado el 22/11, más tarde)
- **Salida:** `HaarZauber - DE/07 - HaarZauber - DE (v1).mp4`: 10,00 s, 240 fotogramas, 1080×1920 H.264 + AAC. En
  `HaarZauber - DE/revision/` están `… (v1) - autocomprobacion.txt/.json`, `- cortes.jpg`, `- contactos.jpg` y
  `- plan-aplicado.json`. Las ediciones antiguas del 07 (sin «(v1)») siguen sin tocar.
- **Gancho:** Topaz 1bc5d366 del Genjutsu 5505b172, descargado en `/Volumes/T7/PRINCIPAL/pedido-54/descargas/`
  (`V7-gancho-topaz-1bc5d366.mp4`; el 480p `V7-gancho-480p-5505b172.mp4` tiene las mismas duraciones: 4,04 s de
  vídeo y 3,20 s de audio). Las cajas son de HaarZauber (visto). Una toma con cuatro clientes que cogen caja. Entra en
  f3 y corta en f87 (3,50 s), con la última clienta girándose con la caja. Se descarta la cola con el dependiente
  solo. El audio del gancho no se usa: solo suena la canción.
- **Drop** (17,74 s, canción nº 3) **en el corte gancho→cuerpo, a 3,50 s** (medido: 0 ms). El primer plano del
  cuerpo es el cepillo rosa subiendo a cuadro, que entra 1 fotograma después del corte. El inicio de la canción
  queda en 14,24 s (la tarjeta decía 14,35).
- **Cuerpo:** las ventanas están fijadas a mano en el plan, porque el automático abría con el reparto de mechones
  (sin producto) y dejaba solo 3 de 8 cortes en beat. Orden: producto (1,12 s) → cepillado arriba (1,12) → mechón que
  se riza (1,12) → peine (0,58) → mechón liso que se suelta (1,08) → resultado con ondas (1,46). 5 de 6 cortes caen en
  beat (±21 ms, 107,7 bpm). El corte que falta es el del drop, que va anclado al marcador humano (46 ms del beat de
  librosa).
- **Rótulos:** «Jede vielbeschäftigte Mama braucht genau DAS! 🎁😍» de 0 a 7,46 s, y el CTA desde **7,46 s, en el
  penúltimo corte**: el último plano dura 1,46 s (< 1,5 s, porque el tramo final del clip no da más).
- **Autocomprobación:** OK al primer montaje, sin cortes no previstos. Pico −4,3 dBFS (sin voz).
- **Para mirar:** el plano del peine dura 0,58 s, algo por debajo del 0,6 s del patrón. Los dos planos de cepillado
  salen de la misma toma IA y quedan como corte en salto. El CTA va sobre dos planos (mechón + resultado). Nadie lo ha
  escuchado.
- El plan está en `montador/planes/V07-v1.json`; en el Mac, en
  `/Volumes/T7/PRINCIPAL/pedido-54/trabajo/v1/V07-v1/V07-v1.json`, porque se lanzó con `montador.py <plan>`
  directamente.
