# Parámetros de montaje sacados de @wearheelit (para el montador)

Fecha: 22/11/2026. Base: `wearheelit.md` (10 reels medidos y mirados). Qué hace hoy el montador y sus límites:
`montador/README.md` y `docs/piloto-pedido-54/montaje-v0.md`.

**Cómo leer esto.** Cada número dice de dónde sale: [medido] en la referencia, [visto] en las hojas o [inferido]
(propuesta mía para el caso del dueño, no medida). Los tiempos son de vídeo final a 24 fps salvo que se diga otra cosa.
Las decisiones que tocan reglas actuales del dueño están marcadas **DECISIÓN DEL DUEÑO** y no se han aplicado.

## 0. Resumen en una frase
La referencia no consigue el ritmo con zooms ni cortando cada beat. Lo consigue con:
- un gancho largo en movimiento;
- una plantilla de cuerpo con **dos anclas fijas en la canción** (producto en mano y transformación en el drop);
- un **silencio** justo antes del drop con el producto quieto a cámara;
- el corte del drop **3 fotogramas antes del golpe**;
- una ráfaga de cortes justo después;
- un final con **un plano cada 2 beats (~1 s)**.

## 1. Duración y estructura

| Tramo | Referencia [medido] | Objetivo para el montador | Notas |
|---|---|---|---|
| Total | 10,6–13,5 s | **12–13,5 s** | Ya está en ese rango (V12: 14,8 s; conviene recortar el final) |
| Gancho (hasta el primer plano del producto) | 3,1–3,6 s en los 4 más vistos (5,5 s en el peor) | **2,8–3,6 s**; nunca más de 4,5 s | Ya va en esa línea (destape < 5 s); ajustar el tope a 3,6 s |
| Producto en mano / primer plano | entra a 3,1–3,6 s y dura 1,0–1,2 s | **entra ≤ 3,6 s, dura 0,9–1,2 s** | Primer ancla |
| Demostración antes del drop | 1,03 s + 0,60 s (este último, durante el silencio) | **1,4–2,0 s en 2 planos** | El último plano antes del drop enseña el producto quieto |
| Drop → payoff | 0,93 / 0,37 / 1,40 s | **3 planos en 2,5–2,8 s**: 0,9 / 0,35–0,45 / 1,3–1,5 s | La transformación entra con el drop |
| Final | 4 planos de 1,00–1,03 s (+ el último ~1,2 s) | **3–4 planos de exactamente 2 beats** | Sin plano de cierre; el CTA va en el rótulo |

Ritmo por tercios [medido]: 1 corte en el primer tercio, 5 en el segundo y 4 en el tercero. Mediana de plano: 1,03 s.
Ningún plano del cuerpo pasa de 1,4 s.

## 2. Cortes y beats

1. **Cortes del cuerpo en tiempos fijos de la canción**, calculados desde el drop (D = tiempo del golpe del drop en el
   vídeo final). Plantilla de la referencia convertida a beats (b = 60/bpm) [medido con la rejilla de 117,5 bpm]:

   | Corte | Posición | Contenido |
   |---|---|---|
   | primer plano del producto | D − 2,85 s (≈ −5,6 b) | caja en la mano |
   | inicio de la demostración | D − 1,77 s | ponerse el producto |
   | inicio del silencio | D − 0,70 s | producto quieto a cámara |
   | **drop** | **D − 0,11 s (3 fotogramas a 30 fps; 2–3 a 24 fps)** | transformación en primer plano |
   | ráfaga | D + 0,82 s y D + 1,19 s | otro ángulo (0,37 s); payoff |
   | final | **D + 5 b, D + 7 b, D + 9 b, D + 11 b** (+0–50 ms) | un plano cada 2 beats |

   Los cortes de antes del drop no van al beat en la referencia (quedan a 100–240 ms de la rejilla). El montador no tiene
   que forzarlos; basta con respetar los tiempos relativos al drop.
2. **El corte del drop va adelantado, no encima del golpe.** [medido] El golpe llega 80–115 ms después del corte en los 9
   vídeos. Parámetro propuesto: `drop_lead_frames: 3` a 30 fps, o `2` a 24 fps (83 ms). Hoy el montador pone el drop
   exactamente en el fotograma del producto (diferencia 0,03 ms): habría que desplazar la canción 2–3 fotogramas más
   tarde.
3. **Final al beat.** Tolerancia ±40 ms (la referencia está a +0–54 ms). El `snap_tolerance` actual (0,08 s) vale, pero
   hoy solo recorta el gancho: hace falta poder **colocar** cortes en el cuerpo (ver §6).
4. **Tempo.** No fiarse del tempo de librosa sin más. En esta canción daba de 112 a 152 bpm según el vídeo.
   - Comprobar que el pulso cuadra con el golpe siguiente al drop (en la referencia, la luz se enciende 1 beat después).
   - Guardar el tempo validado junto al drop en la biblioteca de canciones, como ya se guarda el drop humano.
   - `analizar_referencia.py --bpm` sirve para comprobarlo en vídeos de referencia.
