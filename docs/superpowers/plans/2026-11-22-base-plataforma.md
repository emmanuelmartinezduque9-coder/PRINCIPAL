# Base de la plataforma (plan 1a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar en Railway la web PRINCIPAL con cuentas (dueño / colaborador), productos con propiedad aplicada en cada consulta, reglas versionadas, tope de gasto, pasarela única a Claude, cola de trabajos reanudable, bóveda de credenciales y la prueba de conexión de Higgsfield — todo lo que el motor de ángulos (plan 1b) necesita debajo.

**Architecture:** Una aplicación Next.js en la raíz del repositorio con dos procesos en el mismo servicio de Railway (web y `worker`), sobre un PostgreSQL propio. Toda lectura de datos pasa por `src/server/*` y, para productos, por una única capa de acceso (`src/server/access.ts`); toda llamada a un modelo pasa por `src/llm/gateway.ts`, que reserva saldo en el libro de gasto antes de llamar. Los pasos largos corren en pg-boss y cada paso se registra en `job_steps` con clave única antes de tocar un servicio externo.

**Tech Stack:** Next.js 16.4.6 (App Router, `src/proxy.ts`), React 19.3.0, TypeScript 5, Drizzle ORM 0.45 + drizzle-kit 0.31, `pg` 8, PostgreSQL (embebido con `embedded-postgres` 18 en local y pruebas), Tailwind 4.3.3 + shadcn/radix-ui, TanStack Query 5, zod 4, vitest 5, pg-boss, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, Node ≥ 22.13 (CI con Node 24).

**Spec:** `docs/superpowers/specs/2026-11-22-plataforma-y-motor-angulos-design.md`. La "entrega 1" del diseño se parte en dos planes: este (1a, base) y el 1b (motor de ángulos), que se escribe después.

## Global Constraints

- Repositorio `/home/user/principal` (GitHub `PRINCIPAL`, rama `main`). El código vive en la raíz, junto a `docs/`, `README.md` y `CLAUDE.md`, que se conservan.
- **No se toca `finanzas-tiendas`** (`/home/user/finanzas-tiendas`) ni su base de datos. Se lee para copiar patrones; no se importa nada de él en ejecución. `docs/reglas-origen/` tampoco se modifica (son copias literales).
- **Next.js 16 tiene cambios incompatibles** con lo que el modelo recuerda: antes de escribir código de Next hay que leer la guía correspondiente en `node_modules/next/dist/docs/` y respetar los avisos de obsolescencia. El bloque `nextjs-agent-rules` de `AGENTS.md` se copia tal cual y se confirma en git.
- Mismas versiones mayores que `finanzas-tiendas/package.json`: `next` 16.4.6, `react`/`react-dom` 19.3.0, `drizzle-orm` ^0.45, `drizzle-kit` ^0.31, `pg` ^8, `zod` ^4, `vitest` ^5, `tailwindcss` y `@tailwindcss/turbopack` 4.3.3, `typescript` ^5, `tsx` ^4, `embedded-postgres` ^18, `@tanstack/react-query` ^5, `engines.node` `>=22.13`. Dependencias nuevas (`pg-boss`, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`): última versión estable al instalar, fijada exacta; leer su README antes de usarlas.
- Nunca secretos en el repositorio. Claves solo por variables de entorno: `ANTHROPIC_API_KEY` (Claude), `VAULT_KEY` (32 bytes en base64, **distinta** de la de Finanzas), `DATABASE_URL`. Credenciales de terceros, cifradas en la base de datos.
- **Ninguna llamada a un modelo fuera de `src/llm/gateway.ts`.** Antes de escribir la pasarela, cargar la skill `claude-api` (ids de modelo, precios, caché, rechazos).
- **Toda consulta de productos pasa por `src/server/access.ts`.** Un colaborador solo ve los productos que tiene asignados; el identificador de un producto ajeno responde 404, no 403.
- Todo el texto de la interfaz en español, claro para una persona no técnica, usable a 390 px de ancho (móvil). `<html lang="es">`.
- TDD con vitest contra PostgreSQL real embebido (`tests/helpers/global-setup.ts`, `truncateAll()` en `beforeEach`). **Las pruebas no llaman a servicios de pago**: la pasarela y el cliente de Higgsfield se inyectan o se simulan.
- Un commit al terminar cada tarea, con mensaje en español. No se hace `push` hasta la Tarea 6; desde ahí, `git push origin main` tras cada tarea con CI en verde (Railway publica solo).
- **Idioma del código:** identificadores, tablas y columnas en inglés (como Finanzas); en español los textos, las rutas visibles (`/productos`, `/reglas`, `/personas`, `/gasto`), los comentarios, los mensajes de commit y los valores de papel `dueno` / `colaborador`.
- Dinero: enteros en **micro-dólares** (`…Micros`, 1 USD = 1 000 000), porque una llamada al modelo pequeño cuesta menos de un céntimo. Valores del diseño: tope mensual global **30 USD** (`30_000_000`), tope por colaborador **10 USD** (`10_000_000`). El mes es el mes natural en UTC.
- Prefijo de entorno `PRINCIPAL_` (`PRINCIPAL_AUTH=off` solo en local, `PRINCIPAL_CLOUD=1`, `PRINCIPAL_DATA_DIR`); cookie de sesión `pr_sesion`.
- Decisiones de diseño que surjan al ejecutar se apuntan en `docs/decisiones-base-plataforma.md` (regla de `CLAUDE.md`).

## Review Focus

Condiciones que el diseño implica y que ninguna prueba "de camino feliz" ejercita; cada una tiene su prueba en la tarea indicada.

1. **Dos llamadas a la vez junto al tope**: con 0,02 USD de saldo y dos reservas simultáneas de 0,015 USD, solo una pasa; el tope "no se puede superar". → Tarea 8.
2. **Foto del móvil que no vale** (HEIC de iPhone, archivo de 20 MB, un PDF renombrado a `.jpg`): mensaje claro en español y nada guardado. → Tarea 4.
3. **Persona desactivada o producto desasignado con la sesión abierta o con trabajos en cola**: la siguiente petición responde 401/404 y el trabajo pendiente se detiene sin gastar. → Tareas 3, 11 y 12.
4. **Cambio de mes o subida de tope con trabajos en pausa**: cada trabajo en pausa se reanuda una sola vez, y el gasto del mes anterior no cuenta. → Tareas 8 y 11.
5. **El proceso se cae entre "voy a llamar" y "ya tengo el resultado"**: al reiniciar, el paso no desaparece ni se cobra en silencio dos veces; el libro conserva el cargo previsto y el paso se reintenta como mucho 3 veces. → Tarea 11.

---

## Mapa de archivos

```
AGENTS.md, package.json, tsconfig.json, next.config.ts, eslint.config.mjs, vitest.config.ts,
drizzle.config.ts, components.json, .gitignore, .github/workflows/pruebas.yml
drizzle/                         migraciones generadas (npm run db:generate)
reglas/                          copia limpia de las reglas que se siembran (+ indice.json)
scripts/  dev.ts start.ts cloud.ts pg.ts
src/db/   schema.ts client.ts migrate.ts seed.ts
src/lib/  paths.ts version.ts cloud-env.ts vault.ts money.ts api.ts utils.ts
src/server/  auth.ts session-cookie.ts http.ts access.ts products.ts photos.ts
             credentials.ts spend.ts rules.ts people.ts
src/llm/  models.ts gateway.ts
src/jobs/ boss.ts steps.ts registry.ts system-check.ts
src/connectors/higgsfield/  oauth-provider.ts client.ts probe.ts
src/worker/main.ts
src/proxy.ts
src/app/  layout.tsx globals.css login/ activar/ (app)/{layout,productos,reglas,personas,gasto,higgsfield}
          api/{health,auth,productos,fotos,reglas,personas,gasto,higgsfield}
src/components/  ui/ (shadcn)  shell/  auth/  products/  rules/  people/  spend/
tests/    helpers/{global-setup.ts,fixtures.ts,fake-llm.ts}  *.test.ts
docs/     despliegue-railway.md  decisiones-base-plataforma.md  2026-12-higgsfield-prueba-conexion.md
```

---

### Task 1: Andamiaje, base de datos, salud y CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `drizzle.config.ts`, `components.json`, `.gitignore`, `AGENTS.md`, `.github/workflows/pruebas.yml`
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `src/db/seed.ts`, `src/lib/paths.ts`, `src/lib/version.ts`, `src/lib/utils.ts`, `src/lib/api.ts`
- Create: `scripts/dev.ts`, `scripts/pg.ts`, `src/worker/main.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/api/health/route.ts`
- Test: `tests/helpers/global-setup.ts`, `tests/smoke.test.ts`, `tests/version.test.ts`, `tests/migrate-guard.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `getDb(): Db`, `getPool(): Pool`, `schema` desde `@/db/client`; `runMigrations(url: string): Promise<void>`; `seed(url: string): Promise<void>`.
  - `looksLikeFinanzas(tableNames: string[]): boolean` en `src/db/migrate.ts`.
  - Tabla `settings` (`key text pk`, `value jsonb not null`, `updatedAt`) y helpers `getSetting<T>(key: string): Promise<T | null>`, `setSetting(key: string, value: unknown): Promise<void>` en `src/db/client.ts`.
  - `appVersion(env?): string`; `dataDir(): string` (`PRINCIPAL_DATA_DIR ?? ~/.principal`).
  - `truncateAll(): Promise<void>` en `tests/helpers/global-setup.ts`.
  - `GET /api/health` → `{ ok: true, version }` o 503 `{ ok: false, version }`.
  - Scripts npm: `dev`, `build`, `start`, `lint`, `test`, `typecheck`, `web`, `worker`, `db:generate`.

- [ ] **Step 1: Leer antes de escribir.** En `/home/user/finanzas-tiendas` (solo lectura): `package.json`, `AGENTS.md`, `next.config.ts`, `vitest.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `drizzle.config.ts`, `scripts/{dev,pg}.ts`, `src/db/{client,migrate}.ts`, `tests/helpers/global-setup.ts`, `.github/workflows/pruebas.yml`. Tras `npm install`, leer en `node_modules/next/dist/docs/` las guías de estructura de proyecto, route handlers y `proxy`.

- [ ] **Step 2: Crear los archivos de configuración** copiando los de Finanzas con estos cambios: `name: "principal"`; sin `imapflow`, `mailparser`, `nodemailer`, `recharts`, `@tanstack/react-table`, `@tanstack/react-virtual`, `date-fns-tz`, `cn`; sin los scripts `demo` y `local`; `db:generate` es `drizzle-kit generate` directo; `next.config.ts` sin el modo demostración y sin las dos opciones `turbopackFileSystemCache*` (eran por el disco exFAT del Mac); se conservan la regla `*.css` de Turbopack y los `._*` ignorados. `AGENTS.md` lleva el bloque `nextjs-agent-rules` idéntico. Ejecutar `npm install`.

- [ ] **Step 3: Write the failing tests**

```ts
// tests/smoke.test.ts
it("la base de datos de pruebas responde y tiene la tabla settings", async () => {
  const { rows } = await getPool().query("select to_regclass('public.settings') as t");
  expect(rows[0].t).toBe("settings");
});
it("getSetting devuelve null si no existe y el valor guardado si existe", async () => {
  expect(await getSetting("x")).toBeNull();
  await setSetting("x", { a: 1 });
  expect(await getSetting("x")).toEqual({ a: 1 });
});
it("GET /api/health responde ok con la versión", async () => {
  const body = await (await GET()).json();
  expect(body).toEqual({ ok: true, version: "local" });
});

// tests/version.test.ts
expect(appVersion({ RAILWAY_GIT_COMMIT_SHA: "abcdef1234" })).toBe("abcdef1");
expect(appVersion({})).toBe("local");

// tests/migrate-guard.test.ts — nunca migrar sobre la base de datos de Finanzas
expect(looksLikeFinanzas(["users", "supplier_orders", "stores"])).toBe(true);
expect(looksLikeFinanzas(["users", "sessions", "settings", "products"])).toBe(false);
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/smoke.test.ts tests/version.test.ts tests/migrate-guard.test.ts`
Expected: FAIL (módulos `@/db/client`, `@/lib/version` inexistentes).

- [ ] **Step 5: Implementar** `src/db/*`, `src/lib/{paths,version,utils,api}.ts`, `scripts/{dev,pg}.ts`, `tests/helpers/global-setup.ts`, la ruta de salud, `src/app/layout.tsx` (`lang="es"`, `viewport` con `width=device-width`) y `src/worker/main.ts` (por ahora solo escribe `[worker] en marcha` y se mantiene vivo hasta SIGTERM). `runMigrations` consulta `pg_tables` y lanza `"Esta base de datos es la de Finanzas: PRINCIPAL necesita la suya propia."` si `looksLikeFinanzas` (marcadores: `supplier_orders`, `stores`, `balance_transactions`). Base local: usuario/clave/base `principal`, puerto `54339` (el de Finanzas es 54329). Generar la primera migración con `npm run db:generate`.

- [ ] **Step 6: Run tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS, sin errores de tipos, compilación correcta.

- [ ] **Step 7: Crear `.github/workflows/pruebas.yml`** igual que el de Finanzas (checkout, Node 24 con caché npm, `npm ci`, `npm run typecheck`, `npm test`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Andamiaje: Next 16, Postgres con Drizzle, salud y comprobaciones de CI"
```

---

### Task 2: Cuentas — entrar, invitación de un solo uso y papeles

**Files:**
- Create: `src/server/auth.ts`, `src/server/session-cookie.ts`, `src/server/http.ts`, `src/proxy.ts`
- Create: `src/app/api/auth/{login,logout,me,activate}/route.ts`, `src/app/login/page.tsx`, `src/app/activar/page.tsx`, `src/components/auth/auth-card.tsx`
- Modify: `src/db/schema.ts` (tablas `users`, `sessions`, `invites`), `src/db/seed.ts`
- Test: `tests/auth.test.ts`, `tests/http-guard.test.ts`, `tests/owner-bootstrap.test.ts`, `tests/helpers/fixtures.ts`

**Interfaces:**
- Consumes: `getDb`, `schema`, `truncateAll` (Tarea 1).
- Produces:
  - `type Role = "dueno" | "colaborador"`; `interface AuthUser { id: number; email: string; name: string; role: Role }`.
  - Tablas: `users` (como Finanzas + `role text not null`, `spendCapMicros bigint null`, `disabledAt timestamptz null`), `sessions` (igual), `invites` (igual + `role text not null default 'colaborador'`, `invitedBy bigint null`).
  - `createInvite(email: string, name: string, options?: { role?: Role; invitedBy?: number; now?: Date }): Promise<{ token: string; expiresAt: Date }>`
  - `acceptInvite(token: string, password: string, now?: Date): Promise<AuthUser>`
  - `login(email: string, password: string, now?: Date): Promise<{ token: string; user: AuthUser; expiresAt: Date } | null>`
  - `getSessionUser(token: string, now?: Date): Promise<AuthUser | null>`; `logout(token: string): Promise<void>`; `resetLoginAttempts(): void`; `authRequired(): boolean`; `LOCAL_USER: AuthUser` (papel `dueno`, id 0); `SESSION_COOKIE = "pr_sesion"`.
  - `class HttpError extends Error { constructor(public status: number, message: string) }`
  - `interface HandleOptions { public?: boolean; role?: "dueno"; token?: () => Promise<string | undefined> }` (`token` permite a las pruebas inyectar la sesión sin cookie).
  - `handle(fn: (user: AuthUser | null) => Promise<Response>, options?: HandleOptions): Promise<Response>`; `currentUser(options?: HandleOptions): Promise<AuthUser | null>`; `badRequest(message)`, `notFound(message)`.
  - `ensureOwnerInvite(env: Record<string, string | undefined>, now?: Date): Promise<string | null>` en `src/db/seed.ts` (devuelve el enlace o `null`).
  - `tests/helpers/fixtures.ts`: `makeUser(role: Role, over?: { email?: string; name?: string }): Promise<AuthUser>`.

- [ ] **Step 1: Leer** `src/server/{auth,http,session-cookie}.ts`, `src/proxy.ts`, `src/app/{login,activar}/page.tsx`, `src/components/auth/auth-card.tsx` y `tests/{auth,http-guard}.test.ts` de Finanzas. Las constantes se copian: sesión 30 días, invitación 7 días, contraseña mínima 10 caracteres, 10 fallos → bloqueo de 15 minutos, scrypt N=16384 r=8 p=1.

- [ ] **Step 2: Write the failing tests** — copiar los casos de `auth.test.ts` y `http-guard.test.ts` de Finanzas adaptando nombres, y añadir:

```ts
// tests/auth.test.ts
it("la invitación crea la cuenta con el papel de la invitación", async () => {
  const { token } = await createInvite("ana@example.com", "Ana"); // por defecto colaborador
  expect((await acceptInvite(token, PASSWORD)).role).toBe("colaborador");
});
it("una invitación nueva a una cuenta existente cambia la contraseña pero NO el papel", async () => {
  const dueno = await makeUser("dueno", { email: "jefe@example.com" });
  const { token } = await createInvite("jefe@example.com", "Jefe", { role: "colaborador" });
  expect((await acceptInvite(token, PASSWORD)).role).toBe("dueno");
});
it("un enlace usado no vale por segunda vez", async () => { /* rejects "ya se ha usado" */ });
it("una cuenta desactivada no puede entrar y sus sesiones dejan de valer", async () => {
  const { token } = (await login("ana@example.com", PASSWORD))!;
  await getDb().update(schema.users).set({ disabledAt: new Date() }).where(eq(schema.users.id, ana.id));
  expect(await getSessionUser(token)).toBeNull();
  expect(await login("ana@example.com", PASSWORD)).toBeNull();
});

