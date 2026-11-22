# Producción de vídeo: de la referencia al clip (plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada persona, con su propio Higgsfield, pueda en la web dar un vídeo de referencia y un producto y salir con un clip generado (referencia → desglose → imagen inicial → clip → descarga), sin gastar nunca dos veces ni sin confirmación.

**Architecture:** Un conector aislado (`src/connectors/higgsfield/`) habla con el MCP oficial de Higgsfield con el permiso OAuth de cada persona, detrás de la interfaz `HiggsfieldPort` (las pruebas y el modo local usan uno simulado). El vídeo de referencia entra por trozos, se procesa con `ffmpeg` en Railway (fotogramas en Postgres, recorte subido al Higgsfield de la persona, el archivo se borra) y Claude lo desglosa por la pasarela existente con visión. Cada generación es una fila con su estado (`generations`): la intención se confirma en la base de datos antes de llamar, se envía una sola vez y un resultado desconocido se reconcilia contra el historial de Higgsfield, nunca se reenvía solo.

**Tech Stack:** el del plan 1a (Next.js 16.4.6, React 19.3.0, Drizzle + PostgreSQL, pg-boss 12.39.0, zod 4, vitest 5, `@anthropic-ai/sdk` 1.12.0) más `@modelcontextprotocol/client` (cliente MCP por HTTP en flujo; ver decisión 2), `ffmpeg`/`ffprobe` del sistema y, en el Mac del dueño, Node ≥ 22 + `yt-dlp`.

**Spec:** `docs/superpowers/specs/2026-11-22-produccion-de-video-design.md`. Contexto: `docs/superpowers/specs/2026-11-22-plataforma-y-motor-angulos-design.md`, `docs/superpowers/plans/2026-11-22-base-plataforma.md`, `docs/decisiones-base-plataforma.md`.

## Global Constraints

Se heredan todas las del plan 1a (cabecera de `docs/superpowers/plans/2026-11-22-base-plataforma.md`). Las que más pesan aquí y las nuevas:

- Repositorio `/home/user/principal`. **No se toca `finanzas-tiendas`**. No se modifican `docs/reglas-origen/`, `docs/research_notes/` ni `docs/reports/`.
- **Next.js 16**: antes de escribir código de Next, leer la guía que toque en `node_modules/next/dist/docs/`.
- Nunca secretos en el repositorio. Los permisos de Higgsfield (acceso y refresco) van **cifrados en la bóveda** (`saveCredential(userId, "higgsfield", …)`); a las pantallas solo llega `credentialStatus`.
- **Ninguna llamada a un modelo fuera de `src/llm/gateway.ts`.** **Nada fuera de `src/connectors/higgsfield/` importa `@modelcontextprotocol/*`.** Dentro de `src/`, solo `src/server/media/` lanza procesos (`node:child_process`). `tests/boundaries.test.ts` lo comprueba.
- **Toda función de servidor que reciba un `videoId` empieza por `getVideoFor(user, videoId)`**, que pasa por `getProductFor`. Vídeo ajeno, inexistente o id mal formado: el mismo `404 Vídeo no encontrado.` Las tablas nuevas de vídeo solo las toca `src/server/videos/`.
- **El Higgsfield que se usa es siempre el de la persona de la sesión** (o, en un trabajo en cola, el de quien creó el vídeo). Ninguna ruta acepta un identificador de persona.
- TDD con vitest y PostgreSQL embebido (`truncateAll()` en `beforeEach`; lanzar como usuario sin privilegios: `runuser -u ubuntu -- npm test`). **Las pruebas no llaman a servicios de pago ni a la red**: Higgsfield (`createFakeHiggsfield`), Claude (`fakeMessages`) y `fetch` se inyectan.
- Interfaz en español, clara para una persona no técnica, usable a 390 px. **En cada tarea con pantallas** el implementador carga las skills instaladas `impeccable` y `shadcn` (`.claude/skills/`) y comprueba el resultado a 390 px con Playwright (capturas en `.superpowers/sdd/2026-11-22-produccion-de-video/shots/`), como en el plan 1a.
- Identificadores, tablas y columnas en inglés; textos, rutas visibles, comentarios y commits en español. Un commit por tarea. Nombres de trabajo en cola: solo letras, números, `.`, `-`, `_`, `/` (el registro real no admite `:`).
- Dinero de Claude en micro-dólares por el libro de gasto existente. **Los créditos de Higgsfield son enteros (`credits`) y no se convierten a dólares**.
- Valores fijados por el diseño: referencia **máx. 100 MB**, `mp4`/`mov`/`webm` validados por contenido; **máx. 24 fotogramas**; imagen **Nano Banana Pro `2k` `9:16`, 2 candidatas por ronda**; clip **Seedance 2.5, `omni_reference`, `480p`, sin audio, `bitrate_mode: "high"`**, duración = la de la referencia acotada a **4–30 s**; **máx. 2 regeneraciones por imagen y por clip**; rechazo con **motivo de una línea**; siempre `use_unlim: false`.
- Dependencia nueva fijada exacta; leer su README antes de usarla. Decisiones que surjan: `docs/decisiones-produccion-de-video.md`.
- **Web publicada:** `https://principal-production-6265bcf2.up.railway.app` (servicio `principal` de Railway; se despliega sola desde `main`). El dueño ya tiene cuenta y `ANTHROPIC_API_KEY` está puesta. Las variables de Railway las pone el coordinador con la CLI de Railway; el dueño no tiene que tocar Railway. La dirección de vuelta de OAuth es `<PUBLIC_URL>/api/higgsfield/callback`.
- **Cola de trabajos (código real, Tarea 11 del plan 1a en curso; leerlo antes de usarlo):** `enqueueJob(name, { userId, productId }, data)` y `startWorker` en `@/jobs/boss`; `defineJob`, `defineSchedule(name, cron, run)` en `@/jobs/registry`; `runStep`, `stepKey`, `JobContext`, `JobPausedError`, `StepFailedError` en `@/jobs/steps`. `runStep` comprueba que la persona sigue activa y sigue viendo el producto, y `recoverInterruptedSteps` vuelve a encolar cada 5 minutos los trabajos con un paso fallido o interrumpido al que le queden intentos (3 en total): **un paso que no deba repetirse solo lanza `StepFailedError`**. Los módulos que definen trabajos se importan en `src/worker/main.ts` antes de `startWorker()`.

## Review Focus

Lo que el diseño implica y un camino feliz no ejercita; cada línea tiene su prueba en la tarea indicada.

1. **El proceso se cae entre «envío» y «tengo el identificador»** (o llegan dos trabajos, o un doble clic): se envía una sola vez; al volver no se reenvía, se busca en el historial de Higgsfield, y solo se deja repetir cuando es seguro que no llegó. → Tarea 8.
2. **Créditos insuficientes a mitad del flujo** (alcanza para la imagen y no para el clip, o el saldo baja entre el presupuesto y el envío, o el precio sube): mensaje con cifras, nada enviado, la imagen aprobada se conserva. → Tareas 8 y 10.
3. **Permiso de Higgsfield caducado o revocado** (también con dos peticiones refrescando a la vez): un solo refresco; si Higgsfield lo rechaza, «vuelve a conectar» sin bucles, y una generación pendiente queda «no enviada». → Tareas 1 y 8.
4. **Vídeo de 100 MB desde un móvil con mala cobertura**: un trozo repetido no se duplica, la subida sigue donde iba, y si el servidor se reinició lo dice claro. → Tareas 5 y 7.
5. **Un colaborador toca el vídeo o la conexión de otra persona** (id de otro vídeo, `state` de otra persona en la vuelta de OAuth, subida ajena, el dueño intentando generar con el vídeo de un colaborador): 404/403 y nada cambia. → Tareas 1, 5 y 8.

---

## Mapa de archivos

```
src/connectors/higgsfield/  port.ts oauth.ts mcp.ts adapter.ts fake.ts index.ts
src/server/higgsfield.ts              estado de la conexión, medios subidos, sonda
src/server/media/  ffmpeg.ts detect.ts
src/server/videos/ videos.ts upload.ts intake.ts manifest.ts prompt-check.ts analysis.ts
                   generations.ts frame.ts clip.ts costs.ts sweep.ts
src/server/agent.ts                   fichas del Mac, tareas con reserva y latido
src/llm/content.ts                    bloques de texto e imagen para la pasarela
src/jobs/video-jobs.ts                trabajos video.* y la tarea programada de cada minuto
src/lib/chunked-upload.ts             subida por trozos desde el navegador
src/app/(app)/ajustes/  src/app/(app)/productos/[id]/videos/[videoId]/
src/app/api/higgsfield/{estado,conectar,callback,desconectar,cliente,diagnostico}
src/app/api/productos/[id]/videos  src/app/api/videos/[videoId]/…  src/app/api/resultados/[resultId]/miniatura
src/app/api/agente/…  src/app/api/ajustes/{modelo-imagen,agente}
src/components/settings/  src/components/videos/
reglas/  adaptacion-de-conceptos.md imagen-nano-banana.md video-seedance.md (+ indice.json)
agente-mac/  agente.mjs lib.mjs README.md com.principal.agente.plist
railpack.json
tests/  helpers/{fake-higgsfield.ts,sample-video.ts}  fixtures/higgsfield/*.json  *.test.ts
docs/   2026-11-higgsfield-conexion.md  decisiones-produccion-de-video.md
```

## Contrato con Higgsfield (de los esquemas reales del MCP, leídos el 22/11/2026)

Solo `adapter.ts` conoce estos nombres. Los esquemas publican **entradas**, no la forma de las respuestas: los lectores de respuestas se escriben contra `tests/fixtures/higgsfield/*.json` marcados `"_origen": "supuesto"` y se sustituyen por capturas reales en las PUERTAS (Tareas 1 y 11).

| Método de `HiggsfieldPort` | Herramienta MCP | Argumentos exactos |
|---|---|---|
| `balance` | `balance` | `{}` |
| `uploadMedia` | `media_upload` → `PUT upload_url` → `media_confirm` | `{ files: [{ filename, content_type }], method: "upload_url" }`; después `{ media_ids: [id], type: "image" \| "video" }` |
| `quoteImages` | `estimate_image_cost` | `{ params: { model, prompt, aspect_ratio: "9:16", resolution: "2k", count, use_unlim: false, medias: [{ role: "image_references", value }] } }` |
| `quoteVideo` | `estimate_video_cost` | `{ params: { model: "seedance_2_5", mode: "omni_reference", prompt, aspect_ratio: "9:16", duration, resolution, generate_audio: false, bitrate_mode: "high", use_unlim: false, medias } }` |
| `submitImages` | `generate_image_batch` | `{ requests: [{ index: 0, params: { …, count: 1 } }, { index: 1, params: { … } }] }` |
| `submitVideo` | `generate_video_batch` | `{ requests: [{ index: 0, params: { …, count: 1 } }] }` |
| `jobs` | `jobs_wait` | `{ jobs: [{ index, job_id }], timeout_seconds }` (máx. 12 trabajos, máx. 15 s) |
| `history` | `show_generations` | `{ only_completed: false, type: "image" \| "video", size: 50 }` |

Modelos (de `models_explore`): `nano_banana_pro` (resolución `1k`/`2k`/`4k`, por defecto `2k`; papel `image_references`, máx. 14; admite `9:16`), `nano_banana_2_1` (por defecto `1k`: hay que mandar `2k`; máx. 14 imágenes), `seedance_2_5` (`duration` entero 4–30; `resolution` `480p`/`720p`/`1080p`/`4k`, por defecto `720p`; `generate_audio` por defecto `true`; papeles `start_image`, `end_image`, `image_references` (máx. 30 con las dos anteriores), `video_references` (máx. 10), `audio_references`). `medias[].value` es un `media_id` de una subida **o el `job_id` de una generación anterior**; nunca una URL.

---

### Task 1: Conexión de Higgsfield por persona y saldo

Sustituye a la Tarea 7 del plan 1a (la prueba técnica). Los pasos 1–6 no esperan a nadie; la PUERTA (pasos 7–8) necesita al dueño presente.

**Files:**
- Create: `src/connectors/higgsfield/{port.ts,oauth.ts,mcp.ts,adapter.ts,fake.ts,index.ts}`, `src/server/higgsfield.ts`
- Create: `src/app/api/higgsfield/{estado,conectar,callback,desconectar,cliente,diagnostico}/route.ts`, `src/app/(app)/ajustes/page.tsx`, `src/components/settings/{settings-view.tsx,higgsfield-card.tsx}`
- Create: `tests/helpers/fake-higgsfield.ts`, `tests/fixtures/higgsfield/balance.json`, `docs/decisiones-produccion-de-video.md`, `docs/2026-11-higgsfield-conexion.md`
- Modify: `package.json` (dependencia), `src/db/schema.ts` (`oauth_pending`, `higgsfield_probe_log`), `src/lib/cloud-env.ts`, `src/components/shell/app-shell.tsx` (entrada «Ajustes» para todos), `src/jobs/video-jobs.ts` (nuevo: tarea programada de la sonda), `src/worker/main.ts`, `tests/boundaries.test.ts`, `tests/cloud-env.test.ts`, `docs/despliegue-railway.md`
- Test: `tests/higgsfield-oauth.test.ts`, `tests/higgsfield-adapter.test.ts`, `tests/higgsfield-status.test.ts`

**Interfaces:**
- Consumes: `saveCredential`, `readCredential`, `credentialStatus`, `deleteCredential`, `encryptSecret`/`decryptSecret`, `getSetting`/`setSetting`, `publicOrigin(request)`, `handle`, `HttpError`, `isCloud`, `defineSchedule`.
- Produces:

