# PRINCIPAL — plataforma y motor de ángulos (diseño, entrega 1)

Fecha: 2026-11-22. Estado: pendiente de aprobación del dueño.

## Por qué

Emmanuel hace dropshipping orgánico con vídeos de IA (productos virales de EE. UU. llevados a
Alemania; los mismos vídeos en alemán sirven para Austria y Suiza). Hoy lo produce hablando con
Codex en su Mac: cuesta unos 500 $/mes, rinde poco, la web es mala y solo puede usarla él.

Quiere una web que personas contratadas puedan usar para testear productos por él, cada una con
su propia cuenta de Higgsfield, y que sea "una máquina de marketing": su prioridad número uno son
los **ángulos de venta y audiencias**. Su lógica: Instagram tiene "cupos" por producto y mercado;
las 2–3 primeras cuentas que viralizan un producto se lo quedan. Si llegas tarde, la salida es
entrar por otra audiencia u otro uso que nadie ha tomado (si la competencia va a madres, ir a
abuelas; si va a corredores, ir a ciclistas o skaters). Mismo producto, mismo mecanismo, otra gente.

## El proyecto completo y su orden

Son varios proyectos independientes. Orden acordado por prioridades del dueño:

1. **Base de la web + motor de ángulos** (este documento).
2. Conexión de Higgsfield por persona + adaptación de conceptos + imagen inicial (Nano Banana Pro
   con sus reglas), con aprobación desde el móvil.
3. Clip con Seedance 2.5 fiel al vídeo de referencia, sin Genjutsu.
4. Edición con ritmo (golpes de la canción + cortes de la referencia), ejecutada en su Mac.
5. Radar de cuentas, comentarios propios como fuente de conceptos, panel de equipo y resultados.

Cada uno tendrá su propio documento de diseño. Dentro de la entrega 1 se hace además una **prueba
técnica** de la conexión de Higgsfield, porque Higgsfield cambia el registro de aplicaciones el
31/12/2026 y de esa prueba depende la entrega 2.

## Metas de la entrega 1

- Web publicada en Railway con correo y contraseña, y dos papeles: **dueño** y **colaborador**.
- Por cada producto, un **expediente** con datos comprobados y un **mapa de ángulos**:
  audiencias y usos posibles, cuáles están ocupados en el mercado de habla alemana y cuáles
  libres, con evidencia real, ordenados, y con ganchos en alemán y un brief de vídeo por ángulo.
- Coste de IA visible por producto y con **tope mensual** que no se puede superar.
- Las reglas del dueño en un solo sitio, editables por él.

## Fuera de alcance (entrega 1)

Generar imágenes o vídeos, editar, publicar, vigilar cuentas automáticamente, leer datos de
Finanzas/Shopify. El sistema actual del Mac **no se toca**: solo se lee para copiar reglas.

## Lo que haría fracasar esto aunque funcione

- Ángulos inventados: funciones que el producto no tiene, citas falsas, "libre" sin datos.
- Que el dueño tenga que explicar mucho para obtener un buen resultado.
- Que un colaborador gaste dinero del dueño sin tope, o vea claves ajenas.
- Volver al patrón caro: una IA que conduce todo el proceso en lugar de ser consultada.

## Restricciones

- Sistema mixto ya decidido por el dueño: web en Railway; su Mac (siempre encendido) hará el
  trabajo pesado en entregas posteriores; IA por API de Claude con tope (una suscripción personal
  no puede atender a terceros).
- Repositorio `PRINCIPAL`. No se modifica `finanzas-tiendas` ni su base de datos.
- Mercado: alemán (DE/AT/CH como un solo espacio de idioma, con el país como dato), algo de italiano.
- El dueño no es técnico: interfaz en español, clara, usable desde el móvil.
- Nunca claves en el repositorio; claves de terceros cifradas en la base de datos.

## Enfoques considerados

- **A. Web nueva con pasos fijos y la IA como consulta (elegido).** El programa hace lo mecánico;
  la IA se llama en pasos concretos con entradas y salidas definidas. Barato, medible, multiusuario.