// tests/http-guard.test.ts
it("una ruta solo para el dueño responde 403 a un colaborador y no ejecuta nada", async () => {
  const response = await handle(async () => { ran = true; return ok(); }, { role: "dueno", token: tokenOf(colaborador) });
  expect(response.status).toBe(403); expect(ran).toBe(false);
  expect((await response.json()).error).toBe("Solo el dueño puede hacer esto.");
});
it("HttpError se convierte en su código", async () => {
  const r = await handle(async () => { throw new HttpError(404, "Producto no encontrado."); }, { token: tokenOf(dueno) });
  expect(r.status).toBe(404);
});

// tests/owner-bootstrap.test.ts
it("sin cuentas y con OWNER_EMAIL crea una única invitación de dueño", async () => {
  const link = await ensureOwnerInvite({ OWNER_EMAIL: "jefe@example.com", PUBLIC_URL: "https://x.up.railway.app" });
  expect(link).toMatch(/^https:\/\/x\.up\.railway\.app\/activar\?token=/);
  expect(await ensureOwnerInvite({ OWNER_EMAIL: "jefe@example.com" })).toBeNull(); // ya hay una pendiente
});
it("si ya existe alguna cuenta no crea nada", async () => { /* makeUser → null */ });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/auth.test.ts tests/http-guard.test.ts tests/owner-bootstrap.test.ts`
Expected: FAIL (`@/server/auth` no existe).

- [ ] **Step 4: Implementar el esquema y `src/server/auth.ts`, `session-cookie.ts`, `http.ts`.** `acceptInvite` inserta con `role` de la invitación y, si el correo ya existe, actualiza solo `passwordHash` y `name`. `getSessionUser` y `login` filtran `disabledAt is null`. `handle` devuelve 401 sin sesión, 403 si `options.role === "dueno"` y el papel no lo es, y el `status` de un `HttpError`. Generar migración.

- [ ] **Step 5: Implementar `ensureOwnerInvite`** y llamarla desde `seed`: si no hay usuarios ni invitación pendiente y existe `OWNER_EMAIL`, crea una invitación `dueno` y escribe en el registro `[inicio] Enlace para crear la cuenta del dueño (un solo uso, 7 días): <enlace>`.

- [ ] **Step 6: Implementar rutas y pantallas** `/login` y `/activar` (textos de Finanzas, mismo mensaje único para correo desconocido, contraseña errónea o bloqueo) y `src/proxy.ts` con el `matcher` de Finanzas sin `privacidad|mcp`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Cuentas: entrar con correo y contraseña, invitación de un solo uso y papeles dueño/colaborador"
```

---

### Task 3: Capa de acceso y productos

**Files:**
- Create: `src/server/access.ts`, `src/server/products.ts`, `src/app/api/productos/route.ts`, `src/app/api/productos/[id]/route.ts`
- Modify: `src/db/schema.ts` (tablas `products`, `product_assignments`), `tests/helpers/fixtures.ts`
- Test: `tests/access.test.ts`, `tests/products.test.ts`, `tests/boundaries.test.ts`

**Interfaces:**
- Consumes: `AuthUser`, `Role`, `HttpError`, `handle`, `makeUser` (Tarea 2).
- Produces:
  - Tabla `products`: `id bigserial pk`, `name text`, `summary text` (la frase de qué hace), `language text default 'de'`, `countries text[] default {DE,AT,CH}`, `createdBy bigint`, `createdAt`. Tabla `product_assignments`: `productId`, `userId`, `assignedBy`, `assignedAt`, clave primaria (`productId`, `userId`).
  - `type Product = typeof schema.products.$inferSelect`
  - `LANGUAGES = ["de", "it"] as const`; `COUNTRIES = ["DE", "AT", "CH", "IT"] as const`.
  - `requireUser(options?: HandleOptions): Promise<AuthUser>` — lanza `HttpError(401, "Inicia sesión para continuar.")`.
  - `requireOwner(options?: HandleOptions): Promise<AuthUser>` — lanza `HttpError(403, "Solo el dueño puede hacer esto.")`.
  - `productScope(user: AuthUser): SQL` — `sql\`true\`` para el dueño; para un colaborador, `exists` sobre `product_assignments` con su `userId`.
  - `scopedProducts(user: AuthUser)` — consulta Drizzle dinámica `select().from(products).where(productScope(user))`, a la que el llamante añade condiciones con `and(...)`.
  - `getProductFor(user: AuthUser, productId: number): Promise<Product>` — lanza `HttpError(404, "Producto no encontrado.")` si no existe **o** no es visible.
  - `createProduct(user: AuthUser, input: { name: string; summary: string; language?: string; countries?: string[] }): Promise<Product>` (si quien crea es colaborador, queda asignado a él).
  - `listProductsFor(user: AuthUser): Promise<Product[]>` (más recientes primero).
  - `setAssignments(owner: AuthUser, userId: number, productIds: number[]): Promise<void>` (sustituye el conjunto; exige `dueno`).
  - `makeProduct(creator: AuthUser, over?): Promise<Product>` en fixtures.
  - `GET/POST /api/productos`, `GET /api/productos/[id]`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/access.test.ts
