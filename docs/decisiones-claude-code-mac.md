# Claude del dueño con el Claude Code de su Mac (24/11/2026)

Emmanuel se quedó sin créditos de la API de Claude y tiene un plan Max de 200 $. Sus lotes usan ahora
el Claude Code de su Mac (su suscripción) para todo lo que hace Claude; la web sigue en la nube.

## Cómo va

1. **Pasarela** (`src/llm/gateway.ts`): al empezar una llamada pregunta al puente
   (`src/server/claude-mac.ts`, `macRoute`) si va al Mac. Va al Mac solo si quien llama es el dueño
   (o el dueño local sin inicio de sesión), tiene un Mac con ficha en vigor, el modo no es «Solo API»,
   el Mac dio señales en 90 s **y** su latido dice que Claude Code tiene sesión (`agents.info.claude`).
2. **Tarea `claude_code`**: la pasarela monta lo mismo que mandaría a la API (`macJobOf`: reglas +
   instrucciones como sistema, el mensaje con sus fotos en base64, el esquema JSON, modelo y esfuerzo
   del nivel, búsqueda si la hay) y lo deja en `agent_tasks.payload`. Espera mirando la fila cada
   1,5 s (el paso del trabajo sigue latiendo solo).
3. **Agente 1.8.0** (`agente-mac/claude.mjs`): 4 huecos que reclaman con `{ solo: "claude_code" }`
   (cola aparte: la de enlaces nunca da estas tareas y estas nunca bloquean los enlaces). Cada una:
   `claude -p --input-format stream-json --output-format stream-json --model … --effort …
   --system-prompt-file … --json-schema … --tools "" --setting-sources "" --strict-mcp-config
   --no-session-persistence`, en una carpeta temporal vacía, 10 min como mucho, latido cada minuto.
   Con búsqueda: `--tools WebSearch,WebFetch` (permitidas) y las direcciones leídas vuelven como
   `webSources` (el alta de productos las usa para marcar fuentes comprobadas).
4. **Respuesta**: el Mac entrega `resultado` (texto, JSON validado por Claude Code, tokens, lo que
   habría costado en la API según Claude Code, fuentes, si se cortó). La pasarela lo valida con el
   mismo esquema zod y devuelve el mismo `LlmResult` que la API: nada de arriba cambia.

## Decisiones

- **Suscripción, nunca API.** El agente quita del entorno de `claude` todo `ANTHROPIC_*` (clave,
  dirección), `CLAUDE_CODE_USE_*` y lo de sesiones anidadas. La sesión es una ficha de
  `claude setup-token` (la forma que Claude Code da para programas sin pantalla) guardada en
  `~/.principal-agente-claude.json` (600); la pide `agente-mac/conectar-claude.sh`, Emmanuel entra él
  mismo. `CLAUDE_CONFIG_DIR` propio (`~/.principal-tools/claude-config`): no se cargan sus CLAUDE.md,
  memoria ni plugins en los prompts del motor.
  - Comprobado el 24/11/2026: el `claude` de `~/.local/bin` estaba roto (busca un nivel de carpeta
    menos del que usa ahora la app de escritorio) y la CLI no tiene sesión propia (la de la app de
    escritorio no sirve para un programa en segundo plano). Por eso el agente busca el binario él
    mismo (`claudeCandidates`, el más nuevo de la app primero) y usa la ficha.
- **Nada en el disco interno** (orden del 24/11/2026, `docs/datos-en-ssd.md`): `instalar.sh`, si
  está montada `/Volumes/PRINCIPAL-DATOS`, pone `TMPDIR=/Volumes/PRINCIPAL-DATOS/tmp/` en el plist del
  agente (también al reinstalar, sin tener que repetir `disco-ssd.sh` para eso). Las carpetas de
  trabajo de `claude` van a `TMPDIR`; su configuración, sesión, cachés y datos (`CLAUDE_CONFIG_DIR` y
  `XDG_*`) a `~/.principal-tools/claude-config` (enlazada al SSD). `--no-session-persistence`: no
  guarda conversaciones.
- **Fotos en la fila, no en el almacén.** Las fotos de una llamada están en memoria en el proceso de
  trabajos, no en el almacén: van en base64 en `payload` mientras la tarea espera y se borran al
  terminar (queda solo la respuesta). Un mensaje de más de 24 MB va a la API.