- **B. Poner una interfaz encima del motor actual del Mac.** Más rápido al principio, pero hereda
  el modelo de dos usuarios fijos, ocho bases de datos sueltas y la dependencia de Codex. Descartado:
  no sirve para delegar ni baja el coste.
- **C. Un agente (Claude) que haga todo conversando.** Es el patrón que hoy cuesta 500 $/mes.
  Descartado.

El dueño eligió el sistema mixto y dejó las decisiones técnicas al constructor.

## Decisiones técnicas (del constructor, no del dueño)

- Misma base que `finanzas-tiendas`, que ya funciona en Railway: Next.js + Postgres + Drizzle,
  inicio de sesión con invitación por enlace de un solo uso. Se copia el patrón, no se comparte código.
- Cola de trabajos en Postgres (pg-boss) para los pasos largos; cada paso es reanudable y no se
  paga dos veces (clave única por paso).
- Claude API: modelo pequeño para extraer y etiquetar, modelo mediano para generar ángulos y
  ganchos; caché de las reglas; cada llamada registra su coste contra producto y usuario.
- Las reglas del dueño (copiadas en `docs/reglas-origen/`) se cargan como textos versionados en la
  base de datos. La skill `angulos-de-venta` del dueño es la base del razonamiento y se conserva:
  ángulo = comprador × usuario × momento × motivo × utilidad real; una variante de color o de
  palabra no es un ángulo; evidencia separada en ventas verificadas / comunicadas por el dueño /
  señales / hipótesis; normalmente 3–5 candidatos, sin relleno.

## Cómo funciona el motor de ángulos

1. **Expediente del producto.** El usuario sube foto(s) del producto, una frase de qué hace y
   enlaces (tienda, vídeos virales de EE. UU.). La IA redacta la ficha en hechos: qué hace, por
   qué mecanismo, límites. Toda promesa de marketing se guarda como "afirmación sin comprobar".
   El dueño confirma precio, envío y límites.
2. **Abanico de audiencias y usos.** A partir del mecanismo, la IA propone todas las personas,
   actividades y momentos donde ese mismo mecanismo sirve. Cada propuesta lleva la cadena
   característica → utilidad → situación → motivo para pagar. Se descartan solas las que exigen
   una función no comprobada o trasladan un uso entre adultos, niños y animales sin verificar.
3. **Voz del cliente.** Se recogen comentarios y reseñas de los enlaces dados y se parten en
   frases de una sola idea (dolor, deseo, objeción, uso). El programa comprueba que cada cita
   existe literalmente en la fuente. Sin evidencia, el ángulo queda marcado como hipótesis.
4. **Mapa ocupado / libre.** El usuario añade cuentas o vídeos competidores del mercado alemán
   (y la web busca más si la fuente de datos lo permite). Cada vídeo se etiqueta con su audiencia
   y su ángulo. Cada casilla del mapa queda como libre, incipiente, disputada o saturada, con
   quién la ocupa. Con pocos datos se dice "datos insuficientes", nunca "libre".
5. **Ángulos ordenados.** Prioridad: probado en EE. UU. y libre aquí; después hueco con evidencia;
   después flanqueo (mismo dolor, otra audiencia). Criterio clave: que un vídeo de 20 s pueda
   **mostrarlo** sin tener que afirmarlo. El usuario elige cuáles probar.
6. **Ganchos y brief.** Por ángulo elegido: ganchos en alemán en tres capas (primer fotograma,
   frase, texto en pantalla) y un brief (primera escena, demostración, cierre). Filtro de
   afirmaciones arriesgadas en Alemania (salud, urgencia falsa, precios tachados): se marcan para
   revisión humana. El brief queda listo para la entrega 2.
7. **Historial.** Qué ángulos se probaron y su estado (propuesto, en prueba, ganador, quemado).

Aprobaciones humanas: hechos del expediente, selección de ángulos, afirmaciones marcadas y
ganchos finales. Lo demás es automático.

## Pantallas

- **Productos**: lista y alta.
- **Expediente**: ficha, afirmaciones, fuentes.
- **Mapa de ángulos**: tabla audiencia × dolor/uso con colores de ocupación; al tocar una casilla
  se ven competidores y citas.