```ts
// src/connectors/higgsfield/port.ts — sin importar el SDK
export const HIGGSFIELD_KIND = "higgsfield";
export interface HfBalance { credits: number; plan: string | null }
export interface HiggsfieldPort {
  balance(userId: number): Promise<HfBalance>;
  /** Respuestas en crudo de las herramientas gratuitas, para el informe. Sin secretos. */
  diagnostics(userId: number): Promise<Record<string, unknown>>;
}
export class HiggsfieldNotConnectedError extends Error {}  // "Conecta tu Higgsfield en Ajustes."
export class HiggsfieldAuthError extends Error {}          // "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes."
export class HiggsfieldUnavailableError extends Error {}   // "Higgsfield no responde. Inténtalo dentro de unos minutos."

// src/connectors/higgsfield/oauth.ts — con `fetch`, sin SDK
export const HIGGSFIELD_MCP_URL = "https://mcp.higgsfield.ai/mcp";
export const HIGGSFIELD_ISSUER = "https://higgsfield.ai/_clerk";
export const HIGGSFIELD_SCOPES = "openid email offline_access";
interface OAuthDeps { fetch?: typeof fetch; now?: () => Date }
export function startAuth(userId: number, origin: string, deps?: OAuthDeps): Promise<{ authorizeUrl: string }>;
export function completeAuth(userId: number, origin: string, params: { code: string; state: string }, deps?: OAuthDeps): Promise<void>;
/** Token de acceso vigente; lo refresca si caduca en menos de 60 s. Un refresco a la vez por persona. */
export function accessTokenFor(userId: number, deps?: OAuthDeps): Promise<string>;
/** Tras un 401 del servidor: fuerza un refresco. */
export function refreshNow(userId: number, deps?: OAuthDeps): Promise<string>;
export function disconnect(userId: number, deps?: OAuthDeps): Promise<void>;
/** Documento de metadatos de cliente (CIMD) que sirve `/api/higgsfield/cliente`. */
export function clientMetadata(origin: string): Record<string, unknown>;

// src/connectors/higgsfield/mcp.ts — ÚNICO archivo que importa @modelcontextprotocol/client
export interface McpCaller {
  /** `data`: `structuredContent` si viene; si no, el texto leído como JSON; si no, `null`. */
  callTool(name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string; data: unknown }>;
  listTools(): Promise<string[]>;
  close(): Promise<void>;
}
export class McpUnauthorizedError extends Error {}  // el servidor respondió 401
export function openMcp(accessToken: string): Promise<McpCaller>;

// src/connectors/higgsfield/adapter.ts
export function createHiggsfieldPort(deps?: { open?: (userId: number) => Promise<McpCaller>; refresh?: (userId: number) => Promise<void>; fetch?: typeof fetch }): HiggsfieldPort;

// src/connectors/higgsfield/fake.ts
export interface FakeHiggsfield {
  port: HiggsfieldPort;
  calls: Array<{ method: string; userId: number; args: unknown }>;
  state: { credits: number; plan: string | null };
  /** La próxima llamada a ese método lanza `error`. */
  failNext(method: keyof HiggsfieldPort, error: Error): void;
}
export function createFakeHiggsfield(initial?: Partial<FakeHiggsfield["state"]>): FakeHiggsfield; // por defecto 1 000 créditos, plan "plus"

// src/connectors/higgsfield/index.ts
/** El real; con `PRINCIPAL_HIGGSFIELD_FAKE=1` y fuera de la nube, uno simulado en memoria. */
export function getHiggsfield(): HiggsfieldPort;

// src/server/higgsfield.ts
export function higgsfieldStatus(user: AuthUser, deps?: { higgsfield?: HiggsfieldPort }): Promise<{
  connected: boolean; email: string | null; needsReconnect: boolean; expiresAt: string | null;
  credits: number | null; plan: string | null; error: string | null }>;
export function probeConnections(deps?: { higgsfield?: HiggsfieldPort }): Promise<void>; // una fila en higgsfield_probe_log por persona conectada
```

  - Secreto guardado: `{ accessToken, refreshToken }`. `meta`: `{ email, connectedAt, expiresAt, hasRefreshToken, scope, needsReconnect }` (`email` sale del `id_token`, solo para mostrar).
  - Tabla `oauth_pending`: `stateHash text pk`, `userId`, `verifierEnc`, `createdAt`, `expiresAt` (10 minutos). Un `state` vale una vez (`delete … returning`). Tabla `higgsfield_probe_log`: `at`, `userId`, `ok`, `refreshed`, `detail`.
  - Cliente registrado: `settings["higgsfield.oauthClient"] = { enc, redirectUri }` (`enc` cifrado con contexto `app:higgsfield-client`); se vuelve a registrar si cambia `redirectUri`.
  - Rutas: `GET /api/higgsfield/estado`; `POST /api/higgsfield/conectar` → `{ authorizeUrl }`; `GET /api/higgsfield/callback` → redirige a `/ajustes?higgsfield=conectado|error|cancelado`; `POST /api/higgsfield/desconectar`; `GET /api/higgsfield/cliente` (pública); `POST /api/higgsfield/diagnostico` (solo dueño).
  - `checkCloudEnv` añade el problema `"En la nube no se puede usar el Higgsfield simulado (PRINCIPAL_HIGGSFIELD_FAKE)."`.

- [ ] **Step 1: Instalar y leer.** `npm install --save-exact @modelcontextprotocol/client` (la línea 2.x; `@modelcontextprotocol/core` 2.4.0 ya está en el árbol por `shadcn`). Leer su README: cliente, transporte HTTP en flujo y cómo pasar una cabecera `Authorization` fija. Apuntar versión y nombres reales en `docs/decisiones-produccion-de-video.md`. Si el paquete 2.x no permite un token fijo por cabecera, usar `@modelcontextprotocol/sdk` 1.x y apuntarlo; el límite de `tests/boundaries.test.ts` cubre los dos (`/@modelcontextprotocol\//`).

- [ ] **Step 2: Write the failing tests**

```ts
// tests/higgsfield-oauth.test.ts — `fetch` simulado que sirve metadatos, alta de cliente y tokens
const ORIGIN = "https://x.up.railway.app";
it("conectar registra la web una sola vez y devuelve la dirección de permiso con PKCE", async () => {
  const url = new URL((await startAuth(ana.id, ORIGIN, { fetch })).authorizeUrl);
  expect(url.searchParams.get("scope")).toBe("openid email offline_access");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe("https://x.up.railway.app/api/higgsfield/callback");
  expect(url.searchParams.get("resource")).toBe("https://mcp.higgsfield.ai/mcp");
  await startAuth(luis.id, ORIGIN, { fetch });
  expect(requestsTo("https://higgsfield.ai/_clerk/oauth/register")).toHaveLength(1);
});
it("al volver guarda los permisos cifrados en la bóveda de esa persona y de nadie más", async () => {
  await completeAuth(ana.id, ORIGIN, { code: "c1", state: stateOf(ana) }, { fetch }); // responde hf-acc-1 / hf-ref-1
  expect(JSON.stringify((await getPool().query("select * from credentials")).rows)).not.toMatch(/hf-acc-1|hf-ref-1/);
  expect((await credentialStatus(ana.id, "higgsfield")).meta).toMatchObject({ email: "ana@hf.test", hasRefreshToken: true, needsReconnect: false });
  expect(await readCredential(luis.id, "higgsfield")).toBeNull();
});
it.each(["desconocido", "caducado (11 min)", "ya usado", "de otra persona"])("un state %s se rechaza y no guarda nada", async () => {
  await expect(completeAuth(luis.id, ORIGIN, { code: "c", state })).rejects.toThrow("La conexión ha caducado o no es válida. Vuelve a pulsar «Conectar».");
  expect((await credentialStatus(luis.id, "higgsfield")).connected).toBe(false);
});
it("refresca cuando faltan menos de 60 s y guarda el token de refresco nuevo", async () => { /* accessTokenFor → "hf-acc-2"; meta.expiresAt avanza */ });
it("dos peticiones a la vez refrescan una sola vez", async () => {
  expect(await Promise.all([accessTokenFor(ana.id, deps), accessTokenFor(ana.id, deps)])).toEqual(["hf-acc-2", "hf-acc-2"]);
  expect(refreshRequests()).toHaveLength(1);
});
it("si Higgsfield rechaza el refresco, la conexión queda para reconectar y no se insiste", async () => {
  await expect(accessTokenFor(ana.id, deps)).rejects.toBeInstanceOf(HiggsfieldAuthError); // invalid_grant
  expect((await credentialStatus(ana.id, "higgsfield")).meta.needsReconnect).toBe(true);
  await expect(accessTokenFor(ana.id, deps)).rejects.toBeInstanceOf(HiggsfieldAuthError);
  expect(refreshRequests()).toHaveLength(1);
});
it("sin conexión lanza HiggsfieldNotConnectedError", async () => {});

// tests/higgsfield-adapter.test.ts — McpCaller simulado
it("balance llama a la herramienta `balance` sin argumentos y devuelve créditos y plan", async () => {
  expect(await port.balance(ana.id)).toEqual({ credits: 1234, plan: "plus" }); // fixtures/higgsfield/balance.json
  expect(mcpCalls).toEqual([{ name: "balance", args: {} }]);
});
it("un 401 del servidor refresca una vez y repite la lectura; si vuelve a fallar, HiggsfieldAuthError", async () => {});
it("una respuesta que no se entiende lanza HiggsfieldUnavailableError: no inventa un saldo", async () => {});

// tests/higgsfield-status.test.ts
it("el estado nunca contiene los permisos y cada persona ve solo el suyo", async () => {
  expect(JSON.stringify(await higgsfieldStatus(ana, { higgsfield: fake.port }))).not.toMatch(/hf-acc|hf-ref/);
  expect(await higgsfieldStatus(luis, { higgsfield: fake.port })).toMatchObject({ connected: false, credits: null });
});
it("con Higgsfield caído el estado dice conectado y explica el error, sin créditos", async () => {});

// tests/boundaries.test.ts
it("solo src/connectors/higgsfield importa el SDK de MCP", () => { /* /@modelcontextprotocol\// fuera de esa carpeta → [] */ });
// tests/cloud-env.test.ts
expect(checkCloudEnv({ ...ok, PRINCIPAL_HIGGSFIELD_FAKE: "1" }).problems).toContain("En la nube no se puede usar el Higgsfield simulado (PRINCIPAL_HIGGSFIELD_FAKE).");
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/higgsfield-oauth.test.ts tests/higgsfield-adapter.test.ts tests/higgsfield-status.test.ts`
Expected: FAIL (`@/connectors/higgsfield/oauth` no existe).

- [ ] **Step 4: Implementar `oauth.ts`.** Metadatos del servidor de permisos: probar `https://higgsfield.ai/.well-known/oauth-authorization-server/_clerk`, luego `${ISSUER}/.well-known/oauth-authorization-server`, luego `${ISSUER}/.well-known/openid-configuration`; caché en memoria de 1 hora. Alta dinámica (`registration_endpoint`, hoy `https://higgsfield.ai/_clerk/oauth/register`) con `{ client_name: "PRINCIPAL", redirect_uris: [`${origin}/api/higgsfield/callback`], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope }`. Con `PRINCIPAL_HIGGSFIELD_CLIENT=cimd` no se registra: `client_id` es `${origin}/api/higgsfield/cliente`. `resource` va en la petición de permiso y en las de token. El refresco va dentro de `pg_advisory_xact_lock(0x48494747 /* "HIGG" */, userId)` y vuelve a leer la credencial tras tomar el cerrojo. `invalid_grant` → `needsReconnect: true` y `HiggsfieldAuthError`; con `needsReconnect` ya puesto no se llama a la red.

- [ ] **Step 5: Implementar `mcp.ts`, `adapter.ts`, `fake.ts`, `index.ts`, `src/server/higgsfield.ts` y las rutas.** `adapter.ts` abre un cliente por llamada con `accessTokenFor`, lo cierra siempre y, ante `McpUnauthorizedError`, refresca y repite **una** vez. `diagnostics` devuelve `{ tools: listTools(), balance, estimate_image_cost, estimate_video_cost, show_generations }` en crudo (las cuatro son gratuitas; los presupuestos con `nano_banana_pro` `2k` `count: 2` y `seedance_2_5` `480p` 10 s, sin medios). `src/jobs/video-jobs.ts` define `defineSchedule("higgsfield.sonda", "0 */6 * * *", probeConnections)` y `src/worker/main.ts` lo importa antes de arrancar la cola.

- [ ] **Step 6: Pantalla Ajustes** (skills `impeccable` y `shadcn`). Tarjeta **Higgsfield**: sin conexión, «Conecta tu cuenta de Higgsfield para generar imágenes y vídeos con tus créditos.» y botón **Conectar Higgsfield**; conectada, «Conectado como ana@…», «1.234 créditos · plan Plus», «Actualizar» y «Desconectar» (con confirmación); con `needsReconnect`, aviso ámbar «Tu conexión ha caducado» y **Volver a conectar**. Para el dueño, **Diagnóstico**: botón que muestra el JSON en un cuadro con «Copiar». Con `PRINCIPAL_HIGGSFIELD_FAKE=1` en local, comprobar con Playwright a 390 px los tres estados.

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS.

```bash
git add -A
git commit -m "Higgsfield por persona: conexión con permiso propio, refresco seguro, saldo y pantalla Ajustes"
```

- [ ] **Step 7: PUERTA — con el dueño presente, en la web publicada** (el coordinador fusiona a `main` y espera el despliegue). (a) Ajustes → Conectar Higgsfield → autorizar → debe verse «Conectado como…» y los créditos. Si el alta o el permiso fallan, copiar el error literal: es el hallazgo principal. (b) Pulsar Diagnóstico, copiar y enviar el texto. (c) Si hay tiempo: desconectar; el coordinador pone `PRINCIPAL_HIGGSFIELD_CLIENT=cimd` con la CLI de Railway; repetir (a) para saber si el alta que sobrevive al 31/12/2026 funciona.

- [ ] **Step 8: Escribir `docs/2026-11-higgsfield-conexion.md` y fijar las respuestas reales.** Contenido: si una aplicación propia puede conectar **y llamar herramientas**; alta dinámica frente a CIMD; permisos concedidos; `expires_in` declarado; si hay token de refresco y si refrescar funciona; duración observada (`higgsfield_probe_log`; se completa a los 7 días); lista de herramientas visibles; forma real de `balance`, de los dos presupuestos y de `show_generations` (¿trae `params.prompt`?). Sustituir `tests/fixtures/higgsfield/*.json` por las capturas (`"_origen": "real 2026-…"`) y ajustar los lectores del adaptador.

```bash
git add -A
git commit -m "Informe de la conexión de Higgsfield y respuestas reales de sus herramientas"
```

---

### Task 2: Papeles de las fotos del producto

**Files:**
- Modify: `src/db/schema.ts` (`product_photos.role`), `src/server/photos.ts`, `src/app/api/productos/[id]/fotos/route.ts`, `src/app/api/fotos/[photoId]/route.ts` (`PATCH`), `src/components/products/{photo-uploader.tsx,labels.ts}`
- Test: `tests/photos.test.ts`

**Interfaces:**
- Consumes: `getProductFor`, lo que ya exporta `photos.ts`.
- Produces:

```ts
export const PHOTO_ROLES = ["articulo", "embalaje", "avatar", "entorno", "otro"] as const;
export type PhotoRole = (typeof PHOTO_ROLES)[number];
export const MAX_PHOTOS_PER_PRODUCT = 12; // antes 6
export interface PhotoInfo { id: number; mime: string; size: number; role: PhotoRole }
export function addProductPhoto(user: AuthUser, productId: number, bytes: Buffer, role?: PhotoRole): Promise<PhotoInfo>; // por defecto "articulo"
export function setPhotoRole(user: AuthUser, photoId: number, role: PhotoRole): Promise<PhotoInfo>;
// labels.ts
export const PHOTO_ROLE_LABELS: Record<PhotoRole, string> = { articulo: "Artículo", embalaje: "Embalaje", avatar: "Avatar", entorno: "Entorno", otro: "Otra" };
```

  - Columna `role text not null default 'articulo'` (las fotos existentes quedan como artículo). `POST …/fotos` acepta el campo `papel`; `PATCH /api/fotos/[photoId]` recibe `{ role }`. `coverPhotoIds` prefiere la primera foto con papel `articulo`.

- [ ] **Step 1: Write the failing tests**

```ts
it("una foto nueva es «artículo» si no se dice otra cosa, y se puede subir ya con su papel", async () => {
  expect((await addProductPhoto(ana, p.id, JPEG)).role).toBe("articulo");
  expect((await addProductPhoto(ana, p.id, JPEG, "avatar")).role).toBe("avatar");
});
it("un papel desconocido se rechaza", async () => { /* 400 "Papel de foto no válido." */ });
it("cambiar el papel de la foto de un producto ajeno da el mismo 404 que si no existiera", async () => { /* "Foto no encontrada." */ });
it("un producto admite 12 fotos y la 13.ª se rechaza", async () => { /* 400 "Este producto ya tiene 12 fotos." */ });
it("la portada es la primera foto de artículo, no el avatar", async () => {});
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/photos.test.ts` → FAIL (`role` no existe).

- [ ] **Step 3: Implementar, generar migración (`npm run db:generate`) y adaptar la pantalla** (skills `impeccable` y `shadcn`). Cada foto muestra su papel y un selector para cambiarlo; al añadir fotos se elige el papel antes. Texto de ayuda: «Avatar: la persona que saldrá en los vídeos. Entorno: una foto del sitio o del estilo que quieres. Añade una foto del artículo en una mano: así sale a su tamaño real.» El texto de límite pasa a «hasta 8 MB cada una y 12 como máximo». Comprobar a 390 px.

- [ ] **Step 4: Run tests and commit**

Run: `npm test && npm run typecheck && npm run build` → PASS.

```bash
git add -A
git commit -m "Fotos del producto con papel: artículo, embalaje, avatar, entorno u otra"
```

---

### Task 3: Reglas de producción (adaptación, imagen y vídeo)