5. **Sin «corte en cada beat».** Con planos de 1 s y una canción de ~118 bpm, un corte cada 2 beats es el máximo que se
   ve en la referencia. Cortar en cada beat (0,5 s) sería el doble de rápido que lo que funciona aquí. [inferido] Para
   canciones más lentas (< 95 bpm), 1 corte por beat; para canciones > 140 bpm, cada 2 o cada 4 beats, buscando planos
   de 0,9–1,1 s.

## 3. El drop

- **Qué enseñar en el drop: la transformación o el producto en acción**, no la primera aparición del producto. [medido]
  La caja se ve 2,9 s antes del drop; con el drop entra el primer plano del producto puesto, y el efecto (la luz) llega
  1 beat después.
- **DECISIÓN DEL DUEÑO.** El 22/11 decidió que el «producto mostrado» (el ancla del drop) es el inicio del cuerpo. La
  referencia sugiere separar las dos cosas:
  - `product_shown` (ancla 1, sin drop): primer plano del producto, ≈ D − 2,85 s;
  - `payoff` (ancla 2, con el drop): el momento de la transformación.

  Si el cuerpo de un vídeo no tiene una transformación clara, se queda como ahora.
- **Silencio previo.** [medido] Las canciones que funcionan así tienen un silencio de unos 0,6 s (−40 dB) justo antes del
  drop. En ese silencio va un plano quieto del producto hacia cámara.
  - Al elegir canción y drop, comprobar automáticamente que hay una caída de ≥ 15 dB en el segundo anterior.
  - Si no la hay, avisar en el plan aplicado: el drop pegará menos.
- **Ráfaga después del drop:** 2 cortes en los 1,2 s siguientes (0,9 s y 0,35–0,45 s) y luego un plano de 1,3–1,5 s.

## 4. Zooms y movimiento

**Lo que hace la referencia:** ningún zoom de edición [medido: escala 1,00 ± 0,01 dentro de los planos del cuerpo]. El
movimiento sale de la cámara (persecución, barrido) y de la acción (se enciende la luz, el corredor salta).

**Lo que propongo para el dueño [inferido].** Sus clips IA suelen tener menos movimiento y planos más largos, así que
los mini-zooms tienen sentido, pero con otro papel: **rellenar planos quietos, no marcar el ritmo**.

| Tipo | Cuándo | Cantidad | Curva | Dónde no |
|---|---|---|---|---|
| Golpe en el drop (punch-in) | solo si el plano del drop no tiene movimiento propio | 1,06–1,08 | subida en 2–3 fotogramas (0,08–0,12 s), vuelta en 0,6–0,9 s con coseno | si la transformación ya se mueve sola |
| Empuje lento (push-in) | planos de más de 1,5 s sin movimiento de cámara | 1,03 → 1,06 en todo el plano | lineal o ease-in-out | gancho con barrido; planos con rótulo nuevo (0,6 s) |
| Golpes en el final | en 1 de cada 2 cortes del final (cada 4 beats) | 1,04 | igual que el del drop | nunca dos seguidos |
| Rampa / sacudida / transición | no se usan | — | — | — |

- Máximo **3–4 zooms por vídeo** (hoy: 2–5) y como mucho 1 por plano. El `min_gap` actual (1,6 s) vale.
- Medir el movimiento del clip antes de decidir: `analizar_referencia.py` ya da el desplazamiento medio por plano. Con
  más de ~3 px/fotograma (a 360 px de ancho), no añadir zoom.
- **El movimiento importante va en el clip, no en la edición.** Al generar ganchos IA hay que pedir cámara en mano que
  sigue la acción y un barrido hasta el producto, como en la referencia. Esto es para el prompt de generación, no para
  el montador.

## 5. Texto