- **Ángulos**: tarjetas ordenadas con evidencia, ganchos y brief; botones aprobar / descartar.
- **Reglas** (solo dueño), **Personas** (solo dueño), **Gasto** (por producto y persona, con tope).

## Incógnitas que resuelve el constructor con pruebas cortas

- **Fuente de comentarios y vídeos competidores.** Opciones: un servicio de pago por uso
  (ScrapeCreators o Apify, céntimos por producto) y/o Trendtrack, que el dueño ya paga. Hay que
  probar la cobertura real de vídeos orgánicos en alemán. Si la búsqueda automática es pobre, la
  entrega 1 funciona con los enlaces que añade el usuario.
- **Conexión de Higgsfield por persona** (prueba técnica, no producto): registrar la web como
  cliente del conector oficial, conectar una cuenta real, medir cuánto dura el permiso y
  confirmar que se descuentan los créditos del plan. Requiere permiso del dueño porque gasta
  unos pocos créditos.
- Reglas legales de Alemania: el filtro es una ayuda, no asesoría legal.

## Decisiones del constructor tras la revisión (el dueño puede corregirlas)

- **Contenido de los vídeos competidores.** Para etiquetar un vídeo hace falta verlo, no solo
  leer su descripción. La entrega 1 incluye un componente pequeño en Railway: descarga el vídeo,
  saca unos fotogramas y el texto en pantalla, y la IA los etiqueta. No usa el Mac. Si la fuente
  de datos falla con un enlace, el usuario puede subir el archivo del vídeo o pegar los
  comentarios a mano; el paso no se bloquea.
- **Tope de gasto.** Un tope mensual global y otro por persona. Cubre la API de Claude y el
  servicio de datos. Al llegar al tope, los trabajos quedan en pausa y se reanudan cuando el
  dueño lo sube o empieza el mes. Antes de cada llamada se comprueba el saldo.
- **Filas y columnas del mapa.** Salen del abanico (paso 2) y de la voz del cliente (paso 3).
  Si un vídeo competidor no encaja en ninguna, se propone una nueva y el dueño la aprueba.
- **Umbrales de ocupación** (valores iniciales, editables por el dueño en Reglas): libre = ninguna
  cuenta; incipiente = 1–2 cuentas; disputada = 3–5; saturada = más de 5. Con menos de 15 vídeos
  analizados para el producto en ese mercado, todo el mapa muestra "datos insuficientes". Estos
  números son un punto de partida sin validar; se ajustan con el primer producto real.
- **Cuando la investigación y la skill del dueño discrepan, manda la skill.** 3–5 ángulos por
  producto, prioridad argumentada con texto (sin puntuaciones con fórmula), 2 ganchos por ángulo
  con un botón "más ganchos". Lo demás de la nota de investigación es referencia opcional.
- **Reglas cargadas en esta entrega.** Solo `angulos-de-venta` con sus referencias y la parte de
  `adaptacion-de-conceptos` que afecta al brief. Se carga una versión limpia (sin rutas del Mac
  ni llamadas a otras skills) y se conserva el original. El filtro de afirmaciones para Alemania
  es un borrador marcado como "sin revisión legal".
- **Mercado e idioma** son un dato de cada producto desde el principio (alemán por defecto), para
  que añadir italiano no obligue a rehacer nada.
- **Ganador / quemado** es un estado manual: quien lo cambia indica el tipo de evidencia (ventas
  verificadas, comunicado por el dueño, solo visitas) y una nota.
- **La prueba de Higgsfield es la primera tarea**, no la última. Entrega: un informe en `docs/` y
  el código mínimo de conexión por persona que reutilizará la entrega 2.

## Pendiente de respuesta del dueño

1. Qué ve y qué puede aprobar un colaborador.
2. Qué plataformas cuentan para decidir si un ángulo está ocupado.
3. Permiso para gastar unos pocos créditos de Higgsfield en la prueba de conexión.

## Qué decide el dueño después

Tope mensual de IA, qué colaboradores entran, y revisar las primeras tarjetas de ángulos con un
producto real suyo para afinar el criterio.