- **Modo** (`settings` `claude.mac.mode`, en Ajustes → Mac): `mac_primero` (por defecto), `solo_mac`,
  `api`. Con «Mac primero», si el Mac está apagado / sin sesión / en límite / falla / tarda más de
  25 min, esa llamada va por la API dentro de los topes y el libro lo apunta (`detail.macFallback`).
  Con «Solo Mac», apagado o límite = pausa del paso (`LlmCapReachedError` → `JobPausedError`, se
  reanuda solo cada hora); un fallo = error de la llamada.
- **Límite del plan**: si Claude Code responde que se llegó al límite, el Mac lo dice (`limite: true`)
  y durante 30 min (`claude.mac.limitUntil`) no se le manda nada.
- **Libro de gasto**: lo hecho en el Mac se apunta liquidado a 0 $ sin reservar ni mirar topes
  (`recordMacSpend`), con `detail.via = "mac"`, `apiEquivalentMicros` y `macTaskId`. Ajustes enseña
  llamadas del mes en el Mac, ahorro y cuántas fueron a la API.
- **Seguridad**: la ficha del Mac solo reclama tareas creadas para su dueño (`createdBy`), solo los
  Mac de un dueño activo entran, y la entrega exige la sesión de esa reserva (`uploadId`): un intento
  viejo o la tarea ya retirada dan 409. Los prompts son reglas, instrucciones y datos del producto:
  ningún secreto. `claude` corre sin herramientas que toquen el disco o ejecuten nada.
- **Trabajos en pausa**: los que quedaron en pausa sin saldo en la API (o con «Solo Mac» y el Mac
  apagado) se reanudan solos en la pasada de cada hora; además, en cuanto el latido del Mac pasa a
  decir que Claude Code tiene sesión (`agentHeartbeat` → `claudeReady`), se reanudan en el momento y
  van al Mac.
- **Agente antiguo**: un agente < 1.8.0 no manda `claude` en el latido, así que la pasarela ni lo
  intenta (va directa a la API). Si aun así una llamada queda 3 min en cola sin que el Mac recoja
  ninguna, se retira.

## 1.8.1 (24/11/2026, tras la primera conexión de verdad)

- `conectar-claude.sh` guardó cinco fichas pegadas seguidas (647 caracteres) y `auth status` la daba
  por buena igualmente: `auth status` **no valida la ficha**. Ahora lo pegado pasa por
  `cleanClaudeToken`: la misma ficha repetida queda en una, fichas distintas o algo que no es una
  ficha se rechaza y se vuelve a pedir (hasta 5 veces). `readClaudeToken` arregla también una ficha
  ya guardada repetida.
- Comprobación de verdad: al guardar la ficha, y cada vez que el agente pasa de «no listo» a
  «listo», se hace una llamada mínima (Haiku, «ok», ~1,5 s). Si la sesión se rechaza, el agente no
  recoge llamadas, el latido manda el motivo (`claudeMotivo`) y Ajustes → Mac lo enseña junto al Mac;
  mientras, los lotes van por la API. Un rechazo en una llamada real hace lo mismo.
- yt-dlp «onefile» tarda 9-10 s en arrancar en frío y la comprobación daba 15 s: «No se puede lanzar
  yt-dlp» a ratos. `PROBE_TIMEOUT_MS` pasa a 60 s.

## Montajes sin Claude (24/11/2026)

- Leer la edición de la referencia (rótulos y cortes) es una llamada a Claude dentro del montaje. Antes,
  si fallaba, el montaje seguía «con el patrón de siempre» y quedaba hecho pero peor: eso pasó con la
  API sin saldo antes de conectar el Mac. Ahora, si el fallo es por falta de Claude
  (`LlmCapReachedError`: API sin saldo, «Solo Mac» con el Mac apagado, tope), el montaje vuelve a la
  cola cada 5 min sin gastar intento (`edit_runs.error = WAITING_CLAUDE`) durante 3 h como mucho;
  después monta con el patrón de siempre. Otro fallo de Claude sigue sin bloquear.