**Files:**
- Create: `reglas/adaptacion-de-conceptos.md`, `reglas/imagen-nano-banana.md`, `reglas/video-seedance.md`
- Modify: `reglas/indice.json`, `src/server/rules.ts`, `tests/rules-source.test.ts`, `docs/decisiones-produccion-de-video.md`
- Test: `tests/rules-source.test.ts`, `tests/rules.test.ts`

**Interfaces:**
- Consumes: `seedRules`, `loadRules`.
- Produces: `RULE_SLUGS` gana `adaptacion: "adaptacion-de-conceptos"`, `imagen: "imagen-nano-banana"`, `video: "video-seedance"`; `export const VIDEO_RULE_SLUGS = [RULE_SLUGS.adaptacion, RULE_SLUGS.imagen, RULE_SLUGS.video]`. Cada entrada nueva de `indice.json` lleva `source` (el original principal) y `sources: string[]` (todos los originales usados).

Originales (solo lectura), por regla:
- **adaptacion-de-conceptos**: `docs/reglas-origen/skills-codex/adaptacion-de-conceptos/SKILL.md` y sus `references/ejemplos-reales.md` e `idea-a-prompt.md` (como secciones del mismo documento); de `skills-codex/generacion-de-videos-por-idea/SKILL.md`, los párrafos de situación filmable, secuencia y fila por toma.
- **imagen-nano-banana**: `skills-codex/nanobanana-pro-imagenes/SKILL.md` con sus `references/` (criterio de realismo, los cuatro ejemplos validados íntegros), `cerebro/reglas/como-se-hace-una-imagen-que-vale.md` (prosa de unos 4.900 caracteres, negativos en positivo, lista negra), `cerebro/reglas/no-adelantar-el-reveal.md` y la regla de identidad de `raiz/AGENTS.md` («la identidad y las facciones proceden exclusivamente del avatar elegido»).
- **video-seedance**: `reglas-edicion-t7/SEEDANCE_ESCALA_MANO_20261105.md`, `reglas-edicion-t7/SIN_OVERLAYS_GENERADOS.md`, `cerebro/reglas/seedance-largo-referencia-contextual.md` (imagen como primer fotograma en clips simples y como referencia contextual en vídeos de varias escenas), `cerebro/reglas/calidad-de-video.md`, las líneas de Seedance de `raiz/AGENTS.md`, y la plantilla comprobada de `docs/research_notes/Superpoderes marketing y vídeo/seedance_fidelidad_y_superpoderes_video.md` (apartados A3–A7 y la plantilla T1).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/rules-source.test.ts
it("el índice lista las seis reglas y todos sus originales existen", () => {
  expect(indice.map((e) => e.slug)).toEqual(["angulos-de-venta", "angulos-ejemplos", "angulos-metodo-juanma", "adaptacion-de-conceptos", "imagen-nano-banana", "video-seedance"]);
  /* cada `source` y cada elemento de `sources` existe y empieza por docs/ */
});
it("no queda nada del sistema anterior en ninguna regla", () => {
  /* por archivo: */ expect(text(file), file).not.toMatch(
    /\/Volumes\/|\/Users\/|EDITOR\/|\.py\b|\.codex|memory\/context|fondos-pinterest-por-toma|generacion-de-videos-por-idea|nanobanana-pro-imagenes|\bCodex\b|\bSEGA\b|Sentinel_|^---\nname:|\]\(references\/|\[\[/m);
});
it("conservan el criterio del dueño", () => {
  expect(adaptacion).toContain("tiempo/función original → visual observado → equivalente para el producto elegido → acción física → resultado visible");
  expect(adaptacion).toContain("si ocultamos el texto, ¿se entiende el mismo concepto con este otro producto?");
  expect(imagen).toContain("4.900");
  for (const word of ["cinematic", "studio lighting", "golden hour", "bokeh", "8K", "flawless skin"]) expect(imagen).toContain(word);
  expect(imagen).toContain("exclusivamente el avatar elegido");
  expect(imagen).toContain("No anticipar un reveal");
  expect(video).toContain("comparado con una mano humana");
  expect(video).toContain("`@Video1` define solo el orden de los planos, el ritmo de los cortes, la cámara y el tipo de acción.");
  expect(video).toContain("Movimientos parecidos, no idénticos.");
  expect(video).toContain("Sin texto en pantalla");
});
// tests/rules.test.ts
it("loadRules(VIDEO_RULE_SLUGS) devuelve las tres reglas sembradas en versión 1", async () => {});
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/rules-source.test.ts tests/rules.test.ts` → FAIL (faltan los archivos).

- [ ] **Step 3: Escribir las tres reglas** con el mismo criterio de limpieza que `reglas/angulos-de-venta.md` (ver «Tarea 9» en `docs/decisiones-base-plataforma.md`): fuera cabeceras de skill, rutas del Mac, órdenes a herramientas o colas del sistema anterior, recibos y hashes, y llamadas a otras skills; **intactos** el razonamiento, los ejemplos y las correcciones fechadas del dueño. Sin nota de origen en el texto (va en `indice.json`). Donde el original dice «leer la skill X», decir «aplicar también la regla «…», que se entrega junto a esta». Donde manda guardar o subir algo, decir qué entrega la aplicación (ficha, fotos con su papel, fotogramas de la referencia). `video-seedance.md` termina con la plantilla del prompt (bloques Referencias / Resumen / Planos / Mantener) con las tres frases exactas de la prueba. Apuntar en `docs/decisiones-produccion-de-video.md` qué se quitó y qué se reformuló, frase por frase.

- [ ] **Step 4: Run tests and commit**

Run: `npm test && npm run typecheck` → PASS.

```bash
git add -A
git commit -m "Reglas de producción: adaptación de conceptos, imagen con Nano Banana y vídeo con Seedance"
```

---

### Task 4: Herramientas de vídeo con ffmpeg

**Files:**
- Create: `src/server/media/ffmpeg.ts`, `src/server/media/detect.ts`, `railpack.json`, `tests/helpers/sample-video.ts`
- Modify: `.github/workflows/pruebas.yml` (paso `sudo apt-get update && sudo apt-get install -y ffmpeg` antes de las pruebas), `scripts/cloud.ts` (aviso al arrancar), `docs/despliegue-railway.md`, `tests/boundaries.test.ts`
- Test: `tests/media-detect.test.ts`, `tests/media-ffmpeg.test.ts`

**Interfaces:**
- Consumes: nada del proyecto.
- Produces:

```ts
// src/server/media/detect.ts
export type VideoMime = "video/mp4" | "video/quicktime" | "video/webm";
/** Por los primeros bytes: `ftyp` con marca de vídeo (no `heic`, `heix`, `mif1`, `avif`) o cabecera EBML. */
export function detectVideoType(head: Buffer): VideoMime | null;

// src/server/media/ffmpeg.ts — `spawn` con lista de argumentos (nunca shell), tope de 120 s por proceso
export const MAX_FRAMES = 24;
export const FRAME_MAX_SIDE = 768;
export const MAX_SEGMENT_MS = 30_000;
export const MIN_REFERENCE_MS = 2_000;
export function ffmpegAvailable(): Promise<boolean>;
export function probeVideo(path: string): Promise<{ durationMs: number; width: number; height: number }>; // lanza "No hemos podido leer este vídeo."
/** count = clamp(ceil(durationMs / 500), 2, 24); tiempos = round(i * durationMs / count). */
export function frameTimesMs(durationMs: number): number[];
export function extractFrames(path: string, timesMs: number[]): Promise<Array<{ timeMs: number; jpeg: Buffer }>>;
export function detectCuts(path: string): Promise<number[]>; // ms; filtro de escena con umbral 0.35
/** MP4 H.264, sin audio, lado largo ≤ 1280, 30 fps, desde 0 y `durationMs` como mucho. */
export function normalizeClip(path: string, outPath: string, durationMs: number): Promise<void>;
export function makeThumbnail(input: Buffer, kind: "image" | "video", maxSide?: number): Promise<Buffer>; // JPEG; por defecto 540
// tests/helpers/sample-video.ts
export function makeSampleVideo(dir: string, opts?: { seconds?: number }): Promise<string>; // 360×640, 30 fps, tres colores (cortes en 1/3 y 2/3), con audio
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/media-detect.test.ts
expect(detectVideoType(mp4Head)).toBe("video/mp4");       // ....ftypisom
expect(detectVideoType(movHead)).toBe("video/quicktime"); // ....ftypqt
expect(detectVideoType(webmHead)).toBe("video/webm");     // 1A 45 DF A3
for (const head of [jpegHead, pdfHead, heicHead /* ....ftypheic */, Buffer.alloc(0)]) expect(detectVideoType(head)).toBeNull();

// tests/media-ffmpeg.test.ts
expect(frameTimesMs(10_000)).toHaveLength(20);
expect(frameTimesMs(10_000).slice(0, 3)).toEqual([0, 500, 1000]);
expect(frameTimesMs(30_000)).toHaveLength(24);
expect(frameTimesMs(30_000)[1]).toBe(1250);
expect(frameTimesMs(3_000)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
expect(frameTimesMs(800)).toEqual([0, 400]);
it("ffmpeg está disponible en el entorno de pruebas", async () => { expect(await ffmpegAvailable()).toBe(true); });
it("lee duración y tamaño", async () => { /* muestra de 6 s: durationMs 6000 ± 100, 360 × 640 */ });
it("saca un JPEG pequeño por cada tiempo pedido", async () => { /* 12 fotogramas, empiezan por FF D8 FF, lado largo ≤ 768, < 150 KB cada uno */ });
it("encuentra los cortes", async () => { /* dos, a 2000 ± 200 y 4000 ± 200 */ });
it("el recorte normalizado no tiene audio, dura lo pedido y no pasa de 1280 px", async () => { /* normalizeClip(…, 3000) → 3000 ± 100 */ });
it("hace miniaturas de imagen y de vídeo", async () => { /* JPEG, lado largo 540 */ });
it("un archivo que no es vídeo da un error claro", async () => { /* rejects "No hemos podido leer este vídeo." */ });
it("dentro de src, solo src/server/media lanza procesos", () => { /* boundaries: node:child_process */ });
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/media-detect.test.ts tests/media-ffmpeg.test.ts` → FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `detect.ts` y `ffmpeg.ts`.** Los JPEG de fotograma con calidad `-q:v 5`. `stderr` se guarda recortado (2 000 caracteres) para el registro del servidor, nunca para la persona.

- [ ] **Step 4: ffmpeg en Railway — por verificar.** En el repositorio no hay configuración de construcción (ni `railpack.json` ni `nixpacks.toml`): Railway elige el constructor. Crear `railpack.json` con `{ "$schema": "https://schema.railpack.com", "deploy": { "aptPackages": ["ffmpeg"] } }`. `scripts/cloud.ts` avisa `[nube] Aviso: falta ffmpeg: no se podrán procesar vídeos de referencia.` si `ffmpegAvailable()` es falso. Tras el primer despliegue el coordinador mira el registro: si sale el aviso, pone con la CLI de Railway la variable `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg` o, si el servicio usa el constructor antiguo (Nixpacks), `NIXPACKS_APT_PKGS=ffmpeg`, y vuelve a desplegar. Apuntar en `docs/despliegue-railway.md` (sección «Vídeos (ffmpeg)», marcada «por verificar» hasta entonces) cuál hizo falta y añadir la fila del aviso a «Si algo falla». El dueño no tiene que hacer nada.

- [ ] **Step 5: Run tests and commit**

Run: `npm test && npm run typecheck && npm run lint` → PASS.

```bash
git add -A
git commit -m "Herramientas de vídeo: tipo por contenido, fotogramas, cortes, recorte y miniaturas con ffmpeg"
```

---

### Task 5: Vídeos — datos, acceso y subida de la referencia

**Files:**
- Create: `src/server/videos/{videos.ts,upload.ts,intake.ts,sweep.ts}`
- Create: `src/app/api/productos/[id]/videos/route.ts`, `src/app/api/videos/[videoId]/route.ts`, `src/app/api/videos/[videoId]/referencia/subida/route.ts`, `src/app/api/videos/[videoId]/referencia/subida/[uploadId]/route.ts`, `src/app/api/videos/[videoId]/fotogramas/[index]/route.ts`, `tests/fixtures/higgsfield/{media_upload,media_confirm}.json`
- Modify: `src/db/schema.ts` (`videos`, `video_frames`, `upload_sessions`, `higgsfield_media`), `src/connectors/higgsfield/{port.ts,adapter.ts,fake.ts}`, `src/server/higgsfield.ts`, `src/jobs/video-jobs.ts`, `tests/boundaries.test.ts`
- Test: `tests/videos.test.ts`, `tests/video-upload.test.ts`, `tests/video-intake.test.ts`, `tests/higgsfield-adapter.test.ts`

**Interfaces:**
- Consumes: `getProductFor`, `listProductPhotos`, `PhotoRole`, `getActiveUser`, `runStep`, `stepKey`, `StepFailedError`, `defineJob`, `defineSchedule`, `enqueueJob`, `credentialStatus`, y de la Tarea 4 `detectVideoType`, `probeVideo`, `frameTimesMs`, `extractFrames`, `detectCuts`, `normalizeClip`, `MAX_SEGMENT_MS`, `MIN_REFERENCE_MS`.
- Produces:

```ts
// port.ts
export interface HfMediaFile { bytes: Buffer; filename: string; contentType: string; type: "image" | "video" }
// HiggsfieldPort gana:
uploadMedia(userId: number, file: HfMediaFile): Promise<{ mediaId: string }>;
// src/server/higgsfield.ts — no sube dos veces el mismo archivo de la misma persona (tabla higgsfield_media: userId, sha256, type, mediaId; único userId+sha256)
export function ensureMedia(userId: number, file: HfMediaFile, deps?: { higgsfield?: HiggsfieldPort }): Promise<string>;

// src/server/videos/videos.ts
export type Video = typeof schema.videos.$inferSelect;
export const MAX_REFERENCE_BYTES = 100 * 1024 * 1024;
export function createVideo(user: AuthUser, productId: number): Promise<Video>;         // título "Vídeo N"
export function listVideosFor(user: AuthUser, productId: number): Promise<Array<{ id: number; title: string; createdBy: number; referenceStatus: string; createdAt: Date; mine: boolean }>>;
export function getVideoFor(user: AuthUser, videoId: number): Promise<Video>;            // 404 "Vídeo no encontrado."
export function requireVideoOwner(user: AuthUser, video: Video): void;                    // 403 "Solo quien creó este vídeo puede continuarlo: se paga con su Higgsfield."
export function updateVideoChoices(user: AuthUser, videoId: number, input: { title?: string; avatarPhotoId?: number | null; environmentPhotoId?: number | null; noPerson?: boolean }): Promise<Video>;
export function readVideoFrame(user: AuthUser, videoId: number, index: number): Promise<{ mime: string; data: Buffer }>;
export interface VideoView { video: Video; mine: boolean; frames: Array<{ index: number; timeMs: number }> }
export function videoView(user: AuthUser, videoId: number): Promise<VideoView>;

// src/server/videos/upload.ts
export const CHUNK_BYTES = 5 * 1024 * 1024;
export type UploadActor = { userId: number } | { agentTaskId: number };
export function startUpload(user: AuthUser, videoId: number, input: { filename: string; totalBytes: number }, deps?: { higgsfield?: HiggsfieldPort }): Promise<{ uploadId: string; chunkBytes: number }>;
export function appendChunk(uploadId: string, index: number, bytes: Buffer, actor: UploadActor): Promise<{ received: number }>;
export function uploadProgress(uploadId: string, actor: UploadActor): Promise<{ received: number; totalChunks: number }>;
export function finishUpload(uploadId: string, actor: UploadActor): Promise<void>;     // encola "video.referencia"
export function uploadPath(uploadId: string): string;                                  // os.tmpdir()/principal-subidas/<uploadId>
export function cleanStaleUploads(now?: Date): Promise<number>;                        // sesiones de más de 24 h y sus archivos

// src/server/videos/intake.ts
export function processReference(videoId: number, uploadId: string, deps?: { higgsfield?: HiggsfieldPort }): Promise<void>;
// src/server/videos/sweep.ts
export function videoSweep(now?: Date): Promise<void>; // cada parte en su try/catch; aquí: cleanStaleUploads y referencias atascadas en "processing" más de 60 minutos
```

  - Tabla `videos`: `id`, `productId` (clave ajena con borrado en cascada), `createdBy`, `title`, `referenceStatus` (`"none"` | `"uploading"` | `"processing"` | `"ready"` | `"failed"`), `referenceError`, `referenceSource` (`"file"` | `"link"`), `referenceUrl`, `referenceDurationMs`, `referenceWidth`, `referenceHeight`, `referenceMediaId`, `segmentDurationMs`, `cutsMs jsonb`, `avatarPhotoId`, `environmentPhotoId`, `noPerson boolean default false`, `createdAt`, `updatedAt`. `video_frames`: `videoId` (cascada), `index`, `timeMs`, `mime`, `size`, `data bytea`; único (`videoId`, `index`). `upload_sessions`: `id text pk` (aleatorio), `videoId`, `userId`, `agentTaskId`, `filename`, `totalBytes`, `received`, `mime`, `createdAt`.
  - Rutas: `GET/POST /api/productos/[id]/videos`; `GET/PUT /api/videos/[videoId]`; `POST …/referencia/subida` `{ filename, totalBytes }`; `GET …/subida/[uploadId]` (progreso); `PUT …/subida/[uploadId]?indice=N` (cuerpo = bytes del trozo; `Content-Length` mayor que `CHUNK_BYTES + 1024` → 413 sin leer); `POST …/subida/[uploadId]` (terminar); `GET …/fotogramas/[index]`.
  - El simulado gana `uploadMedia`, que devuelve `media-1`, `media-2`… en orden.
  - Trabajo `video.referencia` con datos `{ videoId, uploadId }`; tarea programada `video.seguimiento` cada minuto (`"* * * * *"`) → `videoSweep`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/videos.test.ts
it("un vídeo de un producto que no tienes da el mismo 404 que uno que no existe", async () => {
  for (const id of [videoDeAna.id, 999_999, Number.NaN])
    await expect(getVideoFor(luis, id)).rejects.toMatchObject({ status: 404, message: "Vídeo no encontrado." });
});
it("el dueño ve el vídeo de un colaborador pero no puede continuarlo", async () => {
  expect((await videoView(dueno, videoDeAna.id)).mine).toBe(false);
  expect(() => requireVideoOwner(dueno, videoDeAna)).toThrow("Solo quien creó este vídeo puede continuarlo: se paga con su Higgsfield.");
});
it("al quitarle el producto, Ana deja de ver sus vídeos", async () => { /* setAssignments(dueno, ana.id, []) → 404 */ });
it("el avatar tiene que ser una foto de ese producto con papel avatar", async () => { /* 400 "Elige una foto con papel «Avatar» de este producto." */ });
it("solo las tablas de vídeo se tocan desde src/server/videos", () => { /* boundaries: schema.videos|videoFrames|uploadSessions */ });

// tests/video-upload.test.ts
it("rechaza de entrada más de 100 MB", async () => {
  await expect(startUpload(ana, v.id, { filename: "a.mp4", totalBytes: 100 * 1024 * 1024 + 1 }, deps)).rejects.toMatchObject({ status: 400, message: "El vídeo pesa demasiado (máximo 100 MB)." });
});
it("sin Higgsfield conectado no deja empezar", async () => { /* 409 "Conecta primero tu Higgsfield en Ajustes." */ });
it("el formato lo decide el contenido del primer trozo, no el nombre", async () => {
  await expect(appendChunk(id, 0, PDF_BYTES, { userId: ana.id })).rejects.toMatchObject({ status: 400, message: "Formato de vídeo no admitido. Usa MP4, MOV o WebM." });
  expect(fs.existsSync(uploadPath(id))).toBe(false);
});
it("un trozo repetido (se perdió la respuesta) no se guarda dos veces", async () => {
  expect(await appendChunk(id, 0, CHUNK, actor)).toEqual({ received: 1 });
  expect(await appendChunk(id, 0, CHUNK, actor)).toEqual({ received: 1 });
  expect(fs.statSync(uploadPath(id)).size).toBe(CHUNK.length);
});
it("un trozo adelantado se rechaza y el progreso dice desde dónde seguir", async () => { /* índice 2 con 1 recibido → 409 "Faltan trozos anteriores."; uploadProgress → { received: 1, totalChunks: 3 } */ });
it("si el servidor se reinició y el archivo ya no está, lo dice claro", async () => { /* borrar el archivo → 410 "La subida se ha interrumpido. Vuelve a elegir el vídeo." */ });
it("terminar con menos bytes de los anunciados no se acepta", async () => { /* 400 "El vídeo no ha llegado entero. Inténtalo de nuevo." */ });
it("otra persona no puede añadir trozos a la subida de Ana", async () => { /* actor { userId: luis.id } → 404 "Subida no encontrada." */ });

// tests/video-intake.test.ts — ffmpeg real con la muestra; Higgsfield simulado
it("procesa la referencia y no se queda con el vídeo", async () => {
  await processReference(v.id, uploadId, { higgsfield: fake.port });
  const video = await getVideoFor(ana, v.id);
  expect(video).toMatchObject({ referenceStatus: "ready", referenceMediaId: "media-1", referenceWidth: 360, referenceHeight: 640 });
  expect((await videoView(ana, v.id)).frames).toHaveLength(12);              // muestra de 6 s
  expect(video.cutsMs).toHaveLength(2);
  expect(fake.calls.filter((c) => c.method === "uploadMedia")).toMatchObject([{ userId: ana.id, args: { type: "video", contentType: "video/mp4" } }]);
  expect(fs.existsSync(uploadPath(uploadId))).toBe(false);
});
it("de una referencia de más de 30 s solo se usan los primeros 30", async () => { /* muestra de 34 s → segmentDurationMs 30_000; el archivo subido dura ≤ 30,1 s; 24 fotogramas */ });
it("menos de 2 s no sirve", async () => { /* failed, "El vídeo de referencia es demasiado corto (mínimo 2 segundos)." */ });
it("si el permiso de Higgsfield ha caducado, queda en error con el aviso y sin archivo temporal", async () => {
  /* failNext("uploadMedia", new HiggsfieldAuthError()) → referenceStatus "failed", referenceError "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes." */
});
it("si el archivo temporal ya no está (el servidor se reinició), queda en error y pide subirlo otra vez", async () => { /* failed, "La subida se ha interrumpido. Vuelve a elegir el vídeo." */ });
it("una referencia que lleva más de una hora «preparándose» queda en error", async () => { /* videoSweep → failed, "No se pudo preparar el vídeo. Vuelve a subirlo." */ });
it("ensureMedia sube una vez por persona y archivo", async () => { /* dos llamadas de Ana → 1 subida; una de Luis → otra */ });

// tests/higgsfield-adapter.test.ts
it("uploadMedia pide la dirección, sube con PUT y confirma", async () => {
  expect(mcpCalls).toEqual([
    { name: "media_upload", args: { files: [{ filename: "ref.mp4", content_type: "video/mp4" }], method: "upload_url" } },
    { name: "media_confirm", args: { media_ids: ["m1"], type: "video" } },
  ]);
  expect(putRequests).toMatchObject([{ url: "https://upload.test/m1", method: "PUT", bytes: 5 }]);
});
it("si el PUT no devuelve 200 no se confirma y lanza HiggsfieldUnavailableError", async () => {});
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/videos.test.ts tests/video-upload.test.ts tests/video-intake.test.ts` → FAIL (`@/server/videos/videos` no existe).

- [ ] **Step 3: Implementar `videos.ts` y `upload.ts`.** `appendChunk` comprueba y escribe dentro de una transacción con la fila de la sesión bloqueada (`for update`): índice igual a `received` → añade al archivo e incrementa; menor → responde sin escribir; mayor → 409. Orden de comprobaciones al empezar: vídeo visible y propio, tamaño, Higgsfield conectado y sin `needsReconnect`. Leer en `node_modules/next/dist/docs/` cómo recibe un route handler un cuerpo binario grande.

- [ ] **Step 4: Implementar `intake.ts`, `sweep.ts` y los trabajos.** `processReference` corre dentro de `runStep(ctx, stepKey(ctx, "referencia", { videoId, uploadId }), …)` con `ctx = { jobName: "video.referencia", userId: video.createdBy, productId: video.productId }`. Orden: `probeVideo` → duración mínima → `segmentDurationMs = min(durationMs, MAX_SEGMENT_MS)` → `extractFrames(frameTimesMs(segmentDurationMs))` → `detectCuts` (los que caen dentro del tramo) → `normalizeClip` → `uploadMedia` (hasta 3 intentos separados 5 s solo ante `HiggsfieldUnavailableError`) → guardar todo en una transacción → `ready`. Cualquier fallo: `referenceStatus: "failed"` con mensaje en español y `StepFailedError` (no se reintenta: el archivo ya no está). Los archivos temporales se borran siempre (`finally`). Generar migración.

- [ ] **Step 5: Run tests and commit**

Run: `npm test && npm run typecheck && npm run lint` → PASS.

```bash
git add -A
git commit -m "Vídeos por producto: acceso, subida de la referencia por trozos y procesado sin guardar el vídeo"
```

---

### Task 6: Desglose con Claude (visión) y comprobación de prompts

**Files:**
- Create: `src/llm/content.ts`, `src/server/videos/{manifest.ts,prompt-check.ts,analysis.ts}`, `src/app/api/videos/[videoId]/desglose/route.ts`
- Modify: `src/db/schema.ts` (`video_analyses`; `videos.imagePrompt`, `videos.videoPrompt`, `videos.frameUse` con valor inicial `start_image`), `src/server/spend.ts` (`costOfEntries`), `src/server/videos/{videos.ts,sweep.ts}`, `src/app/api/videos/[videoId]/route.ts`, `src/jobs/video-jobs.ts`
- Test: `tests/llm-content.test.ts`, `tests/video-manifest.test.ts`, `tests/prompt-check.test.ts`, `tests/video-analysis.test.ts`

**Interfaces:**
- Consumes: `LlmGateway`, `LlmCall`, `getGateway`, errores `Llm*`, `loadRules`, `VIDEO_RULE_SLUGS`, `runStep`, `stepKey`, `JobPausedError`, `makeThumbnail`, `readProductPhoto`, `listProductPhotos`, `getVideoFor`, `requireVideoOwner`.
- Produces:

```ts
// src/llm/content.ts — para construir `LlmCall.content` sin importar el SDK fuera de src/llm
export type LlmContent = LlmCall<unknown>["content"];
export function textPart(text: string): Exclude<LlmContent, string>[number];
export function imagePart(bytes: Buffer, mime: "image/jpeg" | "image/png" | "image/webp"): Exclude<LlmContent, string>[number]; // base64

// src/server/videos/manifest.ts — el orden de las referencias lo decide el código, no el modelo
export type FrameUse = "start_image" | "contextual_reference";
export const MAX_ARTICLE_REFS = 4;
export const MAX_PACKAGING_REFS = 2;
/** Si `start_image` cuenta como @Image1 al numerar. Supuesto; se confirma en la PUERTA de la Tarea 11. */
export const START_IMAGE_IS_IMAGE1 = true;
export interface ManifestItem {
  index: number;                 // empieza en 1
  tag: string;                   // imagen: "image 1"…; clip: "@Video1", "@Image1"…
  source: { kind: "reference_frame" } | { kind: "reference_video" } | { kind: "approved_frame" } | { kind: "photo"; photoId: number };
  role: "composicion" | "video_referencia" | "imagen_aprobada" | PhotoRole;
}
/** 1 = primer fotograma de la referencia (composición); después avatar (si hay), artículo (≤ 4), embalaje (≤ 2), entorno (si hay). */
export function imageManifest(video: Video, photos: PhotoInfo[]): ManifestItem[];
/** @Video1 = referencia; @Image1 = imagen aprobada; después avatar (si hay), artículo (≤ 4), embalaje (≤ 2). */
export function clipManifest(video: Video, photos: PhotoInfo[]): ManifestItem[];

// src/server/videos/prompt-check.ts
export const PROMPT_BLACKLIST = ["cinematic", "studio lighting", "softbox", "golden hour", "color grading", "moody", "dramatic lighting", "professional photograph", "editorial", "hyperrealistic", "8K", "masterpiece", "octane render", "subsurface scattering", "bokeh", "shallow depth of field", "flawless skin", "dewy", "airbrushed", "glowing skin"] as const;
export interface PromptIssue { level: "error" | "aviso"; message: string }
export function checkImagePrompt(prompt: string, manifest: ManifestItem[]): PromptIssue[];
export function checkVideoPrompt(prompt: string, manifest: ManifestItem[]): PromptIssue[];

// src/server/videos/analysis.ts
export interface Analysis {
  conceptLogic: string;                                                    // una frase
  shots: Array<{ startS: number; endS: number; seen: string; action: string; onScreenText: string }>;
  adaptation: Array<{ original: string; equivalent: string; physicalAction: string; visibleResult: string; kept: string; changed: string; why: string }>;
  risks: Array<{ kind: "funcion_inexistente" | "reveal_adelantado" | "escala" | "identidad" | "texto_en_pantalla" | "marca_ajena" | "otro"; detail: string }>;
  frameUse: FrameUse;                                                       // un solo plano → start_image; varios → contextual_reference
  imagePrompt: string;                                                      // en inglés, prosa
  videoPrompt: string;                                                      // en inglés, con @Video1 / @ImageN
}
export const analysisSchema: z.ZodType<Analysis>;
export function requestAnalysis(user: AuthUser, videoId: number): Promise<{ analysisId: number }>;   // encola "video.desglose"
export function runAnalysis(analysisId: number, deps?: { gateway?: LlmGateway }): Promise<void>;
export function updatePrompts(user: AuthUser, videoId: number, input: { imagePrompt?: string; videoPrompt?: string; frameUse?: FrameUse }): Promise<{ imageIssues: PromptIssue[]; videoIssues: PromptIssue[] }>;
// src/server/spend.ts
export function costOfEntries(entryIds: number[]): Promise<number>; // suma de coalesce(cost, reserved) en micro-dólares
```

  - Tabla `video_analyses`: `id`, `videoId` (cascada), `version`, `status` (`"queued"` | `"running"` | `"done"` | `"failed"` | `"paused"`), `error`, `result jsonb`, `ruleVersions jsonb`, `spendEntryId`, `createdBy`, `createdAt`, `updatedAt`; índice único parcial sobre `videoId` donde `status in ('queued','running','paused')`.
  - `VideoView` gana `analysis: { id: number; version: number; status: string; error: string | null; result: Analysis | null; costMicros: number | null } | null`, `imageIssues: PromptIssue[]`, `videoIssues: PromptIssue[]`, `imageManifest: ManifestItem[]`, `clipManifest: ManifestItem[]`.
  - `PUT /api/videos/[videoId]` acepta además `{ imagePrompt, videoPrompt, frameUse }`; `POST /api/videos/[videoId]/desglose`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/llm-content.test.ts
it("imagePart devuelve un bloque de imagen en base64 con su tipo", () => {
  expect(imagePart(Buffer.from("abc"), "image/jpeg")).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "YWJj" } });
});
it("24 imágenes reservan lo de 24 × 5 000 tokens de entrada", async () => {
  /* misma llamada de nivel mediano con y sin 24 imagePart: la reserva crece 660 000 ± 10 micro-dólares */
});

