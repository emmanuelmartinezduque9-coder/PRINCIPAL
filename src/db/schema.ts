import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  timestamp,
} from "drizzle-orm/pg-core";

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Ajustes sueltos de la aplicación: una clave y un valor JSON. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
});

/** Cuentas. `role` es `dueno` o `colaborador`; una cuenta desactivada conserva sus datos pero no entra. */
export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  /** Tope mensual propio, en micro-dólares; `null` usa el tope por defecto. */
  spendCapMicros: bigint("spend_cap_micros", { mode: "number" }),
  disabledAt: instant("disabled_at"),
  createdAt: instant("created_at").notNull().defaultNow(),
});

/** Sesiones abiertas. Se guarda la huella del identificador, nunca el identificador. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    lastSeenAt: instant("last_seen_at").notNull().defaultNow(),
    expiresAt: instant("expires_at").notNull(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/** Enlaces de un solo uso para que cada persona elija su contraseña. */
export const invites = pgTable("invites", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("colaborador"),
  invitedBy: bigint("invited_by", { mode: "number" }),
  createdAt: instant("created_at").notNull().defaultNow(),
  expiresAt: instant("expires_at").notNull(),
  usedAt: instant("used_at"),
});

/**
 * Productos. Solo `src/server/access.ts` y `src/server/products.ts` consultan esta tabla y la de
 * asignaciones: así cada consulta respeta qué productos puede ver cada persona.
 */
export const products = pgTable("products", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  /** La frase de qué hace el producto. */
  summary: text("summary").notNull(),
  language: text("language").notNull().default("de"),
  countries: text("countries").array().notNull().default(sql`'{DE,AT,CH}'::text[]`),
  /** Sin clave ajena: el dueño en el propio ordenador (id 0) no tiene fila en `users`. */
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: instant("created_at").notNull().defaultNow(),
});

/** Qué colaborador puede ver qué producto. El dueño los ve todos sin necesidad de asignación. */
export const productAssignments = pgTable(
  "product_assignments",
  {
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedBy: bigint("assigned_by", { mode: "number" }).notNull(),
    assignedAt: instant("assigned_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.userId] }), index("product_assignments_user").on(t.userId)],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Fotos de los productos, guardadas en la propia base de datos. Solo `src/server/photos.ts`
 * las lee o escribe, y siempre después de comprobar el producto con `getProductFor`.
 */
export const productPhotos = pgTable(
  "product_photos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    /** Papel de la foto (`PHOTO_ROLES` en `src/server/photos.ts`); el servidor valida el valor. */
    role: text("role").notNull().default("articulo"),
    /** Sin clave ajena, igual que `products.created_by`: el dueño local (id 0) no tiene fila en `users`. */
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("product_photos_product").on(t.productId, t.id),
    check("product_photos_role_valid", sql`${t.role} in ('articulo', 'embalaje', 'avatar', 'entorno', 'otro')`),
  ],
);

/**
 * Credenciales de terceros por persona (p. ej. Higgsfield). `secret_enc` es cifrado en sobre
 * (`src/lib/vault.ts`) ligado a `user_id:kind`. Solo `src/server/credentials.ts` la toca.
 * Sin clave ajena, igual que `products.created_by`: el dueño local (id 0) no tiene fila en `users`.
 */
export const credentials = pgTable(
  "credentials",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    kind: text("kind").notNull(),
    secretEnc: text("secret_enc").notNull(),
    /** Datos no secretos que sí pueden verse (p. ej. el nombre de la cuenta conectada). */
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("credentials_user_kind").on(t.userId, t.kind)],
);

/**
 * Libro de gasto: cada llamada de pago reserva antes de llamar y luego se liquida con el coste
 * real (o se libera si no llegó a gastar). Solo `src/server/spend.ts` la toca. Importes en
 * micro-dólares. Sin claves ajenas: un cargo no debe desaparecer al borrar un producto, y el
 * dueño local (id 0) no tiene fila en `users`.
 */
export const spendEntries = pgTable(
  "spend_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    createdAt: instant("created_at").notNull().defaultNow(),
    settledAt: instant("settled_at"),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    productId: bigint("product_id", { mode: "number" }),
    /** `claude` o `datos`. */
    provider: text("provider").notNull(),
    model: text("model"),
    stepKey: text("step_key").notNull(),
    /** `reserved`, `settled` o `released`. */
    status: text("status").notNull(),
    reservedMicros: bigint("reserved_micros", { mode: "number" }).notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    detail: jsonb("detail"),
  },
  (t) => [index("spend_entries_created").on(t.createdAt), index("spend_entries_step").on(t.stepKey)],
);