- En cuanto el latido del Mac pasa a «Claude Code listo», además de reanudar los trabajos en pausa,
  los montajes que esperaban a Claude se adelantan a ahora (`wakeRunsWaitingForClaude`).
- Una vez (`montaje.relanzado-sin-claude-20261124`, al arrancar el worker): los vídeos de lote desde
  el 23/11 con el montaje fallido, o hecho con la nota «No se pudo leer la edición de la referencia»,
  se vuelven a montar (`relaunchEditsWithoutClaude`). El doblaje ya hecho se reutiliza.
- Las notas del montaje terminado guardan también las de la nube (antes solo los avisos del montador).

## Rótulos sin recuadros ni marcas ajenas (24/11/2026)

- Recuadro con X en el primer rótulo del vídeo 15: un carácter que no estaba en los rangos de emoji del
  montador se pintó con la fuente de los rótulos, que no lo tiene. Ahora (`montador/texto06b.py`): todo
  carácter que la fuente de los rótulos no tenga, o que lleve selector de variante (U+FE0F), va con la
  fuente de emojis de Apple; lo que no tenga dibujo en ninguna se quita antes de pintar (`clean`); una
  unión ZWJ que la fuente no junta en un solo dibujo se pinta por piezas, cada una de 1 em (antes salía
  encogida). Prueba: `test_sin_recuadros` en `montador/test_texto06b.py`.
- La lectura de la edición de la referencia nunca nombra marcas, personajes, licencias ni
  colaboraciones de terceros (regla 6b de `REFERENCE_EDIT_INSTRUCTIONS`); Claude devuelve además los
  nombres ajenos que vio (`ajenos`) y `withoutThirdParties` los cambia por el producto si se colaran
  («FalterPfote X HARRY POTTER» → «FalterPfote»). La clave de su caché pasa a `v3` para que se vuelva a
  leer.
- Una vez: el 15 se vuelve a montar (`remountEditsOnce`). El 22 lo monta la sesión del doblaje cuando
  su doblaje y esto estén listos (un solo montaje final).

## Lugares de la referencia en los rótulos (24/11/2026, vídeo 24)

- El 24 (lote 7, KreuzKapuze, montaje 67) decía «…an Fremde in den USA…» en un anuncio grabado en Berlín: la
  referencia era de EE. UU. y la adaptación dejó su lugar. Regla 6c de `REFERENCE_EDIT_INSTRUCTIONS`: todo lugar
  o país del original se cambia por el de nuestro anuncio (`{LUGAR}`), con la gramática correcta; Claude devuelve
  además los que vio (`lugares`).
- El lugar (`targetPlace`): la ciudad que nombren las indicaciones del dueño (nota del vídeo, adaptación,
  indicaciones del lote: «las calles de Berlín» → «Berlin»); si no nombran ninguna, el primer país del producto
  (Deutschland, Österreich, der Schweiz, Italia).
- Red de seguridad (`withLocalPlaces`), como la de las marcas: los lugares de siempre de otros mercados (USA, US,
  Amerika, New York, UK, London…) y los que vio Claude se cambian por el nuestro, quitando el artículo
  («in den USA» → «in Berlin»). Se aplica también a las lecturas ya guardadas (sin volver a leer: los demás
  rótulos quedan igual) y a los rótulos de la tarjeta o del desglose.
- Una vez: reporte en Mejoras ligado al montaje 67, de tipo rótulos, con el arreglo de código aplicado
  (`recordAppliedFixOnce`), y el 24 se vuelve a montar.

## «¿Qué quieres cambiar?» en el montaje (24/11/2026)

- En el diálogo del montaje (tablero del lote) y en el paso «Montaje» del vídeo: un campo con dictado y
  «Volver a montar con este cambio». Sin preguntas ni confirmaciones de coste (el montaje es barato). Lo puede
  pedir cualquiera que vea el vídeo (colaboradores incluidos); Claude va con el tope de quien lo pide (el dueño,
  al Mac).
- `POST /api/videos/<id>/montaje/cambio` (`cambio-montaje.ts`): crea el reporte en «Mejoras» ligado a la versión
  que se vio (así una corrección general se aprende para los demás), guarda el cambio en
  `videos.edit_override.pendiente` y pone el montaje en la cola.