// tests/prompt-check.test.ts
expect(PROMPT_BLACKLIST).toHaveLength(20);
expect(checkImagePrompt(GOOD_IMAGE, manifest)).toEqual([]);
expect(checkImagePrompt(GOOD_IMAGE + " Golden Hour light.", manifest)).toContainEqual({ level: "error", message: "Quita «golden hour»: es una palabra vetada." });
expect(checkImagePrompt("CRITICAL —\n…\nNEGATIVE:\n…\nSTRICT REQUIREMENTS:\n…", manifest)).toContainEqual({ level: "error", message: "Escribe el prompt en párrafos corridos, sin bloques con títulos en mayúsculas." });
expect(checkImagePrompt(SHORT_1200, manifest)).toContainEqual({ level: "aviso", message: "El prompt de imagen suele ir mejor con unos 4.900 caracteres (ahora tiene 1.200)." }); // sin aviso entre 4.000 y 5.500
expect(checkImagePrompt(WITHOUT_IMAGE_3, manifest)).toContainEqual({ level: "aviso", message: "No dices para qué sirve la imagen 3." });
expect(checkVideoPrompt(GOOD_VIDEO, clip)).toEqual([]);
expect(checkVideoPrompt(GOOD_VIDEO.replace("@Video1", "@video1"), clip)).toContainEqual({ level: "error", message: "Escribe las referencias exactamente como @Video1 y @Image1 (mayúscula inicial, sin espacio)." });
expect(checkVideoPrompt(GOOD_VIDEO + " @Image7", clip)).toContainEqual({ level: "error", message: "@Image7 no existe: este clip lleva 4 imágenes." });
expect(checkVideoPrompt(WITHOUT_AT_IMAGE_3, clip)).toContainEqual({ level: "error", message: "Falta decir para qué sirve @Image3." });
expect(checkVideoPrompt(GOOD_VIDEO + " https://x.test/a.mp4", clip)).toContainEqual({ level: "error", message: "No pongas direcciones ni identificadores en el prompt." });
expect(checkVideoPrompt(GOOD_VIDEO + " bokeh", clip)).toContainEqual({ level: "error", message: "Quita «bokeh»: es una palabra vetada." });
expect(checkVideoPrompt("", clip)).toContainEqual({ level: "error", message: "El prompt está vacío." });