/** Documentos de reglas que el dueño puede editar (p. ej. el criterio de ángulos de venta). Solo `src/server/rules.ts` los toca. */
export const ruleDocs = pgTable("rule_docs", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  position: integer("position").notNull().default(0),
});

/**
 * Cada guardado de una regla es una versión nueva; la vigente es la de número más alto y las
 * anteriores no se tocan. `created_by` es nulo cuando guarda el dueño local (id 0, sin fila en `users`)
 * o cuando es la versión 1 sembrada desde `reglas/`. Sin claves ajenas, igual que el libro de gasto.
 */
export const ruleVersions = pgTable(
  "rule_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    slug: text("slug").notNull(),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    note: text("note").notNull().default(""),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [unique("rule_versions_slug_version").on(t.slug, t.version)],
);

/**
 * Pasos de los trabajos en segundo plano: una fila por paso, con clave única, que se confirma
 * antes de tocar un servicio externo. Un paso hecho guarda su resultado y no se vuelve a
 * ejecutar. `payload` son los datos con los que se encoló el trabajo (lo que hace falta para
 * volver a encolarlo); un paso que no viene de un trabajo encolado no lo tiene. Solo `src/jobs/`
 * la toca. Sin claves ajenas, igual que el libro de gasto.
 */
export const jobSteps = pgTable(
  "job_steps",
  {
    key: text("key").primaryKey(),
    jobName: text("job_name").notNull(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    productId: bigint("product_id", { mode: "number" }),
    /** `pending`, `queued`, `running`, `done`, `failed` o `paused_cap`. */
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    payload: jsonb("payload"),
    result: jsonb("result"),
    error: text("error"),
    startedAt: instant("started_at"),
    /** Última señal de vida del proceso que lo ejecuta; se renueva mientras el paso está en marcha. */
    heartbeatAt: instant("heartbeat_at"),
    finishedAt: instant("finished_at"),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [index("job_steps_status").on(t.status)],
);

/**
 * Conexiones de Higgsfield a medio hacer: una fila por cada «Conectar» pulsado, hasta que vuelve
 * la persona (o caduca a los 10 minutos). Se guarda la huella del `state`, nunca el `state`, y el
 * verificador PKCE cifrado y ligado a la persona y a esa huella. Un `state` vale una sola vez
 * (`delete … returning`). Solo `src/connectors/higgsfield/oauth.ts` la toca. Sin clave ajena,
 * igual que `credentials`.
 */
export const oauthPending = pgTable(
  "oauth_pending",
  {
    stateHash: text("state_hash").primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    verifierEnc: text("verifier_enc").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    expiresAt: instant("expires_at").notNull(),
  },
  (t) => [index("oauth_pending_user").on(t.userId)],
);

/**
 * Sonda periódica de cada conexión de Higgsfield (cuánto dura el permiso, si refrescar funciona).
 * Nunca guarda permisos: solo si fue bien, si hubo refresco y un detalle corto.
 * Solo `src/server/higgsfield.ts` la toca.
 */
export const higgsfieldProbeLog = pgTable(
  "higgsfield_probe_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: instant("at").notNull().defaultNow(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    ok: boolean("ok").notNull(),
    refreshed: boolean("refreshed").notNull(),
    detail: text("detail"),
  },
  (t) => [index("higgsfield_probe_log_user").on(t.userId, t.at)],
);