- En el montaje, después de leer los rótulos de la referencia, Claude aplica el cambio a la ficha (rótulos, orden
  y tiempos, emojis, CTA, música de la biblioteca, doblaje sí/no) y solo a lo que pide. Los rótulos cambiados
  quedan en `edit_override.rotulos` y mandan en los montajes siguientes; el historial en `cambios`. Si cambia la
  música o el doblaje, la ficha se rehace y el montaje vuelve a empezar con ella. Sin Claude, espera como la lectura.
- Los avisos del montaje ya no se pintan en amarillo (regla 2): van plegados en «Detalles técnicos».
- El diálogo enseñaba una versión vieja («Versión 1» con «in den USA» cuando ya estaba el montaje 68): el lote no
  se vuelve a pedir si no hay nada en marcha, y un remontaje hecho por el servidor no se veía hasta recargar.
  Ahora, al abrir el diálogo se pide el lote otra vez.

## 1.8.2 (24/11/2026): «no tiene sesión» y el disco de datos del SSD

- A las 13:31 la imagen de datos del SSD (`/Volumes/PRINCIPAL-DATOS`, ver `docs/datos-en-ssd.md`) se
  quedó conectada pero desmontada (probablemente el T7 se desconectó un momento): `~/.principal-tools`,
  `~/.principal`, `yt-dlp` (uv) y el `TMPDIR` del agente apuntaban a la nada y el agente daba «Claude
  Code no tiene sesión» y «No se puede lanzar yt-dlp». `montar-disco.sh` no lo arregla en ese caso
  (`hdiutil attach` de una imagen ya conectada no monta): se arregló soltándola (`hdiutil detach`) y
  volviéndola a conectar.
- El agente: con Claude Code listo, la comprobación de cada 5 min ya no se fía solo de `auth status`
  (lento en frío; las comprobaciones cortas pasan de 20 s a 60 s): mira que sigan el programa, la carpeta
  temporal y la de configuración de Claude Code. Si falta una, deja de recoger llamadas y el motivo
  («¿el disco de datos del SSD está desmontado?») llega a Ajustes; mientras, van por la API.

## Pruebas

- `tests/claude-mac.test.ts`: ruta (dueño/colaboradora/modos/apagado/sin sesión), llamada completa
  por las rutas reales del agente (contrato igual que la API, 0 $ en el libro, sin tocar la API, la
  foto ya no queda en la tarea), búsqueda, cola separada, límite → API y descanso, fallo → API, Mac
  apagado con la llamada en cola, «Solo Mac» en pausa, respuesta mala (400) y de otro intento (409).
- `tests/agente-mac-claude.test.ts`: argumentos y entorno de `claude` (sin clave de API), búsqueda del
  binario, lectura de la salida (JSON, fuentes, límite, sin sesión, cortada) y una vuelta completa con
  `claude` y web de mentira (corte por la web y por tiempo).

## Rótulos: tamaño fijo y líneas equilibradas (06B de Codex)

Orden de Emmanuel (24/11/2026): unos rótulos salían diminutos y otros enormes, con líneas descompensadas
(«„Wir haben unsere Weihnachtsdeko schon aufgehängt… nur eben nicht am Baum 😅"» a 35 px en dos líneas muy
desiguales). Causa: cada rótulo se encogía por su cuenta desde 74 px y las líneas venían de los `|` de la
referencia (en alemán, desiguales) o de cortar a 34 caracteres.

Ahora (`montador/rotulos_layout.py`, usado por `texto06b.py`, `montar_auto.py` y `montador.py`):
- **Un tamaño fijo para todos los rótulos: 58 px** (los rótulos de Codex solían quedar entre 50 y 64; a 58 la
  mayoría cabe en dos líneas con el corte en la frase, como los hacía Codex a mano; a 64 salían muchos de tres).
  Nunca se encoge un rótulo para que quepa.
- Ancho útil 886 − 2·0,05·58 − 12 = 868,2 px, medido con la fuente real (kerning y emojis). **Máximo 3 líneas.**
- Se usan las mínimas líneas que caben; sin una palabra corta suelta en su línea (una palabra larga sola, como
  «Weihnachtsdeko», sí vale); la de arriba ≤ **1,15** × la de abajo si se puede; y entre esas, las líneas más
  parejas. Con un 3 % del ancho de margen gana el corte en puntuación o en un `|` de la referencia: los `|` son
  pistas, nunca saltos obligatorios. Los emojis van pegados a la palabra anterior; si una palabra larga con sus
  emojis no cabe, los emojis pueden bajar de línea.