// tests/video-manifest.test.ts
it("imagen: composición, avatar, hasta 4 de artículo, hasta 2 de embalaje y entorno, numeradas desde 1", () => {
  expect(imageManifest(video, photos).map((m) => [m.tag, m.role])).toEqual([["image 1", "composicion"], ["image 2", "avatar"], ["image 3", "articulo"], ["image 4", "articulo"], ["image 5", "embalaje"], ["image 6", "entorno"]]);
});
it("clip: @Video1 es la referencia y @Image1 la imagen aprobada", () => {
  expect(clipManifest(video, photos).map((m) => m.tag)).toEqual(["@Video1", "@Image1", "@Image2", "@Image3", "@Image4", "@Image5"]);
});
it("con «sin personas» no hay avatar; con 6 fotos de artículo solo entran 4", () => {});

// tests/video-analysis.test.ts — fakeMessages
it("manda a Claude las tres reglas, cada fotograma con su segundo y cada foto con su papel, en el nivel mediano", async () => {
  await runAnalysis(id, { gateway: createGateway({ client }) });
  const call = calls[0];
  expect(call.model).toBe("claude-sonnet-5-5");
  expect(call.max_tokens).toBe(16_000);
  for (const slug of ["adaptacion-de-conceptos", "imagen-nano-banana", "video-seedance"]) expect(systemText(call)).toContain(`<regla nombre="${slug}">`);
  expect(blocks(call).filter((b) => b.type === "image")).toHaveLength(12 + 3);   // 12 fotogramas + 3 fotos
  expect(texts(call)).toContain("Fotograma 3 — 1,0 s");
  expect(texts(call)).toContain("image 2 · @Image2 — papel: avatar");
});
it("nunca manda más de 24 fotogramas", async () => {});
it("guarda el desglose, copia los dos prompts y el uso de la imagen al vídeo, y apunta el coste a la persona y al producto", async () => {
  const video = await getVideoFor(ana, v.id);
  expect(video).toMatchObject({ imagePrompt: REPLY.imagePrompt, videoPrompt: REPLY.videoPrompt, frameUse: "contextual_reference" });
  const view = await videoView(ana, v.id);
  expect(view.analysis).toMatchObject({ status: "done", version: 1 });
  expect((await spendSummary(ana)).spentMicros).toBe(view.analysis!.costMicros);
});
it("una respuesta sin el formato pedido deja el desglose en error y no toca los prompts", async () => { /* error "La respuesta de Claude no tiene el formato esperado." */ });
it.each([
  ["sin referencia lista", "Sube primero el vídeo de referencia."],
  ["sin avatar ni «sin personas»", "Elige un avatar o marca que en el vídeo no aparece nadie."],
  ["sin foto de artículo", "Añade al menos una foto del artículo."],
])("%s no se llama a Claude", async (_caso, message) => { /* requestAnalysis → 400 message; calls 0 */ });
it("dos peticiones seguidas dejan un solo desglose en marcha", async () => { /* la segunda → 409 "Ya hay un desglose en marcha." */ });
it("con el tope de gasto alcanzado queda en pausa, no en error", async () => { /* status "paused", error "En pausa: se ha alcanzado el tope de gasto." */ });
it("un desglose interrumpido lo reintenta la cola; si a la hora sigue sin terminar, queda en error", async () => { /* updatedAt hace 61 min → videoSweep → failed, "El desglose se interrumpió. Repítelo." */ });
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/llm-content.test.ts tests/prompt-check.test.ts tests/video-manifest.test.ts tests/video-analysis.test.ts` → FAIL.

- [ ] **Step 3: Implementar `content.ts`, `manifest.ts` y `prompt-check.ts`.** La lista negra se busca sin distinguir mayúsculas y por palabra completa. Un «título en mayúsculas» es una línea de 6 o más caracteres sin minúsculas; a partir de 3, error. En el prompt de imagen, cada índice del manifiesto debe aparecer como `image N`. En el de vídeo: toda etiqueta `@…` debe ser exactamente `@Video1` o `@ImageN` con N dentro del manifiesto; cada etiqueta del manifiesto debe citarse; nada de `http(s)://` ni UUID; más de 4.000 caracteres → aviso «El prompt del clip es muy largo (más de 4.000 caracteres).».

- [ ] **Step 4: Implementar `analysis.ts`.** `runAnalysis` llama a la pasarela dentro de `runStep` (contexto `{ jobName: "video.desglose", userId: video.createdBy, productId: video.productId }`; misma clave en `LlmCall.stepKey`, con `analysisId` en la entrada) con `tier: "medium"`, `maxTokens: 16_000`, `schema: analysisSchema`, `rules: await loadRules([...VIDEO_RULE_SLUGS])`. Contenido, en este orden: ficha del producto (nombre, frase, idioma, países); duración del tramo y cortes detectados; la tabla del manifiesto de imagen y del clip; por cada fotograma, `textPart("Fotograma N — S,S s")` + `imagePart`; por cada foto del manifiesto, `textPart("image N · @ImageM — papel: …")` + `imagePart` (reducida con `makeThumbnail(…, "image", 1024)`). Las instrucciones del paso (texto fijo en español en este archivo) piden: lógica en una frase; tabla de planos; mapa de adaptación; riesgos (función que el producto no tiene, reveal adelantado, falta de foto con mano para la escala, identidad fuera del avatar, texto en pantalla, marcas ajenas); `frameUse` según la regla de vídeo; prompt de imagen según la regla de imagen citando cada `image N` por su papel; prompt de clip según la plantilla de la regla de vídeo, con `@Video1` solo para cámara, ritmo y acción, sin pedir texto en pantalla y con la geometría del producto fija; explicaciones en español y los dos prompts en inglés. `JobPausedError` → `paused`. Cualquier otro error de la pasarela (`LlmCallError`, `LlmRefusalError`, `LlmTruncatedError`, `LlmInvalidOutputError`, `LlmNotConfiguredError`) → el desglose queda `failed` con el mensaje del error y el paso lanza `StepFailedError`: no se repite solo (cada intento cuesta); repite la persona con «Repetir desglose», que crea un desglose nuevo. Si el proceso se cae a mitad, la cola vuelve a lanzar el trabajo (hasta 3 intentos): `runAnalysis` vuelve a poner `running` y renueva `updatedAt` al empezar, y no hace nada si el desglose ya está `done` o `failed`. `videoSweep` gana: desgloses `queued` o `running` con `updatedAt` de hace más de 60 minutos (`ANALYSIS_STALE_MS`) → `failed`. Generar migración.

- [ ] **Step 5: Run tests and commit**

Run: `npm test && npm run typecheck && npm run lint` → PASS.

```bash
git add -A
git commit -m "Desglose del vídeo de referencia con Claude: planos, adaptación, riesgos y los dos prompts comprobados"
```

---

### Task 7: Pantallas I — pestaña Vídeos, Referencia y Desglose

**Files:**
- Create: `src/lib/chunked-upload.ts`, `src/app/(app)/productos/[id]/videos/[videoId]/page.tsx`, `src/components/videos/{video-list.tsx,video-flow.tsx,stepper.tsx,step-reference.tsx,step-breakdown.tsx,photo-pick.tsx,prompt-editor.tsx}`, `scripts/seed-demo-video.ts`
- Modify: `src/components/products/product-detail.tsx` (pestañas «Fotos» y «Vídeos»), `src/components/ui/` (añadir `tabs` y `progress` con la skill `shadcn`)
- Test: `tests/chunked-upload.test.ts`

**Interfaces:**
- Consumes: las rutas de las Tareas 5 y 6; `VideoView`; `PHOTO_ROLE_LABELS`; `api`, `ApiError`.
- Produces:

```ts
// src/lib/chunked-upload.ts
export function uploadInChunks(
  file: Blob & { name: string },
  videoId: number,
  opts: { onProgress(fraction: number): void; fetch?: typeof fetch; sleep?(ms: number): Promise<void>; signal?: AbortSignal },
): Promise<void>;
```

  Por trozo: hasta 5 intentos con esperas de 1, 2, 4, 8 y 16 s; tras un fallo de red, un 5xx o un 409 pregunta el progreso y sigue desde `received`; un 410 vuelve a empezar la subida entera una sola vez; cualquier otro 4xx lanza `ApiError` con el mensaje del servidor.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/chunked-upload.test.ts — `fetch` y `sleep` simulados
it("sube los trozos en orden y termina", async () => { /* 12 MB → PUT ?indice=0,1,2 y POST final; onProgress acaba en 1 */ });
it("si se corta en el trozo 2, espera, pregunta cuántos hay y sigue sin reenviar los anteriores", async () => {
  expect(putIndexes).toEqual([0, 1, 2, 2]);
  expect(sleeps).toEqual([1000]);
});
it("si el servidor ya tenía el trozo (se perdió la respuesta), no lo reenvía", async () => { /* progreso dice received 2 → siguiente PUT es el índice 2 */ });
it("tras 5 fallos seguidos del mismo trozo se rinde con un mensaje claro", async () => {
  await expect(run).rejects.toThrow("La conexión se ha cortado demasiadas veces. Vuelve a intentarlo con mejor cobertura.");
});
it("un 410 vuelve a empezar una sola vez", async () => {});
it("el progreso nunca retrocede", async () => {});
it("un 400 del servidor se enseña tal cual y no se reintenta", async () => { /* "Formato de vídeo no admitido. Usa MP4, MOV o WebM." */ });
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/chunked-upload.test.ts` → FAIL.

- [ ] **Step 3: Implementar `chunked-upload.ts`.**

- [ ] **Step 4: Pantallas** (cargar `impeccable` y `shadcn`). `scripts/seed-demo-video.ts` (solo local) crea un producto con fotos, un vídeo con fotogramas y un desglose de ejemplo, para ver las pantallas sin gastar.
  - **Producto → Vídeos**: lista (título, estado en palabras, «tuyo» o el nombre de quien lo creó) y botón **Nuevo vídeo**. Vacío: «Todavía no hay vídeos de este producto.»
  - **Flujo** con cuatro pasos visibles (Referencia · Desglose · Imagen · Clip); Imagen y Clip muestran «Disponible en cuanto termine el desglose» hasta la Tarea 11. Si el vídeo no es de quien mira: aviso «Este vídeo es de {nombre}. Puedes verlo, pero solo esa persona puede continuarlo.» y todo en solo lectura.
  - **Referencia**: sin Higgsfield conectado, aviso con enlace a Ajustes. Botón **Subir vídeo** (`accept="video/mp4,video/quicktime,video/webm"`), barra de progreso con porcentaje y «No cierres esta pantalla»; si se rinde, el mensaje y **Reintentar**. Procesando: «Preparando el vídeo…»; lista: miniaturas de los fotogramas, duración y, si pasaba de 30 s, «Se usan los primeros 30 segundos (el máximo del modelo).» Debajo, **Avatar** (fotos con ese papel, o casilla «En este vídeo no aparece nadie») y **Entorno** (opcional); si faltan fotos con ese papel, enlace a la pestaña Fotos.
  - **Desglose**: botón **Hacer el desglose** (texto pequeño: «Usa la IA de Claude; cuesta unos céntimos.»). Resultado: la idea en una frase; planos y mapa de adaptación como tarjetas apiladas (no tablas anchas); riesgos destacados; los dos prompts en áreas de texto con contador de caracteres, sus avisos y errores debajo y **Guardar cambios**; selector «La imagen se usa como: primer fotograma / referencia de la escena»; **Repetir desglose**. Coste del desglose con `formatUsd`.

- [ ] **Step 5: Comprobar y commit.** Con `PRINCIPAL_HIGGSFIELD_FAKE=1` y el script de ejemplo: a 390 px con Playwright, crear un vídeo, subir la muestra, elegir avatar, ver el desglose y editar un prompt hasta que desaparezca un error; sin desplazamiento horizontal.

Run: `npm test && npm run typecheck && npm run lint && npm run build` → PASS.

```bash
git add -A
git commit -m "Pantallas de vídeo: pestaña Vídeos, subida de la referencia con reanudación y desglose editable"
```

---

### Task 8: Generaciones — intención, presupuesto, envío único, seguimiento y reconciliación

El núcleo del dinero. No sabe nada de imágenes ni de clips: las Tareas 9 y 10 le dan cómo construir cada petición. **El envío no usa `runStep`**: `runStep` reintenta un paso interrumpido, y aquí reintentar es cobrar dos veces.

**Files:**
- Create: `src/server/videos/generations.ts`, `src/app/api/resultados/[resultId]/miniatura/route.ts`, `tests/fixtures/higgsfield/{estimate,generate_batch,jobs_wait,show_generations}.json`
- Modify: `src/db/schema.ts` (`generations`, `generation_results`; `videos.approvedFrameResultId`, `videos.approvedClipResultId`), `src/connectors/higgsfield/{port.ts,adapter.ts,fake.ts}`, `src/server/videos/{videos.ts,sweep.ts}`, `src/app/api/videos/[videoId]/route.ts`, `src/jobs/video-jobs.ts`
- Test: `tests/generations.test.ts`, `tests/higgsfield-adapter.test.ts`

**Interfaces:**
- Consumes: `getVideoFor`, `requireVideoOwner`, `getActiveUser`, `getProductFor`, `defineJob`, `enqueueJob`, `makeThumbnail`, `HiggsfieldPort` y sus errores.
- Produces:

```ts
// port.ts
export interface HfMediaRef { role: "image_references" | "video_references" | "start_image"; value: string }
export interface HfImageRequest { model: string; prompt: string; aspectRatio: "9:16"; resolution: "2k"; medias: HfMediaRef[] }
export interface HfVideoRequest { model: "seedance_2_5"; mode: "omni_reference"; prompt: string; aspectRatio: "9:16"; duration: number; resolution: "480p" | "720p" | "1080p"; generateAudio: false; bitrateMode: "high"; medias: HfMediaRef[] }
export interface HfSubmitResult { jobIds: string[]; rejected: string[] }   // `rejected`: motivos de las peticiones que Higgsfield no aceptó
export interface HfJob { jobId: string; status: "pending" | "done" | "failed"; failure: "failed" | "nsfw" | "ip_detected" | null; error: string | null; urls: string[] }
export interface HfHistoryItem { jobId: string; type: "image" | "video"; model: string; prompt: string | null; createdAt: Date | null }
export class HiggsfieldRejectedError extends Error {}        // Higgsfield dijo que no: seguro que no se envió nada
export class HiggsfieldUnknownOutcomeError extends Error {}  // no se sabe si llegó
// HiggsfieldPort gana:
quoteImages(userId: number, request: HfImageRequest, count: number): Promise<{ credits: number }>;
quoteVideo(userId: number, request: HfVideoRequest): Promise<{ credits: number }>;
submitImages(userId: number, request: HfImageRequest, count: number): Promise<HfSubmitResult>;
submitVideo(userId: number, request: HfVideoRequest): Promise<HfSubmitResult>;
jobs(userId: number, jobIds: string[], waitSeconds: number): Promise<HfJob[]>;
history(userId: number, type: "image" | "video", limit: number): Promise<HfHistoryItem[]>;

