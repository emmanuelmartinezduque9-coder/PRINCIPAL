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
- **Agente antiguo**: un agente < 1.8.0 no manda `claude` en el latido, así que la pasarela ni lo
  intenta (va directa a la API). Si aun así una llamada queda 3 min en cola sin que el Mac recoja
  ninguna, se retira.

## Pruebas

- `tests/claude-mac.test.ts`: ruta (dueño/colaboradora/modos/apagado/sin sesión), llamada completa
  por las rutas reales del agente (contrato igual que la API, 0 $ en el libro, sin tocar la API, la
  foto ya no queda en la tarea), búsqueda, cola separada, límite → API y descanso, fallo → API, Mac
  apagado con la llamada en cola, «Solo Mac» en pausa, respuesta mala (400) y de otro intento (409).
- `tests/agente-mac-claude.test.ts`: argumentos y entorno de `claude` (sin clave de API), búsqueda del
  binario, lectura de la salida (JSON, fuentes, límite, sin sesión, cortada) y una vuelta completa con
  `claude` y web de mentira (corte por la web y por tiempo).