- Si no cabe en 3 líneas, se parte en **rótulos seguidos** (primero en fin de frase, luego en coma, luego por
  palabras), repartiendo el tiempo por caracteres, sin huecos ni solapes, con un mínimo de **0,8 s** por parte
  cuando hay tiempo. El CTA conserva su papel en todas sus partes; las continuaciones no avisan de «fuera de corte».
- Misma posición vertical: el bloque se centra siempre en el centro de la caja x112/y287/886×318.
- Único caso que se encoge: una sola palabra que no cabe ni sola en una línea (rarísimo); ese rótulo, al mayor
  tamaño en que cabe, para no romper el montaje.
- Se conserva el resto del 06B: TikTokDisplay-Medium, blanco, contorno 0,05 em, interlínea 35/31, PNG 886×318.
  `fit_size` queda solo para la prueba de equivalencia con el Swift.

Programado con Codex (`codex exec`) y revisado aquí: se cambió el orden de criterios (el corte en frase manda al
partir en rótulos; «las más parejas» en vez de «cada línea más corta que la siguiente», que dejaba «„Wir haben»
sola arriba) y se arregló un fallo real («Das kommt auf meinen Weihnachtswunschzettel 🍦🎄🤭» hacía caer el
montaje). Pruebas: `montador/test_texto06b.py` y `test_montar_auto.py`.

## Codex como ejecutor del Mac y modo comparar

Agente **1.9.0** (24/11/2026). El contrato `claude_code` sigue siendo el mismo; `MacJob.engine`
añade `claude`, `codex` o `comparar`. Un agente anterior ignora ese campo y sigue haciendo Claude.
`instalar.sh` copia también `codex.mjs`; hay que actualizar el agente para ejecutar Codex.
El latido incorpora `codex` opcional: con sesión de ChatGPT puede recoger llamadas aunque Claude
no esté listo. «Solo API» y los permisos del dueño se conservan.

### Ajuste por paso

`claude.mac.engines` guarda un objeto completo en `settings`. Solo el dueño lo cambia mediante
`PUT /api/ajustes/claude` (`engines`); Ajustes → Mac ofrece un selector por paso. Por defecto:

| Paso | Claves reales | Motor |
| --- | --- | --- |
| Desglose | `video.desglose:*:desglose:*` | comparar |
| Fotos de Pinterest | `video.pinterest:*:banco/consultas/eleccion:*` | comparar |
| Sala e imagen inicial | `video.pinterest:*:prompt-sala:*` | comparar |
| Rótulos y cambios de montaje | `montaje:*:edicion-referencia/cambio:*` | comparar |
| Habla, canto y doblaje | `montaje:*:habla-o-canto:*` | comparar |
| Otros | Alta e investigación de productos, mejoras, comprobación del sistema/efecto, claves futuras | claude |

`macStepOf` es pura y sus pruebas enumeran todas las llamadas actuales. Las consultas para buscar
fotos pertenecen a Pinterest; el prompt de sala se decide aparte aunque viva en el mismo trabajo.

### Ejecución y caídas

- Codex se busca en `PRINCIPAL_CODEX_BIN`, `~/.local/npm-global/bin/codex`, `/opt/homebrew/bin/codex`
  y `/usr/local/bin/codex`. `codex login status` debe indicar **ChatGPT**; una sesión con API key
  se rechaza. Si falta sesión, el dueño ejecuta `codex login` en su Mac. No se instala nada.
- Se eliminan `OPENAI_*`, `CODEX_*`, `AZURE_OPENAI_*` y `ANTHROPIC_*` del entorno del proceso.
  `model_provider="openai"` y `forced_login_method="chatgpt"` fijan el proveedor y la autenticación.
  `--ignore-user-config` conserva la autenticación del dueño sin cargar su configuración;
  `--ignore-rules`, plugins/apps y herramientas de ejecución desactivadas evitan su MCP y su perfil.