// src/server/videos/generations.ts
export const MAX_REGENERATIONS = 2;                       // por imagen y por clip: 3 rondas como mucho
export const SUBMIT_STALE_MS = 2 * 60 * 1000;
export const RECONCILE_GIVE_UP_MS = 10 * 60 * 1000;
export const GENERATION_TIMEOUT_MS = 60 * 60 * 1000;
export const POLL_MIN_INTERVAL_MS = 8_000;
export type GenerationKind = "frame" | "clip";
export type GenerationStatus = "intent" | "submitting" | "submitted" | "done" | "failed" | "not_sent" | "unknown";
export type RequestBuilder = (user: AuthUser, video: Video, deps: GenDeps) => Promise<{ request: HfImageRequest | HfVideoRequest; count: number }>;
export interface GenDeps { higgsfield?: HiggsfieldPort; fetch?: typeof fetch; now?: () => Date }
export function registerRequestBuilder(kind: GenerationKind, build: RequestBuilder): void;
export function quoteGeneration(user: AuthUser, videoId: number, kind: GenerationKind, deps?: GenDeps): Promise<{ credits: number; balance: number; enough: boolean; round: number; regenerationsLeft: number }>;
export function requestGeneration(user: AuthUser, videoId: number, kind: GenerationKind, input: { expectedCredits: number }, deps?: GenDeps): Promise<{ generationId: number }>;
export function submitGeneration(generationId: number, deps?: GenDeps): Promise<void>;     // trabajo "video.enviar"
export function pollGeneration(generationId: number, deps?: GenDeps): Promise<void>;
export function reconcileGeneration(generationId: number, deps?: GenDeps): Promise<void>;
export function sweepGenerations(deps?: GenDeps): Promise<void>;                           // dentro de videoSweep
export function rejectRound(user: AuthUser, videoId: number, kind: GenerationKind, reason: string): Promise<void>;
export function approveResult(user: AuthUser, videoId: number, kind: GenerationKind, resultId: number): Promise<void>;
export function readResultThumb(user: AuthUser, resultId: number): Promise<{ mime: string; data: Buffer }>;
export interface GenerationView {
  round: number; regenerationsLeft: number; approvedResultId: number | null;
  current: { id: number; status: GenerationStatus; error: string | null; quotedCredits: number; rejectReason: string | null;
             results: Array<{ id: number; ok: boolean; url: string | null; hasThumb: boolean }> } | null;
}
```

  - Tabla `generations`: `id`, `videoId` (cascada), `kind`, `round`, `status`, `userId`, `request jsonb`, `count`, `quotedCredits`, `creditsSpent`, `jobIds jsonb`, `error`, `rejectReason`, `raw jsonb` (última respuesta en crudo, recortada a 20 000 caracteres), `intentAt`, `submitStartedAt`, `submittedAt`, `finishedAt`, `lastPolledAt`. Índice único parcial (`videoId`, `kind`, `round`) donde `status <> 'not_sent'`. `generation_results`: `id`, `generationId` (cascada), `index`, `jobId`, `ok`, `url`, `error`, `thumbMime`, `thumb bytea`.
  - Estados: `intent` (apuntada y encolada) → `submitting` (llamada en curso) → `submitted` (identificadores guardados) → `done` | `failed`. `not_sent`: seguro que no llegó; no gasta ronda. `unknown`: no se sabe; bloquea nuevas generaciones de ese tipo en ese vídeo hasta resolverse. Una ronda está **gastada** si su fila llegó a `submitted`, `done` o `failed`.
  - `VideoView` gana `frame: GenerationView` y `clip: GenerationView`. `GET /api/videos/[videoId]` llama a `pollGeneration` de la generación en curso cuando quien mira es quien la creó. `GET /api/resultados/[resultId]/miniatura`.
  - El simulado gana: presupuesto de 2 créditos por imagen y `duration × 3` por clip a 480p; `submit*` crea `job-1`, `job-2`…; `state.jobs` y `state.history` editables; en modo local los trabajos terminan a la segunda consulta con una imagen o un vídeo de muestra como dirección `data:`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/higgsfield-adapter.test.ts — argumentos exactos de las herramientas reales
it("quoteImages → estimate_image_cost", async () => {
  expect(mcpCalls[0]).toEqual({ name: "estimate_image_cost", args: { params: { model: "nano_banana_pro", prompt: "P", aspect_ratio: "9:16", resolution: "2k", count: 2, use_unlim: false, medias: [{ role: "image_references", value: "m1" }] } } });
});
it("submitImages → generate_image_batch, una petición por candidata", async () => {
  expect(mcpCalls[0].name).toBe("generate_image_batch");
  expect(mcpCalls[0].args.requests.map((r) => [r.index, r.params.count, r.params.use_unlim])).toEqual([[0, 1, false], [1, 1, false]]);
});
it("submitVideo → generate_video_batch con Seedance 2.5", async () => {
  expect(mcpCalls[0]).toEqual({ name: "generate_video_batch", args: { requests: [{ index: 0, params: {
    model: "seedance_2_5", mode: "omni_reference", prompt: "P", aspect_ratio: "9:16", duration: 10, resolution: "480p",
    generate_audio: false, bitrate_mode: "high", count: 1, use_unlim: false,
    medias: [{ role: "video_references", value: "ref" }, { role: "start_image", value: "job-f" }, { role: "image_references", value: "m2" }] } }] } });
});
it("jobs → jobs_wait con índices y la espera pedida (0–15 s)", async () => {
  expect(mcpCalls[0]).toEqual({ name: "jobs_wait", args: { jobs: [{ index: 0, job_id: "j1" }, { index: 1, job_id: "j2" }], timeout_seconds: 0 } });
});
it("history → show_generations con todos los estados", async () => {
  expect(mcpCalls[0]).toEqual({ name: "show_generations", args: { only_completed: false, type: "image", size: 50 } });
});
it("un envío con `isError` lanza HiggsfieldRejectedError con el texto de Higgsfield", async () => {});
it("una respuesta `unlim_choice` es un rechazo: no se envió nada", async () => {});
it("un corte de conexión o una respuesta ilegible en un envío lanza HiggsfieldUnknownOutcomeError", async () => {});
it("un estado de trabajo que no se reconoce se trata como pendiente", async () => {});

// tests/generations.test.ts — Higgsfield simulado; constructor de peticiones de prueba registrado
it("el presupuesto dice créditos, saldo y si alcanza", async () => {
  expect(await quoteGeneration(ana, v.id, "frame", deps)).toEqual({ credits: 4, balance: 1000, enough: true, round: 1, regenerationsLeft: 2 });
});
it("sin créditos suficientes no se crea ni se envía nada, y lo dice con cifras", async () => {
  fake.state.credits = 3;
  await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({ status: 409, message: "No tienes créditos suficientes en Higgsfield: hacen falta 4 y tienes 3." });
  expect(await countGenerations()).toBe(0);
});
it("si el precio ha subido desde que la persona lo vio, no se envía", async () => { /* expected 4, ahora 6 → 409 "El precio ha cambiado: ahora son 6 créditos. Revísalo y confirma de nuevo." */ });
it("doble clic: dos peticiones a la vez crean una sola generación", async () => { /* allSettled: una cumple; la otra 409 "Ya hay una generación en marcha."; 1 fila */ });
it("la intención está guardada antes de llamar a Higgsfield", async () => { /* dentro de submitImages: la fila está en "submitting" con `request` */ });
it("dos trabajos para la misma generación envían una sola vez", async () => {
  await Promise.all([submitGeneration(id, deps), submitGeneration(id, deps)]);
  expect(submits()).toHaveLength(1);
});
it("caída a mitad del envío: al volver no se reenvía; se adopta lo que aparece en el historial", async () => {
  /* fila en "submitting" con submitStartedAt hace 3 min */
  await sweepGenerations(deps);
  expect(await statusOf(id)).toBe("unknown");
  fake.state.history = [hist("j9", SAME_PROMPT), hist("j10", SAME_PROMPT), hist("j1", "otro prompt")];
  await sweepGenerations(deps);
  expect(await rowOf(id)).toMatchObject({ status: "submitted", jobIds: ["j9", "j10"] });
  expect(submits()).toHaveLength(0);
});
it("resultado desconocido sin rastro: a los 10 minutos queda «no enviado»; antes no deja repetir", async () => {
  /* +5 min */ await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({ status: 409, message: "Estamos comprobando con Higgsfield si la petición anterior llegó. No se vuelve a enviar para no cobrarte dos veces." });
  /* +11 min, sweep */ expect(await statusOf(id)).toBe("not_sent");
  expect((await quoteGeneration(ana, v.id, "frame", deps)).round).toBe(1);        // no gastó ronda
});
it("si el historial no se puede leer, sigue «desconocido» aunque pasen 10 minutos", async () => {});
it("un envío que Higgsfield rechaza queda «no enviado» con su motivo", async () => {});
it("permiso caducado al enviar: no se llama a generar y queda «no enviado» con el aviso de reconectar", async () => {
  fake.failNext("balance", new HiggsfieldAuthError());
  await submitGeneration(id, deps);
  expect(await rowOf(id)).toMatchObject({ status: "not_sent", error: "Tu conexión con Higgsfield ha caducado. Vuelve a conectarla en Ajustes." });
  expect(submits()).toHaveLength(0);
});
it("el saldo bajó entre pedir y enviar: no se envía", async () => { /* not_sent, "No tienes créditos suficientes en Higgsfield: hacen falta 4 y tienes 1." */ });
it("máximo 2 regeneraciones: la cuarta ronda se rechaza", async () => { /* 409 "Has llegado al máximo de 2 regeneraciones." */ });
it("para regenerar hay que haber rechazado lo anterior con un motivo de una línea", async () => {
  for (const reason of ["", "   ", "dos\nlíneas", "x".repeat(301)])
    await expect(rejectRound(ana, v.id, "frame", reason)).rejects.toMatchObject({ status: 400, message: "Escribe en una línea por qué lo rechazas (máximo 300 caracteres)." });
  await expect(requestGeneration(ana, v.id, "frame", { expectedCredits: 4 }, deps)).rejects.toMatchObject({ status: 409, message: "Antes de regenerar, rechaza el resultado anterior y di por qué." });
  await rejectRound(ana, v.id, "frame", "La caja sale deformada");
  expect((await rowOf(id)).rejectReason).toBe("La caja sale deformada");
});
it("solo quien creó el vídeo genera: el dueño recibe 403 y quien no tiene el producto, 404", async () => {});
it("persona desactivada o producto desasignado después de pedir: el trabajo no envía nada", async () => { /* not_sent; submits 0 */ });
it("el seguimiento guarda resultados y miniaturas y termina la generación", async () => { /* done; 2 resultados ok con miniatura JPEG; creditsSpent 4 */ });
it("si Higgsfield solo aceptó una de las dos, sigue con una y apunta la mitad de créditos", async () => { /* jobIds 1; creditsSpent 2 */ });
it.each([["nsfw"], ["ip_detected"], ["failed"]])("un trabajo %s deja la generación en error con texto claro y gasta ronda", async () => {
  /* nsfw / ip_detected: "Higgsfield ha bloqueado el resultado por su filtro de contenido o de marcas. Cambia la referencia o el prompt." */
});
it("no pregunta a Higgsfield más de una vez cada 8 segundos por generación", async () => {});
it("una generación enviada que no termina en una hora queda en error sin reenviarse", async () => { /* "Higgsfield no ha terminado este trabajo en una hora. Míralo en tu cuenta de Higgsfield." */ });
it("aprobar un resultado de otro vídeo da 404; aprobar uno propio lo marca", async () => {});
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/generations.test.ts tests/higgsfield-adapter.test.ts` → FAIL.

- [ ] **Step 3: Ampliar el puerto, el adaptador y el simulado.** En el adaptador, solo `submitImages`/`submitVideo` pueden lanzar `HiggsfieldUnknownOutcomeError`; las lecturas lanzan `HiggsfieldUnavailableError`. Un 401 (`McpUnauthorizedError`) prueba que no se ejecutó: se refresca y se repite una vez, también en un envío. Cada respuesta de envío se devuelve además en crudo para guardarla en `generations.raw`.

- [ ] **Step 4: Implementar `generations.ts`.**
  - `requestGeneration`: `getVideoFor` + `requireVideoOwner`; construye la petición; presupuesto y saldo frescos; luego, en una transacción con `pg_advisory_xact_lock(0x5647454e /* "VGEN" */, videoId)`: sin generación activa de ese tipo (`intent`, `submitting`, `submitted`) ni `unknown`; `round` = rondas gastadas + 1, como mucho `1 + MAX_REGENERATIONS`; si `round > 1`, la ronda anterior tiene `rejectReason` o terminó en `failed`; inserta la fila `intent` con la petición y `quotedCredits`. Después encola `video.enviar` con `{ generationId }`.
  - `submitGeneration`: se hace con la fila con un único `update … set status = 'submitting', submit_started_at = now() where id = $1 and status = 'intent' returning *`; sin fila devuelta, termina sin llamar. Antes de enviar (cualquier fallo aquí → `not_sent`): persona activa y producto visible, saldo ≥ `quotedCredits`, presupuesto fresco ≤ `quotedCredits`. Envía **una vez**: identificadores → `submitted` (y `creditsSpent = ceil(quotedCredits × aceptadas / pedidas)`); `HiggsfieldRejectedError`, `HiggsfieldAuthError`, `HiggsfieldNotConnectedError` → `not_sent`; cualquier otro error → `unknown`. Tras `submitted`, un `pollGeneration`.
  - `pollGeneration`: reserva el turno con `update … set last_polled_at = now() where id = $1 and status = 'submitted' and (last_polled_at is null or last_polled_at < now() - interval '8 seconds') returning *`; `jobs(…, 0)`; con todos terminados guarda resultados y miniaturas (descarga con `fetch` y `makeThumbnail`; si la miniatura falla, el resultado se guarda sin ella) y pasa a `done` (algún resultado bueno) o `failed`.
  - `reconcileGeneration` (`unknown`): `history(userId, tipo, 50)`; coinciden los elementos con el mismo `prompt` y `model`, cuyo `jobId` no esté ya en ninguna generación de ese vídeo y, si traen fecha, creados desde `submitStartedAt − 60 s`; adopta hasta `count` → `submitted`. Sin coincidencias y pasados `RECONCILE_GIVE_UP_MS` → `not_sent` con «Higgsfield no llegó a recibir la petición. Puedes volver a generarla.». Si `history` falla, no cambia nada.
  - `sweepGenerations`: `submitting` con más de `SUBMIT_STALE_MS` → `unknown`; `intent` con más de 2 minutos → vuelve a encolar `video.enviar`; `submitted` → `pollGeneration` (o error por `GENERATION_TIMEOUT_MS`); `unknown` → `reconcileGeneration`.
  Generar migración.