| Parámetro | Referencia [medido/visto] | Para el montador | Cambio sobre 06B |
|---|---|---|---|
| Nº de rótulos | 1 todo el vídeo (8 de 10) | **1 rótulo de 0 al final**, + CTA opcional al final | hoy V12 lleva 2 |
| Palabras | 5–7 + 1 emoji al final | **4–7 palabras, ≤ 32 caracteres, 1 línea** | hoy hay rótulos de hasta 78 caracteres |
| Posición | borde superior de la línea al 15–19 % (290–365 px a 1920) | línea anclada arriba a **y ≈ 300–340 px**, centrada | 06B centra el texto en la caja y287/h318: con 1 línea queda a ~410 px. Anclarlo arriba |
| Tamaño | altura de línea 3,8–4,6 % (≈ 73–88 px) | 06B a 64–74 px | ya cuadra |
| Estilo | blanco, sans condensada en negrita, sombra suave, sin caja | 06B (blanco con contorno) | vale; [inferido] un contorno más fino o una sombra lo acercaría más |
| Mayúsculas | solo la palabra clave (RUNNER, DON'T) | 1 palabra en mayúsculas | — |
| Cambio con los cortes | no (salvo el formato idea/vs/resultado) | no; si hay varios rótulos, cambian **en un corte** (±1 fotograma) | hoy los tiempos vienen del plan; añadir «pegar al corte más cercano» |
| CTA final | en 4 de 10, últimos 1,0–2,2 s, 2 líneas, un 20 % mayor | **opcional: últimos 1,5–2 s, entra en el último corte** | nuevo |
| Texto del rótulo | habla a una persona: «Send this to a RUNNER», «DON'T let a RUNNER see this» | en alemán, p. ej. «Schick das einer Läuferin», «Zeig das NICHT deiner Mama» | contenido: decide el dueño |

## 6. Funciones que le faltan al montador, por prioridad

1. **Cortar y reordenar el cuerpo** (sub-clips con in/out de varios clips fuente, sin cambiar la velocidad). Sin esto no
   se puede reproducir la plantilla de 7–8 planos ni la ráfaga del drop. **DECISIÓN DEL DUEÑO**: hoy la regla es «los
   cuerpos conservan sus cortes y su velocidad».
2. **Plantilla de cuerpo anclada en la canción.** Lista de planos con su posición relativa al drop (en segundos o en
   beats), reutilizable con distintos ganchos. El gancho se recorta para que el primer plano del producto caiga en
   D − 2,85 s, como ahora se hace con el drop. Con esto, un solo cuerpo bueno sirve para muchos vídeos (que es lo que
   hace @wearheelit con 10 ganchos).
3. **Dos anclas de audio**: `product_shown` y `payoff` (el drop va en el payoff), más `drop_lead_frames` (2–3).
   **DECISIÓN DEL DUEÑO** (cambia la decisión del 22/11).
4. **Final al beat**: colocar los últimos 3–4 cortes cada 2 beats (±40 ms) eligiendo el in/out de cada sub-clip, no solo
   recortando.
5. **Comprobaciones automáticas en el plan aplicado**:
   - gancho ≤ 3,6 s hasta el producto;
   - algo se mueve en el primer segundo (desplazamiento medio > 0 o un rótulo);
   - silencio ≥ 15 dB antes del drop;
   - ningún plano del cuerpo > 1,5 s sin movimiento ni zoom;
   - duración total 12–13,5 s.
6. **Zooms según el movimiento**: solo en planos quietos (§4); golpe en el drop solo si el plano no se mueve.
7. **Texto**: anclar 06B arriba (y ≈ 300–340 px) con 1 línea, pegar los cambios de rótulo al corte más cercano y CTA
   final opcional.
8. **Tempo validado por canción** en `beatmaps/` (bpm + fase comprobados contra el golpe siguiente al drop), en lugar de
   fiarse de `beat_track`.

## 7. Reglas actuales que habría que relajar (para que decida el dueño)

| Regla actual | Qué pide la referencia | Propuesta |
|---|---|---|
| «Cuerpos y réplicas conservan sus cortes y su velocidad» | cuerpo cortado en 7–8 planos de 0,37–1,4 s | Permitir cortar y reordenar el cuerpo **sin cambiar la velocidad**. Las réplicas fieles pueden seguir intactas |
| «El ajuste a beats solo recorta y nunca toca el corte del drop» | el corte del drop se coloca 2–3 fotogramas antes del golpe; los finales se colocan al beat | Permitir **colocar** cortes (eligiendo in/out), con `drop_lead_frames` |
| «Producto mostrado = inicio del cuerpo = drop» (22/11) | drop en la transformación; producto en mano ~2,9 s antes | Dos anclas: `product_shown` y `payoff` |
| Mini-zooms 4–8 % repartidos por cortes y compases | la referencia no usa zooms; el ritmo lo dan los cortes y el movimiento | Zooms solo en planos quietos y en el drop si hace falta; máx. 3–4 |
| Rótulos largos (hasta 78 caracteres) y varios por vídeo | 1 rótulo de 5–7 palabras todo el vídeo | Limitar a ≤ 32 caracteres; cambiar solo en cortes |
| Gancho acelerado hasta 1,12× | sin rampas ni aceleraciones visibles | Se puede mantener: la referencia no lo contradice |

## 8. Qué no se sabe todavía
- **Tempo.** No se ha escuchado ninguna canción. El tempo de la referencia (117,5 bpm) sale de las medidas y cuadra con
  el golpe de la luz y con los planos finales, pero está sin confirmar.
- **Montaje frente a gancho.** No se sabe cuánto del éxito es montaje y cuánto es el gancho. En la referencia, con el
  mismo montaje, las vistas van de 3 mil a 321 mil según el gancho.
- **Zooms.** Los zooms propuestos en §4 no salen de esta referencia. Son una compensación para clips con poco movimiento
  y hay que validarlos viendo un A/B, como en V12.