- `codex exec --sandbox read-only --skip-git-repo-check --ephemeral -C <vacío>` recibe sistema y
  texto por stdin, cada foto como archivo privado con `-i`, el esquema con `--output-schema` si
  existe y la última respuesta con `-o`. Los archivos van fuera de la carpeta de trabajo vacía y
  se borran al terminar. Se usa el modelo por defecto de la CLI, sin pasarle un nombre de Claude;
  el resultado lleva `codex:<modelo>` si aparece en los eventos, o `codex:desconocido`.
- **Búsqueda:** comprobados localmente `codex exec --help`, `codex --help` y `codex features list`.
  `--search` se anuncia en la ayuda general, pero no en la de `exec`: se configura
  `-c web_search="live"` cuando `job.web` lo pide y `"disabled"` en el resto. No se promete el
  mismo número de búsquedas/lecturas que Claude ni se reconstruyen fuentes: `webSources: []`.
  Una CLI antigua que no admita los argumentos falla y cae a Claude.
- Mismo latido y tope de diez minutos, incluida la comprobación de sesión de Codex. El agente
  comprueba JSON y su estructura local; Zod en la pasarela sigue siendo la validación definitiva.
  Uso según eventos JSONL o ceros; coste equivalente desconocido (`null`).
- `codex`: si falla el programa, la sesión, el tiempo o el JSON, prueba Claude en la misma tarea.
  Si Codex entrega algo que no pasa el Zod original, la pasarela encola **una** repetición forzada
  con `engine: "claude"`. Si tampoco sirve, sigue por la API (o falla/pausa en «Solo Mac», como
  antes). El límite de Claude no bloquea una elección Codex/comparar.
- `comparar`: ambos arrancan a la vez. Entrega Claude en cuanto termina; si falla, entrega Codex
  si pudo responder. El hueco sigue ocupado hasta que terminen ambos y se envíe la comparación:
  `CLAUDE_SLOTS` cuenta tareas, no procesos. El registro dice qué motor respondió.

### Comparaciones y validación

`llm_comparisons` conserva una fila por tarea, creada al reclamar una comparación: id de tarea,
paso/clave, tiempos, ambos textos (máximo **200.000 bytes UTF-8** cada uno), error de Codex, fecha y
`codexValid` nullable. Se guarda también la reserva (`uploadId`, para rechazar entregas de otro
intento) y si el texto de Codex se recortó. El endpoint autenticado
`POST /api/agente/comparaciones` exige ese Mac y esa reserva; la clave del paso sale de la tarea,
nunca de lo que declare el agente. No conserva las fotos ni el prompt original.

La pasarela pasa el **Zod original**, solo dentro del servidor, al puente. Se liga al id de tarea
con una caducidad de una hora: llamadas simultáneas no comparten su validador. Normalmente la llamada
vive en el worker y el POST llega al proceso web. Por eso el worker observa la fila cada 1,5 s sin
bloquear la respuesta de Claude y escribe `codexValid` cuando llega Codex. Si todo corre en el mismo
proceso, el endpoint puede validarlo directamente. Incluye refinamientos Zod que no caben en JSON
Schema; se usa el mismo extractor del JSON final que la pasarela para las respuestas con búsqueda.

`true` significa que pasó ese Zod; `false`, que falló o Codex tuvo error. **NULL significa sin
validar**: comparación pendiente, reinicio/cambio de proceso del worker, caducidad o texto recortado
(ya no se puede validar la respuesta entera). No se inventa un aprobado usando solo JSON Schema.
La comparación queda guardada aunque el worker se reinicie; el informe señala esa incertidumbre.
No es un canal de recuperación del resultado: si se corta la red al mandar el POST, el agente lo
anota y la fila sigue pendiente.

### Informe manual

Con `DATABASE_URL` de este proyecto:

```sh
npx tsx scripts/informe-comparacion.ts --desde 2026-11-24 --salida /tmp/comparacion.md
```

Sin `--desde`, incluye todo; sin `--salida`, escribe `informe-comparacion.md` en la carpeta actual.
Agrupa por paso y muestra cada llamada, las dos salidas lado a lado (principio y final si son
largas), los milisegundos, si Codex pasó Zod y una columna **veredicto** vacía para rellenarla a mano.
Las comparaciones pendientes y las salidas sin validar se distinguen de un fallo de esquema.