- [ ] **Step 5: Run tests and commit**

Run: `npm test && npm run typecheck && npm run lint` → PASS.

```bash
git add -A
git commit -m "Generaciones: presupuesto y saldo antes de enviar, envío único y reconciliación contra el historial de Higgsfield"
```

---

### Task 9: Imagen inicial — candidatas, aprobar y rechazar

**Files:**
- Create: `src/server/videos/frame.ts`, `src/app/api/videos/[videoId]/imagen/{presupuesto,generar,aprobar,rechazar}/route.ts`, `src/app/api/ajustes/modelo-imagen/route.ts`
- Test: `tests/video-frame.test.ts`

**Interfaces:**
- Consumes: `registerRequestBuilder`, `quoteGeneration`, `requestGeneration`, `approveResult`, `rejectRound`, `imageManifest`, `checkImagePrompt`, `ensureMedia`, `readProductPhoto`, `readVideoFrame`, `getSetting`/`setSetting`.
- Produces:

```ts
export const IMAGE_MODELS = ["nano_banana_pro", "nano_banana_2_1"] as const;
export type ImageModel = (typeof IMAGE_MODELS)[number];
export const DEFAULT_IMAGE_MODEL: ImageModel = "nano_banana_pro";
export const IMAGE_MODEL_SETTING = "video.imageModel";
export const FRAME_CANDIDATES = 2;
export function getImageModel(): Promise<ImageModel>;
export function setImageModel(owner: AuthUser, model: string): Promise<void>;
export const buildFrameRequest: RequestBuilder; // registrado como "frame" al importar el módulo
```

  - Rutas (todas `POST`): `…/imagen/presupuesto` → resultado de `quoteGeneration`; `…/imagen/generar` `{ expectedCredits }`; `…/imagen/aprobar` `{ resultId }`; `…/imagen/rechazar` `{ reason }`. `GET/PUT /api/ajustes/modelo-imagen` (cambiar: solo dueño).

- [ ] **Step 1: Write the failing tests**

```ts
it("la petición lleva el modelo por defecto, 2K vertical y las referencias en el orden del manifiesto", async () => {
  const { request, count } = await buildFrameRequest(ana, video, deps);
  expect(count).toBe(2);
  expect(request).toEqual({ model: "nano_banana_pro", prompt: video.imagePrompt, aspectRatio: "9:16", resolution: "2k",
    medias: manifestMediaIds.map((value) => ({ role: "image_references", value })) }); // composición, avatar, artículo y entorno, en ese orden
});
it("con el ajuste en Nano Banana 2.1 cambia el modelo y sigue pidiendo 2K", async () => { /* model "nano_banana_2_1", resolution "2k" */ });
it("las fotos se suben una vez aunque se regenere", async () => { /* dos construcciones → 4 subidas en total */ });
it("un prompt con errores no deja pedir precio ni sube nada", async () => { /* 400 "Quita «bokeh»: es una palabra vetada."; 0 subidas */ });
it("sin desglose hecho no hay imagen", async () => { /* 400 "Haz primero el desglose." */ });
it("aprobar marca la imagen del vídeo; rechazar la quita", async () => {});
it("con un clip ya enviado no se puede cambiar la imagen aprobada", async () => { /* 409 "Ya se ha generado un clip con esta imagen." */ });
it("solo el dueño cambia el modelo de imagen, y solo a uno de la lista", async () => { /* colaborador 403; "otro" → 400 "Modelo de imagen no disponible." */ });
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/video-frame.test.ts` → FAIL.

- [ ] **Step 3: Implementar `frame.ts` y las rutas.** Las fotos del producto se suben a Higgsfield tal como están guardadas; el fotograma de composición, tal como está en `video_frames`. `filename` de cada subida: `foto-<id>.<ext>` o `fotograma-<videoId>.jpg`.

- [ ] **Step 4: Run tests and commit**

Run: `npm test && npm run typecheck && npm run lint` → PASS.

```bash
git add -A
git commit -m "Imagen inicial: dos candidatas con Nano Banana, aprobar o rechazar con motivo, modelo elegible por el dueño"
```

---

### Task 10: Clip — generar, revisar, descargar y coste por vídeo

**Files:**
- Create: `src/server/videos/{clip.ts,costs.ts}`, `src/app/api/videos/[videoId]/clip/{presupuesto,generar,aprobar,rechazar,descargar}/route.ts`
- Modify: `src/db/schema.ts` (`videos.clipResolution`), `src/server/videos/videos.ts`, `src/app/api/videos/[videoId]/route.ts`
- Test: `tests/video-clip.test.ts`

**Interfaces:**
- Consumes: `registerRequestBuilder`, `clipManifest`, `checkVideoPrompt`, `ensureMedia`, `costOfEntries`, lo demás de la Tarea 8.
- Produces:

```ts
export const CLIP_MODEL = "seedance_2_5";
export const CLIP_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const DEFAULT_CLIP_RESOLUTION = "480p";
export function clipDurationSeconds(segmentDurationMs: number): number; // clamp(round(ms / 1000), 4, 30)
export const buildClipRequest: RequestBuilder; // registrado como "clip"
export function clipDownload(user: AuthUser, videoId: number): Promise<{ url: string; filename: string }>;
// costs.ts
export function videoCosts(user: AuthUser, videoId: number): Promise<{ higgsfieldCredits: number; claudeMicros: number }>;
```

  - `updateVideoChoices` y `PUT /api/videos/[videoId]` aceptan además `clipResolution`. `VideoView` gana `costs: { higgsfieldCredits: number; claudeMicros: number }`. `GET …/clip/descargar` reenvía el archivo con `Content-Disposition: attachment`.

- [ ] **Step 1: Write the failing tests**

```ts
expect([2_400, 9_600, 14_400, 30_000, 45_000].map(clipDurationSeconds)).toEqual([4, 10, 14, 30, 30]);
it("la petición es Seedance 2.5 omni_reference a 480p, sin audio, con la referencia, la imagen aprobada y las fotos", async () => {
  expect((await buildClipRequest(ana, video, deps)).request).toEqual({
    model: "seedance_2_5", mode: "omni_reference", prompt: video.videoPrompt, aspectRatio: "9:16", duration: 6,
    resolution: "480p", generateAudio: false, bitrateMode: "high",
    medias: [{ role: "video_references", value: video.referenceMediaId }, { role: "start_image", value: approvedJobId },
             { role: "image_references", value: avatarMediaId }, { role: "image_references", value: articuloMediaId }] });
});
it("como referencia de la escena, la imagen aprobada va la primera de image_references y no hay start_image", async () => {
  /* frameUse "contextual_reference" → medias[1] = { role: "image_references", value: approvedJobId } */
});
it("sin imagen aprobada no hay clip", async () => { /* 409 "Aprueba primero la imagen inicial." */ });
it("un prompt de clip con errores no deja pedir precio", async () => { /* 400 "Falta decir para qué sirve @Image3." */ });
it("la resolución elegida va en la petición; una que no existe se rechaza", async () => { /* "720p" pasa; "8k" → 400 "Resolución no disponible." */ });
it("créditos justos para la imagen pero no para el clip: lo dice y la imagen aprobada sigue ahí", async () => {
  /* saldo 10, clip 18 → 409 "No tienes créditos suficientes en Higgsfield: hacen falta 18 y tienes 10."; approvedFrameResultId intacto */
});
it("el coste del vídeo suma los créditos de lo enviado y el coste de Claude de sus desgloses", async () => {
  expect(await videoCosts(ana, v.id)).toEqual({ higgsfieldCredits: 4 + 18, claudeMicros: analysisCost });
});
it("la descarga solo sirve la dirección guardada del clip, a quien ve el vídeo", async () => { /* dueño sí; sin producto 404; sin clip 404 "Todavía no hay clip." */ });
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/video-clip.test.ts` → FAIL.

- [ ] **Step 3: Implementar `clip.ts`, `costs.ts` y las rutas.** `value` de la imagen aprobada es el `jobId` de su resultado (Higgsfield acepta el identificador de una generación anterior). `duration = clipDurationSeconds(video.segmentDurationMs)`. La descarga usa el clip aprobado o, si no hay, el último terminado; solo direcciones `https:` guardadas en `generation_results` (y `data:` en modo simulado); nombre `<producto>-video-<id>.mp4`. Generar migración.

- [ ] **Step 4: Run tests and commit**

Run: `npm test && npm run typecheck && npm run lint` → PASS.

```bash
git add -A
git commit -m "Clip con Seedance 2.5 a partir de la referencia y la imagen aprobada, descarga y coste por vídeo"
```

---

### Task 11: Pantallas II — Imagen y Clip, y el primer vídeo real (PUERTA)

**Files:**
- Create: `src/components/videos/{step-frame.tsx,step-clip.tsx,quote-card.tsx,reject-dialog.tsx,generation-status.tsx,cost-summary.tsx}`, `src/components/settings/image-model-card.tsx`
- Modify: `src/components/videos/video-flow.tsx`, `src/components/settings/settings-view.tsx`, `docs/2026-11-higgsfield-conexion.md`, `tests/fixtures/higgsfield/*.json`, `src/connectors/higgsfield/adapter.ts` (si las respuestas reales difieren), `src/server/videos/manifest.ts` (`START_IMAGE_IS_IMAGE1`)
- Test: las de las Tareas 8–10 (sin lógica nueva de servidor)

**Interfaces:**
- Consumes: `VideoView` (`frame`, `clip`, `costs`), rutas de las Tareas 8–10.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Pantallas** (cargar `impeccable` y `shadcn`).
  - **Tarjeta de precio** (imagen y clip): «Esto cuesta **4 créditos**. Tienes 1.234.» y botón **Generar 2 imágenes** / **Generar clip**. Sin saldo: en rojo «Te faltan N créditos» y el botón desactivado. El botón manda `expectedCredits` con la cifra mostrada.
  - **Estado**: `intent`/`submitting`/`submitted` → «Generando… puedes salir y volver.»; `unknown` → aviso ámbar «No sabemos si Higgsfield recibió la petición. Lo estamos comprobando y no se vuelve a enviar, para no cobrarte dos veces.»; `not_sent` y `failed` → el motivo y, si quedan, **Volver a generar**.
  - **Imagen**: las candidatas grandes, una debajo de otra; tocar amplía. **Aprobar esta** en cada una; **Rechazar las dos** abre el diálogo «¿Por qué no valen? (una línea)». Contador «Te quedan N regeneraciones»; al llegar a cero: «Has usado las 2 regeneraciones de esta imagen. Corrige el desglose o empieza un vídeo nuevo.»
  - **Clip**: selector de resolución (480p por defecto, con «la más barata»), tarjeta de precio, reproductor vertical, **Aprobar**, **Rechazar** (mismo diálogo) y **Descargar**.
  - **Coste del vídeo** al pie: «Higgsfield: 22 créditos · Claude: 0,12 US$».
  - **Ajustes → Modelo de imagen** (solo dueño): Nano Banana Pro / Nano Banana 2.1.

- [ ] **Step 2: Comprobar en local y commit.** Con `PRINCIPAL_HIGGSFIELD_FAKE=1`, a 390 px con Playwright: generar imágenes, rechazar con motivo, regenerar, aprobar, generar clip, ver el estado «desconocido» (forzado en el simulado) y descargar.

Run: `npm test && npm run typecheck && npm run lint && npm run build` → PASS.

```bash
git add -A
git commit -m "Pantallas de imagen y clip: precio y saldo antes de generar, aprobar, rechazar con motivo y descargar"
```

- [ ] **Step 3: PUERTA — primer vídeo real, con el dueño presente** (gasta créditos suyos: unas 2 imágenes y un clip corto a 480p, ya autorizado). En la web publicada, con un producto real y una referencia de 5–10 s: recorrer los cuatro pasos. Apuntar: saldo antes y después de cada generación frente a lo presupuestado; tiempo de cada una; si la persona y el producto del clip son los de `@Image…` correctos (decide `START_IMAGE_IS_IMAGE1`); si la dirección del resultado sigue abriéndose al día siguiente; qué muestra el diagnóstico de `show_generations` para esas generaciones (¿trae el prompt?, que es lo que usa la reconciliación).

- [ ] **Step 4: Fijar lo aprendido.** Sustituir los supuestos de `tests/fixtures/higgsfield/{generate_batch,jobs_wait,show_generations}.json` por las respuestas reales (de `generations.raw`, visibles para el dueño en «Detalles técnicos» del vídeo) y ajustar los lectores. Completar `docs/2026-11-higgsfield-conexion.md` con el **coste real por vídeo** y los hallazgos. Si `show_generations` no trae el prompt, la reconciliación pasa a emparejar por modelo y ventana de tiempo, y se apunta como riesgo.

```bash
git add -A
git commit -m "Primer vídeo real: respuestas de Higgsfield fijadas, numeración de imágenes confirmada y coste medido"
```

---

### Task 12: Agente del Mac — servidor (fichas, tareas con reserva y latido)

**Files:**
- Create: `src/server/agent.ts`, `src/app/api/agente/latido/route.ts`, `src/app/api/agente/tareas/reclamar/route.ts`, `src/app/api/agente/tareas/[taskId]/{latido,trozo,terminar}/route.ts`, `src/app/api/ajustes/agente/route.ts`, `src/app/api/videos/[videoId]/referencia/enlace/route.ts`
- Modify: `src/db/schema.ts` (`agents`, `agent_tasks`; `upload_sessions.totalBytes` pasa a admitir nulo), `src/server/videos/{upload.ts,sweep.ts}`
- Test: `tests/agent.test.ts`

**Interfaces:**
- Consumes: `appendChunk`, `finishUpload`, `UploadActor`, `MAX_REFERENCE_BYTES`, `getVideoFor`, `requireVideoOwner`, `credentialStatus`, `handle` con `{ public: true }`.
- Produces:

```ts
export const AGENT_ONLINE_MS = 90_000;
export const LEASE_MS = 5 * 60_000;
export const MAX_TASK_ATTEMPTS = 3;
export const LINK_HOSTS = ["instagram.com", "tiktok.com", "youtube.com", "youtu.be", "facebook.com", "fb.watch"] as const; // y sus subdominios
export function createAgentToken(owner: AuthUser, name: string): Promise<{ agentId: number; token: string }>; // el token se enseña una vez; se guarda su huella sha256
export function revokeAgent(owner: AuthUser, agentId: number): Promise<void>;
export function requireAgent(request: Request): Promise<{ agentId: number }>;   // cabecera Authorization: Bearer …; si no, 401
export function agentHeartbeat(agentId: number, info: { version: string; ytDlp: string | null }): Promise<void>;
export function agentStatus(now?: Date): Promise<{ online: boolean; lastSeenAt: Date | null }>;
export function requestLinkDownload(user: AuthUser, videoId: number, url: string): Promise<{ taskId: number }>;
export function claimTask(agentId: number, now?: Date): Promise<{ taskId: number; url: string; uploadId: string; chunkBytes: number; maxBytes: number } | null>;
export function extendLease(agentId: number, taskId: number, now?: Date): Promise<void>;
export function finishTask(agentId: number, taskId: number, result: { ok: true; totalBytes: number } | { ok: false; error: string }): Promise<void>;
// src/server/videos/upload.ts gana: sesión de subida de una tarea del Mac (sin tamaño anunciado; el tope de 100 MB se aplica según llegan los trozos)
export function startAgentUpload(agentTaskId: number, videoId: number): Promise<{ uploadId: string; chunkBytes: number }>;
export function expireLeases(now?: Date): Promise<void>; // dentro de videoSweep
```

  - `agents`: `id`, `name`, `tokenHash unique`, `createdBy`, `createdAt`, `lastSeenAt`, `info jsonb`, `revokedAt`. `agent_tasks`: `id`, `kind` (`"link_download"`), `videoId` (cascada), `url`, `status` (`"queued"` | `"leased"` | `"done"` | `"failed"`), `agentId`, `leaseExpiresAt`, `attempts`, `error`, `createdAt`, `updatedAt`.
  - Rutas del agente (sin sesión; con ficha): `POST /api/agente/latido`; `POST /api/agente/tareas/reclamar` (200 con la tarea o 204); `POST …/[taskId]/latido`; `PUT …/[taskId]/trozo?indice=N`; `POST …/[taskId]/terminar`. Con sesión: `POST /api/videos/[videoId]/referencia/enlace` `{ url }`; `GET /api/ajustes/agente` (todos: `{ online }`), `POST`/`DELETE` (solo dueño).