it("un colaborador solo lista los productos que tiene asignados", async () => {
  // ana y luis colaboradores; el dueño crea A (asignado a ana) y B (asignado a luis)
  expect((await listProductsFor(ana)).map((p) => p.id)).toEqual([a.id]);
  expect((await listProductsFor(dueno)).map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
});
it("un colaborador NO puede leer por id un producto de otra persona: 404, no 403", async () => {
  await expect(getProductFor(ana, b.id)).rejects.toMatchObject({ status: 404, message: "Producto no encontrado." });
});
it("un id que no existe y un id ajeno dan exactamente el mismo error", async () => { /* mismo status y mensaje */ });
it("al quitar la asignación, el producto deja de verse en la siguiente consulta", async () => {
  await setAssignments(dueno, ana.id, []);
  await expect(getProductFor(ana, a.id)).rejects.toMatchObject({ status: 404 });
});
it("un colaborador no puede asignar productos", async () => {
  await expect(setAssignments(ana, ana.id, [b.id])).rejects.toMatchObject({ status: 403 });
});
it("GET /api/productos/[id] responde 404 al colaborador ajeno y 200 al asignado", async () => { /* vía handle con token */ });

// tests/products.test.ts
it("un producto nuevo nace en alemán para DE, AT y CH", async () => {
  const p = await createProduct(dueno, { name: "Eismaschine", summary: "Hace helado en 2 minutos" });
  expect(p.language).toBe("de"); expect(p.countries).toEqual(["DE", "AT", "CH"]);
});
it("el producto que crea un colaborador queda asignado a él", async () => { /* getProductFor(ana, p.id) ok */ });
it("rechaza nombre vacío, idioma desconocido y lista de países vacía con mensaje en español", async () => {
  await expect(createProduct(dueno, { name: " ", summary: "x" })).rejects.toThrow("Escribe el nombre del producto.");
  await expect(createProduct(dueno, { name: "x", summary: "x", language: "fr" })).rejects.toThrow("Idioma no disponible.");
});

// tests/boundaries.test.ts — límites que se comprueban leyendo el código fuente
it("solo access.ts y products.ts tocan las tablas de productos", () => {
  // ningún archivo de src/ fuera de src/db, src/server/access.ts y src/server/products.ts
  // contiene "schema.products" ni "schema.productAssignments"
});
it("las rutas y pantallas no abren la base de datos por su cuenta", () => {
  // ningún archivo bajo src/app o src/components importa "@/db/client"
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/access.test.ts tests/products.test.ts tests/boundaries.test.ts`
Expected: FAIL (`@/server/access` no existe).

- [ ] **Step 3: Implementar esquema, `access.ts`, `products.ts` y las rutas.** `getProductFor` hace una sola consulta `where and(eq(id), productScope(user))`: así "no existe" y "no es tuyo" son indistinguibles. `tests/boundaries.test.ts` recorre `src/` con `fs` y busca los textos. Generar migración.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Productos con propiedad: un colaborador solo ve los suyos, comprobado en cada consulta"
```

---

### Task 4: Interfaz base, pantalla Productos y fotos

**Files:**
- Create: `src/server/photos.ts`, `src/app/api/productos/[id]/fotos/route.ts`, `src/app/api/fotos/[photoId]/route.ts`
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx` (redirige a `/productos`), `src/app/(app)/productos/page.tsx`, `src/app/(app)/productos/nuevo/page.tsx`, `src/app/(app)/productos/[id]/page.tsx`
- Create: `src/components/shell/app-shell.tsx`, `src/components/providers.tsx`, `src/components/products/{product-list,product-form,photo-uploader}.tsx`, `src/components/ui/*` (shadcn: button, input, label, card, badge, dialog, select, sonner, skeleton, textarea)
- Modify: `src/db/schema.ts` (tabla `product_photos`)
- Test: `tests/photos.test.ts`

**Interfaces:**
- Consumes: `getProductFor`, `createProduct`, `listProductsFor`, `handle`, `AuthUser`.
- Produces:
  - Tabla `product_photos`: `id bigserial pk`, `productId`, `mime text`, `size integer`, `data bytea`, `createdBy`, `createdAt`.
  - `MAX_PHOTO_BYTES = 8 * 1024 * 1024`; `MAX_PHOTOS_PER_PRODUCT = 6`.
  - `detectImageType(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null` (por los primeros bytes, no por el nombre).
  - `addProductPhoto(user: AuthUser, productId: number, bytes: Buffer): Promise<{ id: number; mime: string; size: number }>`
  - `listProductPhotos(user: AuthUser, productId: number): Promise<Array<{ id: number; mime: string; size: number }>>`
  - `readProductPhoto(user: AuthUser, photoId: number): Promise<{ mime: string; data: Buffer }>` (404 si el producto de la foto no es visible).
  - `deleteProductPhoto(user: AuthUser, photoId: number): Promise<void>`
  - `POST /api/productos/[id]/fotos` (multipart, campo `foto`), `GET|DELETE /api/fotos/[photoId]`.
  - `AppShell` con navegación por papel: todos ven **Productos** y **Gasto**; el dueño ve además **Reglas** y **Personas**.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/photos.test.ts
it("guarda un JPEG y lo devuelve a quien puede ver el producto", async () => {
  const { id } = await addProductPhoto(ana, producto.id, JPEG);
  expect((await readProductPhoto(ana, id)).mime).toBe("image/jpeg");
});
it("otra persona no puede leer la foto por su id", async () => {
  await expect(readProductPhoto(luis, id)).rejects.toMatchObject({ status: 404 });
});
it("una foto HEIC de iPhone se rechaza con una explicación útil y no se guarda", async () => {
  await expect(addProductPhoto(ana, producto.id, HEIC)).rejects.toThrow(
    "Formato de foto no admitido. Usa JPG, PNG o WebP (en iPhone: Ajustes → Cámara → Formatos → «El más compatible»).");
  expect(await listProductPhotos(ana, producto.id)).toHaveLength(0);
});
it("un PDF renombrado a .jpg se rechaza", async () => { /* detectImageType(PDF) === null */ });
it("una foto de más de 8 MB se rechaza", async () => {
  await expect(addProductPhoto(ana, producto.id, bigJpeg(MAX_PHOTO_BYTES + 1))).rejects.toThrow("La foto pesa demasiado (máximo 8 MB).");
});
it("la séptima foto se rechaza", async () => { /* "Este producto ya tiene 6 fotos." */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/photos.test.ts`
Expected: FAIL (`@/server/photos` no existe).

- [ ] **Step 3: Implementar `src/server/photos.ts` y las rutas.** `bytea` con `customType` de Drizzle. Cada función llama primero a `getProductFor`. La ruta de lectura responde con `Cache-Control: private, max-age=3600`. Leer en `node_modules/next/dist/docs/` cómo recibe `formData()` un route handler y su límite de tamaño de cuerpo; si el límite por defecto es menor de 8 MB, subirlo en la configuración que indique la guía. Generar migración.

- [ ] **Step 4: Implementar la interfaz.** Leer `src/components/shell/app-shell.tsx`, `src/components/providers.tsx` y `src/components/people/people-view.tsx` de Finanzas como referencia de estilo. En móvil la navegación es una barra inferior fija; en escritorio, lateral. **Productos**: lista en tarjetas (primera foto, nombre, frase, idioma y países) y botón "Nuevo producto". **Nuevo producto**: nombre, "¿Qué hace? (una frase)", idioma (Alemán por defecto / Italiano), países (DE, AT, CH marcados por defecto) y fotos (`<input type="file" accept="image/jpeg,image/png,image/webp" multiple>`). **Detalle**: datos y fotos; nada más (el expediente llega en el plan 1b).

- [ ] **Step 5: Run tests and check the screens**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS. Además `npm run dev`, abrir `http://localhost:3000` a 390 px de ancho: crear un producto con una foto y verlo en la lista sin desplazamiento horizontal.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Pantalla Productos: lista, alta con mercado e idioma y fotos"
```

---

### Task 5: Bóveda de credenciales

**Files:**
- Create: `src/lib/vault.ts`, `src/server/credentials.ts`
- Modify: `src/db/schema.ts` (tabla `credentials`)
- Test: `tests/vault.test.ts`, `tests/credentials.test.ts`

**Interfaces:**
- Consumes: `getDb`, `dataDir`.
- Produces:
  - `encryptSecret(plain: object, context: string): string` y `decryptSecret<T>(encrypted: string, context: string): T`. Formato `v1.<claveDeDatosEnvuelta>.<iv>.<etiqueta>.<cuerpo>` (base64): una clave de datos aleatoria de 32 bytes por registro cifra el cuerpo con AES-256-GCM usando `context` como dato autenticado; la clave maestra (`VAULT_KEY`, o `dataDir()/vault.key` en local) solo envuelve la clave de datos.
  - Tabla `credentials`: `id`, `userId bigint`, `kind text`, `secretEnc text`, `meta jsonb default {}`, `createdAt`, `updatedAt`; único (`userId`, `kind`).
  - `saveCredential(userId: number, kind: string, secret: object, meta?: Record<string, unknown>): Promise<void>` (crea o sustituye; `context = \`${userId}:${kind}\``).
  - `readCredential<T>(userId: number, kind: string): Promise<{ secret: T; meta: Record<string, unknown>; updatedAt: Date } | null>`
  - `credentialStatus(userId: number, kind: string): Promise<{ connected: boolean; meta: Record<string, unknown>; updatedAt: Date | null }>` (lo único que puede llegar al navegador).
  - `deleteCredential(userId: number, kind: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/vault.test.ts
it("lo cifrado se descifra con el mismo contexto", () => {
  expect(decryptSecret(encryptSecret({ t: "abc" }, "7:higgsfield"), "7:higgsfield")).toEqual({ t: "abc" });
});
it("cifrar dos veces lo mismo da textos distintos", () => { /* not.toBe */ });
it("un texto cifrado movido a otra persona no se puede descifrar", () => {
  expect(() => decryptSecret(encryptSecret({ t: "abc" }, "7:higgsfield"), "8:higgsfield")).toThrow();
});
it("un texto manipulado no se descifra", () => { /* cambiar un carácter del cuerpo → toThrow */ });
it("VAULT_KEY que no mide 32 bytes se rechaza", () => { /* "VAULT_KEY debe ser una clave de 32 bytes en base64" */ });

// tests/credentials.test.ts
it("en la base de datos no aparece el secreto en claro", async () => {
  await saveCredential(ana.id, "higgsfield", { accessToken: "tok-secreto-123" });
  const { rows } = await getPool().query("select * from credentials");
  expect(JSON.stringify(rows)).not.toContain("tok-secreto-123");
});
it("cada persona lee solo su credencial", async () => {
  expect(await readCredential(luis.id, "higgsfield")).toBeNull();
  expect((await readCredential<{ accessToken: string }>(ana.id, "higgsfield"))!.secret.accessToken).toBe("tok-secreto-123");
});
it("credentialStatus no incluye el secreto", async () => {
  expect(JSON.stringify(await credentialStatus(ana.id, "higgsfield"))).not.toContain("tok-secreto");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/vault.test.ts tests/credentials.test.ts`
Expected: FAIL (`@/lib/vault` no existe).

- [ ] **Step 3: Implementar `vault.ts` y `credentials.ts`.** La carga de la clave maestra copia `loadKey()` de `finanzas-tiendas/src/lib/vault.ts`; el cifrado es en sobre (Finanzas cifra directamente con la clave maestra; aquí no). Generar migración.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Bóveda: credenciales de terceros cifradas en sobre y ligadas a cada persona"
```

---

### Task 6: Publicación en Railway

**Files:**
- Create: `src/lib/cloud-env.ts`, `scripts/cloud.ts`, `scripts/start.ts`, `docs/despliegue-railway.md`
- Modify: `README.md` (secciones "Usarla", "Publicar cambios", "Comandos", "Dónde está cada cosa")
- Test: `tests/cloud-env.test.ts`

**Interfaces:**
- Consumes: `runMigrations`, `seed` (con `ensureOwnerInvite`), `/api/health`.
- Produces:
  - `checkCloudEnv(env: Record<string, string | undefined>): { problems: string[]; warnings: string[] }`
  - `isCloud(env?): boolean` (`PRINCIPAL_CLOUD === "1"` o `RAILWAY_PROJECT_ID`); `publicOrigin(request: Request, env?): string`.
  - `startCloud(): Promise<void>` — comprueba, migra, siembra y lanza `next start` (0.0.0.0) y `tsx src/worker/main.ts`; si uno cae, sale con error.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cloud-env.test.ts
const ok = { DATABASE_URL: "postgres://x", VAULT_KEY: Buffer.alloc(32, 1).toString("base64"), ANTHROPIC_API_KEY: "k" };
expect(checkCloudEnv(ok)).toEqual({ problems: [], warnings: [] });
expect(checkCloudEnv({ ...ok, DATABASE_URL: undefined }).problems).toContain("Falta DATABASE_URL (la base de datos).");
expect(checkCloudEnv({ ...ok, VAULT_KEY: "corta" }).problems).toContain("VAULT_KEY debe ser una clave de 32 bytes en base64.");
expect(checkCloudEnv({ ...ok, PRINCIPAL_AUTH: "off" }).problems).toContain("En la nube no se puede desactivar el inicio de sesión (PRINCIPAL_AUTH=off).");
expect(checkCloudEnv({ ...ok, PUBLIC_URL: "http://x" }).problems).toContain("PUBLIC_URL debe empezar por https://.");
// Sin clave de Claude la web arranca (se puede entrar y crear productos); la pasarela se negará a llamar.
expect(checkCloudEnv({ ...ok, ANTHROPIC_API_KEY: undefined })).toEqual({
  problems: [], warnings: ["Falta ANTHROPIC_API_KEY: la IA no funcionará hasta añadirla."] });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cloud-env.test.ts`
Expected: FAIL (`@/lib/cloud-env` no existe).

- [ ] **Step 3: Implementar `cloud-env.ts`, `scripts/cloud.ts` y `scripts/start.ts`** siguiendo los de Finanzas (`npm start` en la nube → `startCloud`; en local → `scripts/dev.ts --prod`).

- [ ] **Step 4: Escribir `docs/despliegue-railway.md`** — pasos que hace **el dueño a mano** (el agente no tiene acceso a Railway), en español llano y numerados:
  1. En su proyecto de Railway (el mismo donde está Finanzas): **New → Database → PostgreSQL**. Renombrar el servicio a `Postgres-principal`. No usar la base de datos de Finanzas.
  2. **New → GitHub Repo → `PRINCIPAL`**, rama `main`. Renombrar el servicio a `principal`. En Settings: activar **Wait for CI** y poner **Healthcheck Path** `/api/health`.
  3. Variables del servicio `principal`: `DATABASE_URL = ${{Postgres-principal.DATABASE_URL}}`; `VAULT_KEY` = una clave **nueva** (se da el comando `openssl rand -base64 32`; guardarla también en su gestor de contraseñas: si se pierde, las conexiones guardadas dejan de poder leerse); `PRINCIPAL_CLOUD = 1`; `TZ = Europe/Berlin`; `OWNER_EMAIL` = su correo; `ANTHROPIC_API_KEY` = clave de la consola de Claude creada solo para esta web.
  4. Settings → Networking → **Generate Domain**. Copiar la dirección en la variable `PUBLIC_URL` (con `https://`).
  5. Esperar al despliegue. En **Deployments → View logs** buscar la línea `Enlace para crear la cuenta del dueño` y abrir ese enlace para elegir contraseña. Después, borrar la variable `OWNER_EMAIL`.
  6. Qué comprobar: `<dirección>/api/health` muestra `{"ok":true,...}`; se puede entrar; la pantalla Productos se abre en el móvil.
  El documento explica también cómo se publica un cambio (`git push origin main` → CI → Railway) y qué hacer si el servicio no arranca (el registro lista qué variable falta).

- [ ] **Step 5: Run tests, commit and push**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

```bash
git add -A
git commit -m "Publicación en Railway: arranque en la nube, comprobaciones y guía paso a paso para el dueño"
git push origin main
```

- [ ] **Step 6: PUERTA — necesita al dueño.** Pedirle que siga `docs/despliegue-railway.md`. La tarea termina cuando `GET <PUBLIC_URL>/api/health` devuelve `{"ok":true,"version":"<7 caracteres>"}` y él confirma que ha entrado. Apuntar la dirección publicada en `README.md` y en `docs/decisiones-base-plataforma.md`. Mientras se espera, se puede seguir con las Tareas 8–11 (no dependen del despliegue).

---

### Task 7: Prueba de conexión Higgsfield (prueba técnica)

Va lo antes posible tras publicar porque Higgsfield cambia el registro de aplicaciones el 31/12/2026 y de aquí depende la entrega 2. **Necesita la web publicada (dirección de vuelta pública) y al dueño presente para pulsar "Conectar"**; gasta unos pocos créditos, ya autorizados (diseño, respuesta 3). No bloquea las Tareas 8–14: los pasos 1–5 (código y pruebas) se hacen sin esperar a nadie; solo los pasos 6 y 7 necesitan la web publicada y al dueño.

**Files:**
- Create: `src/connectors/higgsfield/oauth-provider.ts`, `src/connectors/higgsfield/client.ts`, `src/connectors/higgsfield/probe.ts`
- Create: `src/app/api/higgsfield/{conectar,callback,estado,prueba}/route.ts`, `src/app/(app)/higgsfield/page.tsx`, `src/components/higgsfield/connection-card.tsx`
- Create: `docs/2026-12-higgsfield-prueba-conexion.md`
- Modify: `src/db/schema.ts` (tablas `oauth_pending`, `higgsfield_probe_log`), `src/worker/main.ts`
- Test: `tests/higgsfield-oauth.test.ts`

**Interfaces:**
- Consumes: `saveCredential`, `readCredential`, `credentialStatus`, `encryptSecret`/`decryptSecret`, `getSetting`/`setSetting`, `publicOrigin`, `handle`, `requireOwner`.
- Produces (lo que reutiliza la entrega 2):
  - `HIGGSFIELD_MCP_URL = "https://mcp.higgsfield.ai/mcp"`; `HIGGSFIELD_KIND = "higgsfield"`.
  - `class DbOAuthProvider implements OAuthClientProvider` (interfaz de `@modelcontextprotocol/sdk/client/auth`), construido con `{ userId: number; origin: string }`: `redirectUrl` = `${origin}/api/higgsfield/callback`; la información de cliente registrada se guarda cifrada en `settings` (`higgsfield.oauthClient`, contexto `app:higgsfield-client`); los tokens, en la bóveda de **esa persona** con `meta = { obtainedAt, expiresIn, hasRefreshToken, scope }`; el verificador PKCE y el `state`, en `oauth_pending` (`stateHash pk`, `userId`, `verifierEnc`, `expiresAt` a 10 minutos).
  - `startHiggsfieldAuth(user: AuthUser, origin: string): Promise<{ authorizeUrl: string }>`
  - `completeHiggsfieldAuth(user: AuthUser, origin: string, params: { code: string; state: string }): Promise<void>`
  - `withHiggsfield<T>(userId: number, origin: string, fn: (client: Client) => Promise<T>, deps?: { transport?: Transport }): Promise<T>` — abre el cliente MCP con el token de esa persona, lo refresca si hace falta y lo cierra.
  - `probeHiggsfield(userId: number, origin: string, deps?): Promise<{ ok: boolean; detail: string; refreshed: boolean }>` — llama a la herramienta `balance` y añade una fila a `higgsfield_probe_log` (`at`, `userId`, `ok`, `refreshed`, `detail`).

- [ ] **Step 1: Leer** el README de `@modelcontextprotocol/sdk` (cliente, `StreamableHTTPClientTransport`, sección de OAuth y la interfaz `OAuthClientProvider`). Anotar en `docs/decisiones-base-plataforma.md` la versión instalada.

- [ ] **Step 2: Write the failing tests** (sin red: `fetch` y transporte simulados)

```ts
// tests/higgsfield-oauth.test.ts
it("guardar los tokens los deja cifrados en la bóveda de esa persona", async () => {
  await new DbOAuthProvider({ userId: ana.id, origin: ORIGIN }).saveTokens({ access_token: "hf-tok-1", token_type: "Bearer", expires_in: 3600, refresh_token: "hf-ref-1" });
  const { rows } = await getPool().query("select * from credentials");
  expect(JSON.stringify(rows)).not.toContain("hf-tok-1");
  expect((await credentialStatus(ana.id, "higgsfield")).meta).toMatchObject({ expiresIn: 3600, hasRefreshToken: true });
  expect(await readCredential(luis.id, "higgsfield")).toBeNull();
});
it("la dirección de vuelta es la pública de la web", () => {
  expect(String(new DbOAuthProvider({ userId: 1, origin: "https://x.up.railway.app" }).redirectUrl)).toBe("https://x.up.railway.app/api/higgsfield/callback");
});
it("la vuelta con un state desconocido, caducado, ya usado o de otra persona se rechaza y no guarda nada", async () => {
  await expect(completeHiggsfieldAuth(luis, ORIGIN, { code: "c", state: stateDeAna })).rejects.toThrow("La conexión ha caducado o no es válida. Vuelve a pulsar «Conectar».");
  expect((await credentialStatus(luis.id, "higgsfield")).connected).toBe(false);
});
it("probeHiggsfield registra el fallo cuando el token ya no vale", async () => {
  const r = await probeHiggsfield(ana.id, ORIGIN, { transport: transporteQueResponde401 });
  expect(r.ok).toBe(false);
  expect((await getPool().query("select ok from higgsfield_probe_log")).rows).toEqual([{ ok: false }]);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/higgsfield-oauth.test.ts`
Expected: FAIL (`@/connectors/higgsfield/oauth-provider` no existe).

- [ ] **Step 4: Implementar el conector, las rutas y la pantalla `/higgsfield`** (solo dueño durante la prueba): estado de la conexión, botón **Conectar mi Higgsfield**, **Ver saldo**, **Ver herramientas disponibles** y **Generación de prueba**. La generación de prueba primero lista las herramientas, elige la de imagen más barata, muestra el coste estimado en créditos si el servidor lo ofrece y pide confirmación explícita antes de lanzar **una sola**. `src/worker/main.ts` ejecuta `probeHiggsfield` para cada persona conectada cada 6 horas (`setInterval`; la Tarea 11 lo pasa a la cola). Generar migración.

- [ ] **Step 5: Run tests, commit and push**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

```bash
git add -A
git commit -m "Higgsfield: conexión por persona con el conector oficial (prueba técnica)"
git push origin main
```

- [ ] **Step 6: PUERTA — con el dueño presente.** En la web publicada: (a) pulsar Conectar y autorizar; (b) Ver saldo; (c) una generación de prueba; (d) Ver saldo otra vez. Apuntar cada resultado. Si el registro automático de cliente falla, copiar el error literal: es el hallazgo principal.

- [ ] **Step 7: Escribir `docs/2026-12-higgsfield-prueba-conexion.md`** con: cómo se registra la web como cliente (¿registro dinámico?, ¿qué pide?) y qué se sabe del cambio del 31/12/2026; permisos concedidos; `expires_in` declarado; si hay token de refresco y si refrescar funciona; duración **observada** (tabla de `higgsfield_probe_log` tras al menos 7 días — el informe se publica con los datos del primer día y se completa después); lista de herramientas visibles para un cliente de terceros; saldo antes/después de la generación (¿se descuentan los créditos del plan?); nombres exactos de modelos de imagen vistos (para la duda "Nano Banana Pro / 2 / 2.1" del diseño); recomendación para la entrega 2 y riesgos.

```bash
git add -A
git commit -m "Informe de la prueba de conexión de Higgsfield"
git push origin main
```

---

### Task 8: Libro de gasto y topes

**Files:**
- Create: `src/server/spend.ts`, `src/lib/money.ts`
- Modify: `src/db/schema.ts` (tabla `spend_entries`)
- Test: `tests/spend.test.ts`, `tests/money.test.ts`

**Interfaces:**
- Consumes: `getDb`, `getSetting`/`setSetting`, `AuthUser`, `productScope`.
- Produces:
  - Tabla `spend_entries`: `id bigserial pk`, `createdAt`, `settledAt null`, `userId`, `productId null`, `provider text` (`"claude"` | `"datos"`), `model text null`, `stepKey text`, `status text` (`"reserved"` | `"settled"` | `"released"`), `reservedMicros bigint`, `costMicros bigint null`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens` (integer null), `detail jsonb`. Índices por `createdAt` y por `stepKey`.
  - `DEFAULT_GLOBAL_CAP_MICROS = 30_000_000`; `DEFAULT_COLLABORATOR_CAP_MICROS = 10_000_000`; clave de ajuste `spend.globalCapMicros`.
  - `monthRange(now: Date): { start: Date; end: Date }` (mes natural UTC, `end` exclusivo).
  - `class SpendCapError extends Error { scope: "global" | "persona"; capMicros: number; spentMicros: number }` con mensaje `"Se ha alcanzado el tope mensual de gasto."` / `"Has alcanzado tu tope mensual de gasto."`.
  - `reserveSpend(input: { userId: number; productId: number | null; provider: "claude" | "datos"; model?: string; stepKey: string; estimateMicros: number; now?: Date }): Promise<{ entryId: number }>`
  - `settleSpend(entryId: number, actual: { costMicros: number; inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; model?: string; detail?: unknown }): Promise<void>`
  - `releaseSpend(entryId: number): Promise<void>`
  - `hasRoom(userId: number, now?: Date): Promise<boolean>` (queda saldo > 0 en ambos topes).
  - `getGlobalCap(): Promise<number>`; `setGlobalCap(owner: AuthUser, micros: number): Promise<void>`; `setUserCap(owner: AuthUser, userId: number, micros: number): Promise<void>`.
  - `spendSummary(user: AuthUser, now?: Date): Promise<{ month: string; capMicros: number; spentMicros: number; byProduct: Array<{ productId: number | null; name: string; micros: number }>; byUser: Array<{ userId: number; name: string; micros: number; capMicros: number | null }> }>` — el dueño ve todo y el tope global; un colaborador, solo lo suyo y su tope (`byUser` con una fila).
  - `formatUsd(micros: number): string` (`"12,35 US$"`, `"0,004 US$"` por debajo de un céntimo); `parseUsd(text: string): number | null` (acepta coma o punto).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/spend.test.ts
it("sin tope configurado, el global es 30 USD y el de un colaborador 10 USD", async () => {
  expect(await getGlobalCap()).toBe(30_000_000);
  expect((await spendSummary(ana)).capMicros).toBe(10_000_000);
});
it("reservar por encima del tope personal lanza SpendCapError y no deja rastro", async () => {
  await reserveSpend({ ...base(ana), estimateMicros: 9_990_000 });
  await expect(reserveSpend({ ...base(ana), estimateMicros: 20_000 })).rejects.toMatchObject({ scope: "persona", capMicros: 10_000_000 });
  expect(await countEntries()).toBe(1);
});
it("el tope global frena aunque a la persona le quede saldo", async () => {
  await setGlobalCap(dueno, 1_000_000);
  await expect(reserveSpend({ ...base(ana), estimateMicros: 1_500_000 })).rejects.toMatchObject({ scope: "global" });
});
it("el dueño solo está limitado por el tope global", async () => { /* 15 USD al dueño pasan; 31 no */ });
it("dos reservas a la vez junto al tope: solo pasa una", async () => {
  await setUserCap(dueno, ana.id, 20_000);
  const r = await Promise.allSettled([
    reserveSpend({ ...base(ana), stepKey: "a", estimateMicros: 15_000 }),
    reserveSpend({ ...base(ana), stepKey: "b", estimateMicros: 15_000 }),
  ]);
  expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
});
it("al liquidar cuenta el coste real, no el reservado", async () => {
  const { entryId } = await reserveSpend({ ...base(ana), estimateMicros: 500_000 });
  await settleSpend(entryId, { costMicros: 42_000 });
  expect((await spendSummary(ana)).spentMicros).toBe(42_000);
});
it("una reserva liberada no cuenta", async () => { /* releaseSpend → spentMicros 0 */ });
it("el gasto del mes pasado no cuenta para el tope de este mes", async () => {
  await reserveSpend({ ...base(ana), estimateMicros: 9_990_000, now: new Date("2026-11-30T23:59:00Z") });
  await expect(reserveSpend({ ...base(ana), estimateMicros: 9_000_000, now: new Date("2026-12-01T00:01:00Z") })).resolves.toBeDefined();
});
it("una persona desactivada no puede gastar", async () => { /* disabledAt → rejects "Esta cuenta está desactivada." */ });
it("un colaborador solo ve su gasto; el dueño ve el de todos por producto y por persona", async () => { /* byUser.length */ });
it("solo el dueño cambia topes, y un tope negativo se rechaza", async () => { /* 403 / "El tope no puede ser negativo." */ });

// tests/money.test.ts
expect(formatUsd(12_350_000)).toBe("12,35 US$");
expect(formatUsd(4_000)).toBe("0,004 US$");
expect(parseUsd("12,50")).toBe(12_500_000);
expect(parseUsd("12.5")).toBe(12_500_000);
expect(parseUsd("abc")).toBeNull();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/spend.test.ts tests/money.test.ts`
Expected: FAIL (`@/server/spend` no existe).

- [ ] **Step 3: Implementar.** `reserveSpend` hace comprobación e inserción en **una transacción** que empieza con `select pg_advisory_xact_lock(<constante>)`, de modo que dos reservas nunca leen el mismo saldo. El tope efectivo de un colaborador es `users.spendCapMicros ?? DEFAULT_COLLABORATOR_CAP_MICROS`; el del dueño, ninguno (solo el global). Gastado del mes = suma de `coalesce(costMicros, reservedMicros)` de las filas `reserved` y `settled` con `createdAt` dentro de `monthRange(now)`. Generar migración.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Libro de gasto con tope mensual global y por persona, comprobado antes de cada llamada"
```

---

### Task 9: Reglas versionadas y pantalla Reglas

**Files:**
- Create: `reglas/indice.json`, `reglas/angulos-de-venta.md`, `reglas/angulos-ejemplos.md`, `reglas/angulos-metodo-juanma.md`
- Create: `src/server/rules.ts`, `src/app/api/reglas/route.ts`, `src/app/api/reglas/[slug]/route.ts`, `src/app/(app)/reglas/page.tsx`, `src/app/(app)/reglas/[slug]/page.tsx`, `src/components/rules/{rule-list,rule-editor}.tsx`
- Modify: `src/db/schema.ts` (tablas `rule_docs`, `rule_versions`), `src/db/seed.ts`
- Test: `tests/rules.test.ts`, `tests/rules-source.test.ts`

**Interfaces:**
- Consumes: `AuthUser`, `HttpError`, `handle` con `role: "dueno"`.
- Produces:
  - Tablas `rule_docs` (`slug text pk`, `title`, `description`, `position integer`) y `rule_versions` (`id`, `slug`, `version integer`, `body text`, `note text`, `createdBy bigint null`, `createdAt`; único (`slug`, `version`)). La versión vigente es la de número más alto.
  - `interface RuleSnapshot { slug: string; version: number; body: string }`
  - `loadRules(slugs: string[]): Promise<RuleSnapshot[]>` — vigentes, **ordenadas por `slug`** (orden estable para la caché); lanza `Error("Falta la regla «<slug>».")` si alguna no existe.
  - `listRules(): Promise<Array<{ slug: string; title: string; description: string; version: number; updatedAt: Date }>>`
  - `getRule(slug: string): Promise<{ slug; title; description; current: RuleSnapshot; history: Array<{ version: number; note: string; createdAt: Date; authorName: string | null }> }>`
  - `getRuleVersion(slug: string, version: number): Promise<RuleSnapshot>`
  - `saveRuleVersion(owner: AuthUser, slug: string, body: string, note: string): Promise<RuleSnapshot>` (exige `dueno`; cuerpo vacío → `"La regla no puede quedar vacía."`; cuerpo idéntico al vigente → devuelve el vigente sin crear versión).
  - `seedRules(dir?: string): Promise<void>` — por cada entrada de `reglas/indice.json` crea el documento y su versión 1 **solo si ese `slug` no tiene versiones** (nunca pisa lo que el dueño haya editado).
  - `RULE_SLUGS = { angulos: "angulos-de-venta", ejemplos: "angulos-ejemplos", metodo: "angulos-metodo-juanma" } as const`

- [ ] **Step 1: Preparar la copia limpia.** Origen (no se modifica): `docs/reglas-origen/skills-codex/angulos-de-venta/SKILL.md` y `references/{ejemplos,metodo-juanma-L_jJ3ivApwo}.md`. En `reglas/` se copia el texto **sin reescribir el criterio** y quitando solo: la cabecera YAML de skill; rutas del Mac (`/Volumes/…`, `/Users/…`); instrucciones de llamar a otras skills (`generacion-de-videos-por-idea`, `fondos-pinterest-por-toma`, "skills vigentes de imagen…"); la orden de guardar en "el expediente del motor existente"; y los enlaces relativos a `references/` (se sustituyen por el título de la otra regla). `reglas/indice.json` lleva por entrada `slug`, `title`, `description`, `file`, `source` (ruta del original). Lo quitado se enumera en `docs/decisiones-base-plataforma.md` para que el dueño pueda revisarlo.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/rules-source.test.ts — la copia limpia está limpia y conserva el criterio
for (const file of filesFromIndice()) {
  expect(text(file)).not.toMatch(/\/Volumes\/|\/Users\/|generacion-de-videos-por-idea|fondos-pinterest-por-toma|^---\nname:/m);
}
expect(text("reglas/angulos-de-venta.md")).toContain("ventas verificadas");
expect(text("reglas/angulos-de-venta.md")).toContain("normalmente 3–5");
expect(text("reglas/angulos-de-venta.md")).toContain("característica comprobada → utilidad plausible → situación reconocible → motivo para pagar");

// tests/rules.test.ts
it("la siembra crea la versión 1 de las tres reglas y repetirla no cambia nada", async () => {
  await seedRules(); await seedRules();
  expect((await listRules()).map((r) => [r.slug, r.version])).toEqual([
    ["angulos-de-venta", 1], ["angulos-ejemplos", 1], ["angulos-metodo-juanma", 1]]);
});
it("guardar crea la versión 2 y conserva la 1", async () => {
  expect((await saveRuleVersion(dueno, "angulos-de-venta", "texto nuevo", "afino criterio")).version).toBe(2);
  expect((await getRuleVersion("angulos-de-venta", 1)).body).toContain("ventas verificadas");
});
it("volver a sembrar no pisa lo que editó el dueño", async () => { /* tras v2, seedRules() → vigente sigue "texto nuevo" */ });
it("guardar el mismo texto no crea versión", async () => { /* version sigue 1 */ });
it("un colaborador no puede guardar reglas ni leerlas por la API", async () => {
  await expect(saveRuleVersion(ana, "angulos-de-venta", "x", "")).rejects.toMatchObject({ status: 403 });
  expect((await GET_reglas(tokenOf(ana))).status).toBe(403);
});
it("loadRules devuelve las vigentes ordenadas por slug y falla si falta una", async () => {
  expect((await loadRules(["angulos-metodo-juanma", "angulos-de-venta"])).map((r) => r.slug)).toEqual(["angulos-de-venta", "angulos-metodo-juanma"]);
  await expect(loadRules(["no-existe"])).rejects.toThrow("Falta la regla «no-existe».");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/rules.test.ts tests/rules-source.test.ts`
Expected: FAIL (`@/server/rules` no existe).

- [ ] **Step 4: Implementar esquema, `rules.ts`, siembra (llamada desde `seed`), rutas (todas con `role: "dueno"`) y pantallas.** **Reglas**: lista con título, descripción, versión y fecha. **Detalle**: área de texto grande con el texto vigente, campo "¿Qué has cambiado?" y botón Guardar; debajo, historial con "Ver" y "Recuperar esta versión" (recuperar guarda una versión nueva con el texto antiguo). Aviso fijo: "Los cambios se aplican a las propuestas nuevas; las ya hechas conservan la versión con la que se hicieron." Generar migración.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Reglas versionadas: copia limpia de angulos-de-venta y pantalla para que el dueño las edite"
```

---

### Task 10: Pasarela a Claude

**Files:**
- Create: `src/llm/models.ts`, `src/llm/gateway.ts`, `tests/helpers/fake-llm.ts`
- Modify: `tests/boundaries.test.ts`
- Test: `tests/llm-models.test.ts`, `tests/llm-gateway.test.ts`

**Interfaces:**
- Consumes: `reserveSpend`, `settleSpend`, `releaseSpend`, `SpendCapError` (Tarea 8); `RuleSnapshot` (Tarea 9).
- Produces:
  - `type ModelTier = "small" | "medium"`; `MODELS: Record<ModelTier, string> = { small: "claude-haiku-5-5", medium: "claude-sonnet-5-5" }`; `EFFORT: Record<ModelTier, "low" | "medium"> = { small: "low", medium: "medium" }`.
  - `interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }`
  - `computeCostMicros(model: string, usage: Usage): number` (lanza si el modelo no está en la tabla de precios).
  - `estimateMaxCostMicros(model: string, inputChars: number, maxTokens: number): number` — peor caso: `ceil(inputChars / 3)` tokens de entrada a precio de escritura en caché + `maxTokens` de salida.
  - `interface LlmCall<T> { tier: ModelTier; stepKey: string; userId: number; productId: number | null; rules: RuleSnapshot[]; instructions: string; content: Anthropic.MessageParam["content"]; maxTokens: number; schema?: z.ZodType<T> }`
  - `interface LlmResult<T> { text: string; data: T | null; model: string; usage: Usage; costMicros: number; spendEntryId: number; ruleVersions: Record<string, number> }`
  - `interface LlmGateway { call<T = unknown>(request: LlmCall<T>): Promise<LlmResult<T>> }`
  - `createGateway(deps?: { client?: Pick<Anthropic["messages"], "create">; now?: () => Date }): LlmGateway`; `getGateway(): LlmGateway` (única instancia con el cliente real).
  - Errores: `LlmNotConfiguredError` (`"Falta la clave de Claude (ANTHROPIC_API_KEY)."`), `LlmRefusalError`, `LlmTruncatedError`.
  - `tests/helpers/fake-llm.ts`: `fakeMessages(script: Array<{ text?: string; usage?: Partial<Usage>; stopReason?: string; model?: string; error?: Error }>): { client; calls: unknown[] }` — lo usa también el plan 1b.

- [ ] **Step 1: Cargar la skill `claude-api`** y leer su `typescript/claude-api/README.md` y `shared/prompt-caching.md`. De ahí salen: forma exacta de `cache_control` en bloques de `system`, nombres de los campos de `usage`, precios de escritura y lectura de caché de los dos modelos, salida estructurada con `output_config.format`, y el manejo de `stop_reason: "refusal"` con `fallbacks` para `claude-sonnet-5-5`. Datos ya confirmados (por millón de tokens): `claude-haiku-5-5` 0,10 US$ entrada / 0,50 US$ salida hasta 100 000 tokens de entrada (0,50 / 2,50 por encima); `claude-sonnet-5-5` 2 US$ entrada / 10 US$ salida / 0,10 US$ lectura de caché. Confirmar en la documentación si, al pasar de 100 000 tokens de entrada, el tramo caro de Haiku se aplica a toda la petición (así lo supone la prueba de abajo) y ajustar la prueba si no. No usar `temperature`, `budget_tokens`, `tool_choice` forzado ni prefill: devuelven error en estos modelos.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/llm-models.test.ts
expect(computeCostMicros("claude-haiku-5-5", u({ inputTokens: 10_000, outputTokens: 2_000 }))).toBe(2_000);
expect(computeCostMicros("claude-sonnet-5-5", u({ inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 100_000 }))).toBe(50_000);
expect(computeCostMicros("claude-haiku-5-5", u({ inputTokens: 200_000, outputTokens: 0 }))).toBe(100_000); // tramo > 100K
expect(() => computeCostMicros("modelo-desconocido", u({}))).toThrow();
expect(estimateMaxCostMicros("claude-sonnet-5-5", 3_000, 1_000)).toBeGreaterThanOrEqual(12_000);

// tests/llm-gateway.test.ts  (cliente simulado; nunca hay red)
it("llama al modelo del nivel pedido y apunta el coste real contra producto y persona", async () => {
  const { client, calls } = fakeMessages([{ text: "hola", usage: { inputTokens: 10_000, outputTokens: 2_000 } }]);
  const r = await createGateway({ client }).call({ ...req(ana, producto), tier: "small" });
  expect(calls[0]).toMatchObject({ model: "claude-haiku-5-5" });
  expect(r.costMicros).toBe(2_000);
  expect(await entry(r.spendEntryId)).toMatchObject({ status: "settled", userId: ana.id, productId: producto.id, costMicros: 2_000, model: "claude-haiku-5-5" });
});
it("las reglas van primero en system, con marca de caché, y las instrucciones después", async () => {
  expect(calls[0].system[0]).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
  expect(calls[0].system[0].text).toContain(reglas[0].body);
  expect(calls[0].system.at(-1).text).toBe("instrucciones del paso");
});
it("el mismo conjunto de reglas produce exactamente el mismo bloque (la caché depende de ello)", async () => { /* dos llamadas con reglas en distinto orden → system[0].text idéntico */ });
it("devuelve qué versión de cada regla se usó", async () => { expect(r.ruleVersions).toEqual({ "angulos-de-venta": 1 }); });
it("por encima del tope se niega y NO llama al modelo", async () => {
  await setUserCap(dueno, ana.id, 0);
  await expect(gateway.call(req(ana, producto))).rejects.toBeInstanceOf(SpendCapError);
  expect(calls).toHaveLength(0);
});
it("si la API falla, la reserva se libera y no se cobra", async () => { /* script [{ error }] → entry.status "released" */ });
it("un rechazo del modelo se cobra y se informa como LlmRefusalError", async () => { /* stopReason "refusal" → settled + rejects */ });
it("una respuesta cortada por max_tokens se cobra y se informa como LlmTruncatedError", async () => { /* idem */ });
it("con schema devuelve los datos validados; si no validan, falla tras cobrar", async () => { /* z.object({ ok: z.boolean() }) */ });
it("sin ANTHROPIC_API_KEY, getGateway().call lanza LlmNotConfiguredError sin reservar", async () => { /* countEntries 0 */ });

// tests/boundaries.test.ts (añadir)
it("solo src/llm importa el SDK de Anthropic", () => { /* "@anthropic-ai/sdk" no aparece en src/ fuera de src/llm/ */ });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/llm-models.test.ts tests/llm-gateway.test.ts tests/boundaries.test.ts`
Expected: FAIL (`@/llm/gateway` no existe).

- [ ] **Step 4: Implementar `models.ts` y `gateway.ts`.** Orden de una llamada: comprobar clave → `reserveSpend` (estimación de peor caso; el compromiso queda confirmado en la base de datos **antes** de la llamada) → `messages.create` → `settleSpend` con `usage` y el `model` que devuelve la respuesta (puede ser el de reserva si hubo `fallbacks`) → comprobar `stop_reason` → validar `schema`. El bloque de reglas se arma ordenando por `slug` con un separador fijo y sin fechas ni identificadores variables. `effort` según `EFFORT[tier]`. La clave se lee solo de `process.env.ANTHROPIC_API_KEY` y nunca se escribe en registros ni respuestas.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Pasarela única a Claude: dos niveles de modelo, caché de reglas, coste por producto y persona y negativa al superar el tope"
```

---

### Task 11: Cola de trabajos y pasos reanudables

**Files:**
- Create: `src/jobs/boss.ts`, `src/jobs/steps.ts`, `src/jobs/registry.ts`
- Modify: `src/db/schema.ts` (tabla `job_steps`), `src/worker/main.ts`, `src/server/spend.ts` (reanudar al subir un tope)
- Test: `tests/job-steps.test.ts`, `tests/job-queue.test.ts`

**Interfaces:**
- Consumes: `SpendCapError`, `hasRoom`, `settleSpend`, `releaseSpend` (Tarea 8); `probeHiggsfield` (Tarea 7).
- Produces:
  - Tabla `job_steps`: `key text pk`, `jobName text`, `userId bigint`, `productId bigint null`, `status text` (`"pending"` | `"running"` | `"done"` | `"failed"` | `"paused_cap"`), `attempts integer default 0`, `payload jsonb` (datos para volver a encolar), `result jsonb null`, `error text null`, `startedAt`, `finishedAt`, `updatedAt`.
  - `interface JobContext { jobName: string; userId: number; productId: number | null }`
  - `stepKey(ctx: JobContext, stepName: string, input: unknown): string` → `\`${jobName}:${productId ?? "-"}:${stepName}:${sha256(JSON estable de input).slice(0, 16)}\``. La misma clave se pasa a `LlmCall.stepKey`.
  - `runStep<T>(ctx: JobContext, key: string, fn: () => Promise<T>): Promise<T>`
  - `MAX_ATTEMPTS = 3`; `STALE_RUNNING_MS = 15 * 60 * 1000`.
  - `class JobPausedError extends Error` (el trabajo queda en pausa por tope; no es un fallo).
  - `defineJob<TData extends object>(name: string, handler: (data: TData, ctx: JobContext) => Promise<void>): void`; `enqueueJob<TData>(name: string, ctx: Omit<JobContext, "jobName">, data: TData): Promise<string>`; `startWorker(): Promise<void>`; `stopWorker(): Promise<void>`.
  - `resumePausedJobs(now?: Date): Promise<number>` — vuelve a encolar los trabajos con pasos `paused_cap` cuya persona tiene saldo (`hasRoom`); devuelve cuántos.
  - `listPausedJobs(user: AuthUser): Promise<Array<{ jobName: string; productId: number | null; userId: number; since: Date }>>` (el colaborador, solo los suyos).

- [ ] **Step 1: Leer el README de pg-boss** de la versión instalada (crear colas, `send`, `work`, `schedule`, reintentos). Anotar la versión en `docs/decisiones-base-plataforma.md`.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/job-steps.test.ts
it("un paso hecho no se vuelve a ejecutar: devuelve el resultado guardado", async () => {
  let runs = 0; const fn = async () => { runs++; return { n: 7 }; };
  expect(await runStep(ctx, "k1", fn)).toEqual({ n: 7 });
  expect(await runStep(ctx, "k1", fn)).toEqual({ n: 7 });
  expect(runs).toBe(1);
});
it("la intención queda guardada antes de ejecutar", async () => {
  await runStep(ctx, "k2", async () => { expect((await step("k2")).status).toBe("running"); return 1; });
});
it("si el paso lanza SpendCapError queda en pausa, sin contar como intento fallido", async () => {
  await expect(runStep(ctx, "k3", async () => { throw capError(); })).rejects.toBeInstanceOf(JobPausedError);
  expect(await step("k3")).toMatchObject({ status: "paused_cap", attempts: 0 });
});
it("un paso que se quedó 'running' hace más de 15 minutos se reintenta y su reserva pendiente se da por gastada", async () => {
  // fila running con startedAt hace 16 min + spend_entries 'reserved' con el mismo stepKey
  await runStep(ctx, "k4", async () => "ok");
  expect(await entryByStep("k4")).toMatchObject({ status: "settled", costMicros: RESERVADO });
  expect(await step("k4")).toMatchObject({ status: "done", attempts: 2 });
});
it("un paso 'running' reciente no se ejecuta en paralelo", async () => { /* rejects "Este paso ya está en marcha." y fn no corre */ });
it("al tercer fallo el paso queda como fallido y no se reintenta más", async () => { /* attempts 3, status "failed", 4.ª llamada lanza sin ejecutar fn */ });
it("stepKey es estable ante el orden de las claves del input y cambia si cambia el input", () => {
  expect(stepKey(ctx, "ficha", { a: 1, b: 2 })).toBe(stepKey(ctx, "ficha", { b: 2, a: 1 }));
  expect(stepKey(ctx, "ficha", { a: 1 })).not.toBe(stepKey(ctx, "ficha", { a: 2 }));
});

// tests/job-queue.test.ts (pg-boss real sobre el PostgreSQL de pruebas)
it("un trabajo encolado se ejecuta con su contexto", async () => { /* defineJob("eco") → enqueueJob → esperar → handler recibió data y ctx */ });
it("un trabajo en pausa por tope se reanuda una sola vez al subir el tope", async () => {
  await setUserCap(dueno, ana.id, 0);          // el paso del trabajo intenta reservar y queda en pausa
  await runToIdle();
  expect(await listPausedJobs(dueno)).toHaveLength(1);
  await setUserCap(dueno, ana.id, 10_000_000); // setUserCap llama a resumePausedJobs
  expect(await resumePausedJobs()).toBe(0);    // ya se reencoló: una segunda pasada no lo duplica
  await runToIdle();
  expect(handlerRuns).toBe(2); expect(await listPausedJobs(dueno)).toHaveLength(0);
});
it("sin saldo, resumePausedJobs no reencola nada", async () => { /* devuelve 0 */ });
it("el trabajo de una persona desactivada se detiene sin gastar", async () => { /* disabledAt → step failed con "Esta cuenta está desactivada.", 0 filas settled */ });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/job-steps.test.ts tests/job-queue.test.ts`
Expected: FAIL (`@/jobs/steps` no existe).

- [ ] **Step 4: Implementar `steps.ts`.** `runStep` reclama la fila con `insert … on conflict (key) do update … where` en una sola sentencia (estado `done` → devuelve `result`; `running` reciente → error; `running` antiguo o `pending`/`paused_cap` → pasa a `running`, `attempts + 1`; `failed` con `attempts >= 3` → lanza el error guardado). Al reclamar un `running` antiguo, las filas `reserved` de `spend_entries` con ese `stepKey` se liquidan por su importe reservado (no se sabe si la llamada llegó a cobrarse: el libro se queda con el caso caro). `SpendCapError` → `paused_cap`, deshace el incremento de `attempts` y lanza `JobPausedError`.

- [ ] **Step 5: Implementar `boss.ts`, `registry.ts` y el arranque en `src/worker/main.ts`.** pg-boss usa su propio esquema (`pgboss`) en la misma base de datos. Reintentos de pg-boss desactivados para los trabajos: los reintentos los decide `runStep`. Un `JobPausedError` termina el trabajo como completado (queda la fila `paused_cap` con el `payload`). Programar con `schedule`: `reanudar-pausados` cada hora (minuto 5) → `resumePausedJobs()`; `higgsfield-sonda` cada 6 horas → `probeHiggsfield` por persona conectada (sustituye al `setInterval` de la Tarea 7). `setGlobalCap` y `setUserCap` llaman a `resumePausedJobs()` al terminar (con `import()` dinámico para no crear un ciclo entre `spend.ts` y `jobs/`). Generar migración.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Cola de trabajos en Postgres con pasos de clave única: se reanudan, no se pagan dos veces y esperan si se llega al tope"
```

---

### Task 12: Pantalla Personas

**Files:**
- Create: `src/server/people.ts`, `src/app/api/personas/route.ts`, `src/app/api/personas/[id]/route.ts`, `src/app/api/personas/[id]/productos/route.ts`, `src/app/(app)/personas/page.tsx`, `src/components/people/{people-view,person-card,invite-dialog,assign-dialog}.tsx`
- Test: `tests/people.test.ts`

**Interfaces:**
- Consumes: `createInvite`, `setAssignments`, `listProductsFor`, `setUserCap`, `spendSummary`, `parseUsd`, `publicOrigin`, `handle` con `role: "dueno"`.
- Produces:
  - `listPeople(owner: AuthUser, now?: Date): Promise<{ users: Array<{ id: number; email: string; name: string; role: Role; disabled: boolean; capMicros: number | null; spentMicros: number; productIds: number[] }>; pending: Array<{ email: string; name: string; expiresAt: Date }> }>`
  - `invitePerson(owner: AuthUser, input: { email: string; name: string }, origin: string): Promise<{ link: string; expiresAt: Date }>` (siempre papel `colaborador`).
  - `setPersonDisabled(owner: AuthUser, userId: number, disabled: boolean): Promise<void>` (al desactivar borra sus sesiones).
  - `GET/POST /api/personas`; `PUT /api/personas/[id]` con `{ capUsd?: string; disabled?: boolean }`; `PUT /api/personas/[id]/productos` con `{ productIds: number[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/people.test.ts
it("invitar devuelve un enlace de un solo uso y la persona entra como colaborador", async () => {
  const { link } = await invitePerson(dueno, { email: "ana@example.com", name: "Ana" }, "https://x.up.railway.app");
  expect(link).toMatch(/^https:\/\/x\.up\.railway\.app\/activar\?token=/);
  expect((await acceptInvite(tokenFrom(link), PASSWORD)).role).toBe("colaborador");
});
it("la lista muestra de cada persona su tope, lo gastado este mes y sus productos", async () => {
  expect((await listPeople(dueno)).users.find((u) => u.id === ana.id)).toMatchObject({
    capMicros: 10_000_000, spentMicros: 42_000, productIds: [a.id], disabled: false });
});
it("un colaborador recibe 403 en todas las rutas de Personas", async () => { /* GET, POST, PUT → 403 */ });
it("PUT con capUsd '12,50' guarda 12,5 USD; con 'abc' responde 400 «Escribe un importe, por ejemplo 10 o 12,50.»", async () => {});
it("desactivar cierra sus sesiones al momento y sus productos siguen existiendo para el dueño", async () => {
  await setPersonDisabled(dueno, ana.id, true);
  expect(await getSessionUser(tokenDeAna)).toBeNull();
  expect(await listProductsFor(dueno)).toHaveLength(1);
});
it("el dueño no puede desactivarse a sí mismo", async () => { /* rejects "No puedes desactivar tu propia cuenta." */ });
it("asignar un producto que no existe responde 400 y no cambia nada", async () => {});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/people.test.ts`
Expected: FAIL (`@/server/people` no existe).

- [ ] **Step 3: Implementar `people.ts`, rutas y pantalla.** Leer `src/components/people/people-view.tsx` de Finanzas (formulario de invitación y enlace para copiar). Cada persona es una tarjeta: nombre, correo, "Gastado este mes X de Y", productos asignados, y acciones **Asignar productos** (lista con casillas), **Cambiar tope** y **Desactivar / Reactivar**. Arriba, **Invitar a una persona**: tras crearla se muestra el enlace con botón "Copiar" y el texto "Envíaselo por WhatsApp o correo. Sirve una sola vez y caduca en 7 días." Debajo, invitaciones pendientes.

- [ ] **Step 4: Run tests and check the screen**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS. En `npm run dev` a 390 px: invitar, asignar un producto y cambiar un tope.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Pantalla Personas: invitar, asignar productos, tope por persona y desactivar"
```

---

### Task 13: Pantalla Gasto y comprobación del sistema

**Files:**
- Create: `src/jobs/system-check.ts`, `src/app/api/gasto/route.ts`, `src/app/api/gasto/tope/route.ts`, `src/app/api/gasto/comprobar/route.ts`, `src/app/(app)/gasto/page.tsx`, `src/components/spend/{spend-view,cap-bar,cap-dialog,system-check}.tsx`
- Modify: `src/jobs/registry.ts`
- Test: `tests/spend-api.test.ts`, `tests/system-check.test.ts`

**Interfaces:**
- Consumes: `spendSummary`, `setGlobalCap`, `parseUsd`, `formatUsd`, `listPausedJobs`, `defineJob`, `enqueueJob`, `runStep`, `stepKey`, `LlmGateway`, `loadRules`, `RULE_SLUGS`.
- Produces:
  - `GET /api/gasto` → `{ summary, paused }` (según papel); `PUT /api/gasto/tope` `{ capUsd: string }` (dueño); `POST /api/gasto/comprobar` (dueño) → encola `sistema:comprobar`; `GET /api/gasto/comprobar` → último resultado.
  - `runSystemCheck(ctx: JobContext, deps: { gateway: LlmGateway; now?: () => Date }): Promise<{ ok: boolean; model: string; costMicros: number; at: string }>` — un paso (`runStep`) que carga la regla `angulos-de-venta` y pide al nivel `small` responder `OK` con `maxTokens: 16`; guarda el resultado en `settings` (`system.lastCheck`).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/system-check.test.ts
it("la comprobación recorre cola → reglas → pasarela → libro de gasto con el modelo pequeño", async () => {
  const { client, calls } = fakeMessages([{ text: "OK", usage: { inputTokens: 3_000, outputTokens: 2 } }]);
  const r = await runSystemCheck(ctx(dueno), { gateway: createGateway({ client }) });
  expect(r).toMatchObject({ ok: true, model: "claude-haiku-5-5" });
  expect(calls).toHaveLength(1);
  expect((await spendSummary(dueno)).spentMicros).toBe(r.costMicros);
});
it("repetir la misma comprobación dentro del mismo minuto no vuelve a pagar", async () => { /* misma clave de paso → calls.length 1 */ });

// tests/spend-api.test.ts
it("el dueño ve el total, el tope global y el desglose por producto y por persona", async () => {});
it("un colaborador solo ve su gasto y su tope, y no puede cambiar el tope (403)", async () => {});
it("PUT tope con '45' guarda 45 USD y reanuda los trabajos en pausa", async () => { /* getGlobalCap 45_000_000; listPausedJobs vacío tras runToIdle */ });
it("la respuesta incluye cuántos trabajos están en pausa por el tope", async () => { /* paused.length 1 */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/system-check.test.ts tests/spend-api.test.ts`
Expected: FAIL (`@/jobs/system-check` no existe).

- [ ] **Step 3: Implementar el trabajo, las rutas y la pantalla.** **Gasto**: arriba, "Este mes: X de Y" con barra (ámbar desde el 80 %, roja al 100 %); si hay trabajos en pausa, aviso "Hay N trabajos esperando porque se ha llegado al tope. Se reanudan solos al subirlo o al empezar el mes." con botón **Subir tope** (solo dueño); debajo, **Por producto** y **Por persona** (el colaborador solo ve su fila). Para el dueño, tarjeta **Comprobar el sistema** con botón, estado ("Todo funciona · coste 0,001 US$ · hace 2 min" o el error en claro, p. ej. "Falta la clave de Claude").

- [ ] **Step 4: Run tests, commit and push**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

```bash
git add -A
git commit -m "Pantalla Gasto: gasto por producto y persona, tope, trabajos en pausa y comprobación del sistema"
git push origin main
```

- [ ] **Step 5: Comprobación en la web publicada (con el dueño).** Tras el despliegue: entrar, abrir Gasto, pulsar **Comprobar el sistema** y ver "Todo funciona" con un coste inferior a un céntimo. Invitar a una persona de prueba, asignarle un producto y confirmar desde esa cuenta que solo ve ese producto y que no aparecen Reglas ni Personas.

---

### Task 14: Cierre — documentos e interfaces para el plan 1b

**Files:**
- Create/Modify: `docs/decisiones-base-plataforma.md`, `README.md`, `docs/README.md`
- Test: ninguna nueva (se ejecuta la batería completa).

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el documento que el plan 1b cita.

- [ ] **Step 1: Completar `docs/decisiones-base-plataforma.md`** con: las decisiones de la sección "Decisiones que el diseño dejaba abiertas" de este plan, las que hayan surgido al ejecutar (versiones fijadas de `pg-boss`, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`; qué se quitó en la copia limpia de las reglas; dirección publicada) y la tabla "Interfaces para el plan 1b" de abajo con las firmas **tal como quedaron en el código**.

- [ ] **Step 2: Actualizar `README.md`** (cómo se usa, cómo se publica, comandos, dónde está cada cosa, enlaces al diseño, a este plan, a la guía de Railway y al informe de Higgsfield) y `docs/README.md` (índice de documentos).

- [ ] **Step 3: Verificación final**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: todo en verde.

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "Documentación de la base: decisiones, interfaces para el motor de ángulos y guía de uso"
git push origin main
```

---

## Interfaces para el plan 1b

El motor de ángulos se construye **solo** sobre esto; no abre la base de datos de productos ni llama a un modelo por otra vía.

| Qué | De dónde | Firma |
|---|---|---|
| Persona actual y papel | `@/server/access` | `requireUser()`, `requireOwner()`, `AuthUser { id, email, name, role }` |
| Producto visible | `@/server/access` | `getProductFor(user, productId): Promise<Product>` (404 si no es suyo), `scopedProducts(user)`, `productScope(user): SQL` |
| Fotos del producto | `@/server/photos` | `listProductPhotos(user, productId)`, `readProductPhoto(user, photoId)` |
| Reglas vigentes | `@/server/rules` | `loadRules(slugs): Promise<RuleSnapshot[]>`, `RULE_SLUGS` |
| Llamar a Claude | `@/llm/gateway` | `getGateway().call<T>(LlmCall<T>): Promise<LlmResult<T>>`; niveles `"small"` (extraer, etiquetar) y `"medium"` (ángulos, ganchos) |
| Gasto de otros servicios | `@/server/spend` | `reserveSpend({ provider: "datos", … })` → `settleSpend` / `releaseSpend`; `SpendCapError` |
| Trabajos largos | `@/jobs/registry`, `@/jobs/steps` | `defineJob`, `enqueueJob`, `runStep(ctx, key, fn)`, `stepKey(ctx, nombre, input)`, `JobContext` |
| Credenciales de terceros | `@/server/credentials` | `saveCredential`, `readCredential`, `credentialStatus` |
| Rutas de la API | `@/server/http` | `handle(fn, { role? })`, `HttpError`, `badRequest`, `notFound` |
| Pruebas | `tests/helpers` | `makeUser`, `makeProduct`, `fakeMessages`, `truncateAll` |

Reglas de uso para 1b: toda función de servidor que reciba un `productId` empieza por `getProductFor(user, productId)`; toda tabla nueva cuelga de `productId`; cada llamada a la pasarela va dentro de un `runStep` y usa la misma clave como `stepKey`; `tests/boundaries.test.ts` se amplía con las tablas nuevas.

## Lo que viene en el plan 1b

Expediente del producto (ficha en hechos, afirmaciones sin comprobar, enlaces, aprobación del dueño) · abanico de audiencias y usos · voz del cliente con comprobación literal de citas · componente de vídeos competidores (descarga, fotogramas, texto en pantalla) y mapa ocupado/libre por plataforma con "datos insuficientes" · ángulos ordenados con "basado en estos casos" · ganchos en alemán y brief con filtro de afirmaciones arriesgadas · historial y estados ganador/quemado · biblioteca de Casos · prueba corta de la fuente de datos (ScrapeCreators / Apify / Trendtrack). Reglas que se cargan entonces: la parte de `adaptacion-de-conceptos` que afecta al brief, el borrador del filtro de afirmaciones para Alemania ("sin revisión legal") y los umbrales de ocupación editables. Permisos pendientes de confirmar con el dueño: que los colaboradores elijan ángulos y ganchos mientras los hechos del expediente y las afirmaciones delicadas los aprueba él.

## Decisiones que el diseño dejaba abiertas

1. **Orden.** El diseño dice que la prueba de Higgsfield es la primera tarea; necesita una dirección pública de vuelta, así que va en cuanto la web está publicada (Tarea 7), antes del gasto, las reglas, la pasarela y la cola.
2. **Asignación de productos.** Tabla de asignaciones (un producto puede estar asignado a varias personas); lo que crea un colaborador queda asignado a él; el dueño ve todo. Un producto ajeno responde 404.
3. **Primera cuenta.** Con la variable `OWNER_EMAIL` y sin cuentas, la web crea una invitación de dueño y escribe el enlace en el registro de Railway (el agente no tiene acceso a Railway ni a su base de datos). Desde la interfaz solo se invita a colaboradores.
4. **Fotos** en PostgreSQL (`bytea`), máximo 6 por producto y 8 MB cada una, JPG/PNG/WebP. Evita montar un volumen o un almacén de archivos; si el plan 1b guarda vídeos, se revisa.
5. **Dinero en micro-dólares; mes natural en UTC.** El tope se aplica por **reserva previa** del peor caso y liquidación con el coste real; ante la duda (caída a mitad de llamada) el libro conserva el importe reservado.
6. **El dueño no tiene tope personal**, solo el global. Un colaborador nuevo nace con 10 USD.
7. **Desactivar personas** (no estaba en el diseño): hace falta para retirar el acceso a quien deja de colaborar sin borrar su historial de gasto.
8. **Modelos:** pequeño `claude-haiku-5-5`, mediano `claude-sonnet-5-5`.
9. **Cifrado en sobre** con contexto `persona:tipo` (Finanzas cifra directamente con la clave maestra); `VAULT_KEY` propia, no la de Finanzas.
10. **Base de datos propia** (`Postgres-principal`) en el mismo proyecto de Railway, y la web se niega a migrar si detecta tablas de Finanzas.
11. **Reglas sembradas en 1a:** `angulos-de-venta` y sus dos referencias. La siembra nunca pisa una regla ya editada.
12. **Sin los apaños del disco exFAT** de Finanzas (caché de Turbopack desactivada, generación de migraciones en carpeta temporal); se conservan los `._*` ignorados, que no molestan.