- [ ] **Step 1: Write the failing tests**

```ts
it("la ficha se guarda como huella y solo se enseña al crearla", async () => { /* la tabla no contiene el token */ });
it("solo el dueño crea o revoca fichas; una ficha revocada o inventada da 401", async () => {});
it("una ficha del Mac no abre las rutas de las personas", async () => { /* GET /api/productos con Authorization: Bearer <ficha> → 401 */ });
it("sin Mac conectado, pegar un enlace lo dice y no crea tarea", async () => {
  await expect(requestLinkDownload(ana, v.id, "https://www.instagram.com/reel/abc/")).rejects.toMatchObject({ status: 409, message: "El Mac no está conectado ahora mismo. Sube el archivo del vídeo." });
});
it.each(["http://www.instagram.com/reel/a", "https://evil.test/?u=instagram.com", "https://instagram.com.evil.test/x", "https://user:pw@tiktok.com/x", "file:///etc/passwd"])(
  "el enlace %s se rechaza", async (url) => { /* 400 "Solo se admiten enlaces de Instagram, TikTok, YouTube o Facebook." */ });
it("«conectado» es un latido en los últimos 90 segundos", async () => {});
it("dos Macs reclaman a la vez y solo uno se lleva la tarea", async () => {});
it("sin latido en 5 minutos la tarea vuelve a la cola; al tercer intento fallido el vídeo lo dice", async () => {
  /* expireLeases ×3 → tarea "failed"; vídeo referenceStatus "failed", referenceError "No se pudo descargar el enlace. Sube el archivo del vídeo." */
});
it("un Mac que no tiene la reserva no puede subir trozos ni terminar la tarea", async () => { /* 409 "Esta tarea ya no es tuya." */ });
it("al terminar bien, el vídeo entra en el mismo procesado que una subida", async () => { /* referenceStatus "processing", referenceSource "link"; trabajo video.referencia encolado */ });
it("si el Mac informa de un fallo, el vídeo lo enseña sin detalles técnicos", async () => { /* "No se pudo descargar el enlace. Sube el archivo del vídeo." */ });
it("el archivo que entrega el Mac pasa los mismos límites: 100 MB y tipo por contenido", async () => {});
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/agent.test.ts` → FAIL.

- [ ] **Step 3: Implementar `agent.ts` y las rutas.** `requestLinkDownload` exige lo mismo que `startUpload` (vídeo propio y Higgsfield conectado, con sus mismos mensajes) además del Mac conectado y el enlace admitido; deja el vídeo en `referenceStatus: "uploading"`, `referenceSource: "link"`. `claimTask` usa `for update skip locked` y, al reclamar, crea la sesión con `startAgentUpload` (`UploadActor = { agentTaskId }`). Comparar la huella de la ficha en tiempo constante. El `error` que manda el Mac se guarda recortado (500 caracteres) solo para el dueño; a la persona se le enseña el texto fijo. Generar migración.

- [ ] **Step 4: Run tests and commit**

Run: `npm test && npm run typecheck && npm run lint` → PASS.

```bash
git add -A
git commit -m "Agente del Mac (servidor): fichas, tareas de descarga con reserva y latido, y entrega del archivo por trozos"
```

---

### Task 13: Agente del Mac — programa y «Pegar enlace»

**Files:**
- Create: `agente-mac/{agente.mjs,lib.mjs,README.md,com.principal.agente.plist}`
- Modify: `src/components/videos/step-reference.tsx`, `src/components/settings/settings-view.tsx` (tarjeta «Mac», solo dueño), `eslint.config.mjs` y `vitest.config.ts` solo si hace falta para que entren los `.mjs`
- Test: `tests/agente-mac.test.ts`

**Interfaces:**
- Consumes: las rutas `/api/agente/…` de la Tarea 12.
- Produces (`agente-mac/lib.mjs`, sin dependencias: solo Node ≥ 22):

```js
export const LINK_HOSTS;                    // la misma lista que el servidor
export function allowedUrl(url);            // boolean
export function ytDlpArgs(url, outPath);    // lista de argumentos
export function chunkRanges(size, chunkBytes); // [{ index, start, end }]
export async function runOnce(config, deps); // { fetch, spawn, fs, sleep, log } → "idle" | "done" | "failed"
```

  Configuración: `~/.principal-agente.json` `{ "url": "https://…", "token": "…" }` (o las variables `PRINCIPAL_URL` y `PRINCIPAL_AGENTE_TOKEN`). Bucle de `agente.mjs`: latido cada 30 s; `runOnce` cada 5 s.

- [ ] **Step 1: Write the failing tests**

```ts
expect(ytDlpArgs("https://www.instagram.com/reel/abc/", "/tmp/x.mp4")).toEqual([
  "--cookies-from-browser", "brave", "--no-playlist", "--max-filesize", "100M",
  "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4",
  "-o", "/tmp/x.mp4", "--", "https://www.instagram.com/reel/abc/"]);
expect(allowedUrl("https://vm.tiktok.com/abc")).toBe(true);
expect(allowedUrl("https://evil.test/?u=instagram.com")).toBe(false);
expect(allowedUrl("--exec=rm -rf ~")).toBe(false);
expect(chunkRanges(12 * 1024 * 1024, 5 * 1024 * 1024).map((c) => c.index)).toEqual([0, 1, 2]);
it("sin tarea no hace nada", async () => { /* 204 → "idle"; spawn no se llama */ });
it("descarga, sube por trozos, termina y borra el archivo", async () => { /* PUT ?indice=0..n, POST terminar { ok: true, totalBytes }; fs.rm llamado */ });
it("mantiene la reserva con un latido cada 60 s mientras descarga", async () => {});
it("si yt-dlp falla lo comunica y no sube nada", async () => { /* POST terminar { ok: false, error: "yt-dlp no pudo descargar el enlace" } */ });
it("una tarea con un enlace fuera de la lista se rechaza sin lanzar yt-dlp", async () => {});
it("la ficha nunca aparece en lo que escribe por pantalla", async () => {});
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run tests/agente-mac.test.ts` → FAIL.

- [ ] **Step 3: Implementar `lib.mjs` y `agente.mjs`.** `yt-dlp` se lanza con `spawn` y lista de argumentos (nunca shell); el archivo va a una carpeta temporal propia que se borra al terminar, pase lo que pase. Todas las conexiones son salientes por HTTPS.

- [ ] **Step 4: `agente-mac/README.md` para el dueño** (paso a paso, sin jerga). Su Mac ya tiene `yt-dlp` y `ffmpeg`, y la descarga de un reel con `--cookies-from-browser brave` está comprobada; la guía empieza por verificarlo (`yt-dlp --version`) y por comprobar Node (`node -v`, 22 o más); en la web, Ajustes → Mac → **Crear ficha** y copiarla; crear `~/.principal-agente.json`; probar con `node agente-mac/agente.mjs` (debe decir «conectado»); dejarlo siempre encendido copiando `com.principal.agente.plist` a `~/Library/LaunchAgents/` y cargándolo con `launchctl`; cómo ver si está conectado (Ajustes → Mac) y cómo pararlo. Aviso: usa la sesión de Instagram de Brave del propio Mac; para vídeos privados hay que tener esa sesión abierta en Brave.

- [ ] **Step 5: Pantallas** (cargar `impeccable` y `shadcn`). En **Referencia**, junto a «Subir vídeo»: campo **Pegar enlace** (Instagram, TikTok…). Con el Mac conectado: botón **Traer vídeo** y, mientras tanto, «El Mac está descargando el vídeo…». Sin Mac: el campo desactivado con «El Mac no está conectado: sube el archivo del vídeo.» En **Ajustes → Mac** (solo dueño): estado («Conectado · visto hace 20 s» / «Sin conexión»), **Crear ficha** (se muestra una vez, con «Copiar») y **Revocar**. Comprobar a 390 px.

Run: `npm test && npm run typecheck && npm run lint && npm run build` → PASS.

```bash
git add -A
git commit -m "Agente del Mac: programa que descarga enlaces con yt-dlp y los entrega a la web; pegar enlace en Referencia"
```

---

### Task 14: Cierre — documentos y lo que queda para los planes siguientes

**Files:**
- Modify: `docs/decisiones-produccion-de-video.md`, `README.md`, `docs/README.md`, `docs/despliegue-railway.md`
- Test: ninguna nueva (batería completa).

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la tabla de interfaces para los planes de edición, reescalado y motor de ángulos.

- [ ] **Step 1: Completar `docs/decisiones-produccion-de-video.md`**: las decisiones de «Decisiones que quedaban abiertas» tal como quedaron, las surgidas al ejecutar (versión del cliente MCP, nombres reales de la cola, qué se quitó de cada regla), y una tabla «Interfaces para los planes siguientes» con las firmas reales de `HiggsfieldPort`, `getVideoFor`, `videoView`, `requestGeneration`, `videoCosts`, `ensureMedia` y dónde quedan guardados los motivos de rechazo (`generations.rejectReason`, para la biblioteca de casos).

- [ ] **Step 2: Actualizar `README.md` y `docs/README.md`** (cómo se hace un vídeo, qué necesita cada persona, enlaces al diseño, a este plan, al informe de Higgsfield y a la guía del Mac) y repasar `docs/despliegue-railway.md` (variables nuevas: ninguna obligatoria; `PRINCIPAL_HIGGSFIELD_CLIENT` y las de ffmpeg solo si hicieron falta).

- [ ] **Step 3: Verificación final**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Documentación de la producción de vídeo: decisiones, interfaces y guía de uso"
```

---

## Decisiones que quedaban abiertas

1. **Herramientas sin interfaz en vez de las de «widget».** Los esquemas dicen que `generate_image` y `generate_video` pintan un widget para un chat y que `generate_image_batch` y `generate_video_batch` son las que «envían sin abrir un widget» y devuelven un identificador por petición para `jobs_wait`. El conector usa las `_batch`: 2 candidatas = 2 peticiones con `count: 1`.
2. **Cliente MCP.** El SDK se partió en la versión 2: el paquete de cliente es `@modelcontextprotocol/client` (2.4.0 hoy; `@modelcontextprotocol/sdk` sigue en 1.32.x). Se usa el nuevo, solo para el transporte y las llamadas. El OAuth (alta, PKCE, canje, refresco) va **escrito a mano con `fetch`**, porque así se prueba sin red y se controla el refresco simultáneo con un cerrojo por persona.
3. **Alta del cliente con vistas al 31/12/2026.** Alta dinámica por defecto y documento de metadatos (CIMD) servido por la propia web, activable con `PRINCIPAL_HIGGSFIELD_CLIENT=cimd`. La PUERTA de la Tarea 1 dice cuál sobrevive.
4. **Riesgo principal y salida.** Si Higgsfield rechaza las llamadas de una aplicación propia, todo lo demás no cambia: `HiggsfieldPort` admite otro transporte (el CLI oficial ejecutado por el agente del Mac con la sesión de cada persona, o la API de pago por uso con clave propia). No se construye ahora.
5. **No hay clave de idempotencia en Higgsfield.** Ninguna herramienta de generación acepta una. La idempotencia es nuestra (fila única por vídeo, tipo y ronda; una sola ejecución se hace con la fila). Un envío de resultado desconocido **sin identificador** solo se puede reconciliar buscando en `show_generations` una generación con el mismo prompt y modelo; con identificador, por `jobs_wait`. A los 10 minutos sin rastro se da por no enviado y la persona decide si repite.
6. **`use_unlim: false` siempre.** Si se omite, Higgsfield puede contestar con una pregunta (`unlim_choice`) sin enviar nada.
7. **La web sube un recorte, no el original.** Al Higgsfield de la persona va un MP4 normalizado de 30 s como mucho, sin audio. Así no dependemos del tamaño máximo de subida (no documentado; la importación por URL admite 50 MB) y la referencia cumple lo que Seedance acepta. Con más de 30 s se usan los primeros 30.
8. **Solo quien creó un vídeo genera en él.** Los medios subidos y los créditos son de su Higgsfield. El dueño ve los vídeos de todos, en solo lectura.
9. **Imagen: primer fotograma o referencia de la escena.** Las reglas del dueño (08/09/2026) distinguen clips simples (la imagen es el primer fotograma, `start_image`) de vídeos de varias escenas (la imagen va como primera `image_references` y no fija el arranque). El desglose propone uno u otro según los planos y la persona puede cambiarlo. En ambos casos la imagen aprobada es `@Image1`; si la PUERTA de la Tarea 11 muestra que `start_image` no cuenta al numerar, se cambia `START_IMAGE_IS_IMAGE1`.
10. **`bitrate_mode: "high"`** en todo Seedance, por la regla del dueño del 01/09/2026 (la web de Higgsfield lo manda; por defecto la API no).
11. **Modelo de imagen.** Existen los dos: `nano_banana_pro` (por defecto, el de sus reglas) y `nano_banana_2_1` (el que dice usar). Ajuste del dueño; queda preguntarle cuál.
12. **Resolución del clip elegible** (480p por defecto, 720p y 1080p), porque el reescalado queda fuera y un clip a 480p puede no bastar para publicar. Para el plan de reescalado: Seedance 2.5 tiene `draft` (borrador a 480p) y `draft_job_id` (terminarlo a más resolución en 7 días).
13. **Sin avatar.** Un vídeo necesita un avatar o la casilla «no aparece nadie» (planos de manos o de producto).
14. **12 fotos por producto** (antes 6), porque ahora incluyen avatar, embalaje y entorno. A la imagen van como mucho 9 referencias (el modelo admite 14).
15. **Lista negra y formato de los prompts: bloquean.** Las 20 palabras vetadas de la regla del dueño y los bloques con títulos en mayúsculas impiden generar, los escriba Claude o la persona; la longitud (unos 4.900 caracteres) solo avisa.
16. **Las regeneraciones no tienen excepción en esta entrega.** Tras 2, se corrige el desglose o se empieza otro vídeo. Una generación que no llegó a enviarse no cuenta.
17. **Créditos gastados = lo presupuestado de lo que se envió.** Si Higgsfield devuelve créditos por un trabajo fallido, la web no lo sabe todavía (existe la herramienta `transactions` para afinarlo).
18. **El desglose reserva en el libro alrededor de 1 US$** (24 fotogramas a 5 000 tokens cada uno, más el segundo intento del modelo de reserva) aunque cueste mucho menos; un colaborador con menos de eso libre en su tope no puede lanzarlo. Si molesta, se afina la reserva por tamaño real de imagen.
19. **Archivos temporales en el disco del contenedor.** Si Railway reinicia durante una subida, la persona vuelve a elegir el vídeo; no se guarda nada en Postgres ni en un almacén.
20. **Un solo Mac para todos.** Cualquier persona puede pegar un enlace y lo descarga el Mac del dueño con su sesión de Instagram: conviene que el dueño lo sepa (uso intensivo puede llamar la atención de Instagram).
21. **Los pasos de pago no se repiten solos.** La cola real reintenta hasta 3 veces un paso fallido. El desglose y el procesado de la referencia lanzan `StepFailedError` (un intento; repite la persona), y el envío a Higgsfield ni siquiera pasa por `runStep`.
22. **Nombres de trabajos con punto** (`video.referencia`, `video.desglose`, `video.enviar`, `video.seguimiento`, `higgsfield.sonda`), porque el registro real no admite dos puntos.
