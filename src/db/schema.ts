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

/**
 * Archivos ya subidos al Higgsfield de cada persona, por su huella SHA-256: el mismo archivo de
 * la misma persona no se sube dos veces. Solo `src/server/higgsfield.ts` la toca. Sin clave ajena,
 * igual que `credentials`.
 */
export const higgsfieldMedia = pgTable(
  "higgsfield_media",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    /** `image` o `video`. */
    type: text("type").notNull(),
    mediaId: text("media_id").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("higgsfield_media_user_sha256").on(t.userId, t.sha256),
    check("higgsfield_media_type_valid", sql`${t.type} in ('image', 'video')`),
  ],
);

/**
 * Vídeos de un producto: cada uno parte de un vídeo de referencia y lo continúa (y lo paga, con
 * su Higgsfield) solo quien lo creó. Solo `src/server/videos/` toca esta tabla y las dos
 * siguientes, y siempre después de comprobar el producto con `getProductFor`. `created_by` sin
 * clave ajena, igual que `products.created_by`.
 */
export const videos = pgTable(
  "videos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    title: text("title").notNull(),
    /** `none`, `uploading`, `processing`, `ready` o `failed`. */
    referenceStatus: text("reference_status").notNull().default("none"),
    /** Por qué falló la referencia, en español y apto para la persona. */
    referenceError: text("reference_error"),
    /** `file` (subida desde el navegador) o `link` (descargada por el agente del Mac). */
    referenceSource: text("reference_source"),
    referenceUrl: text("reference_url"),
    referenceDurationMs: integer("reference_duration_ms"),
    referenceWidth: integer("reference_width"),
    referenceHeight: integer("reference_height"),
    /** El recorte normalizado, ya subido al Higgsfield de quien creó el vídeo. */
    referenceMediaId: text("reference_media_id"),
    /** Tramo de la referencia que se usa: su duración, con tope de 30 s. */
    segmentDurationMs: integer("segment_duration_ms"),
    /** Cortes de plano dentro del tramo, en milisegundos. */
    cutsMs: jsonb("cuts_ms").$type<number[]>(),
    /** Si se borra la foto, la elección se queda vacía. */
    avatarPhotoId: bigint("avatar_photo_id", { mode: "number" }).references(() => productPhotos.id, { onDelete: "set null" }),
    environmentPhotoId: bigint("environment_photo_id", { mode: "number" }).references(() => productPhotos.id, {
      onDelete: "set null",
    }),
    noPerson: boolean("no_person").notNull().default(false),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("videos_product").on(t.productId, t.createdAt),
    index("videos_reference_status").on(t.referenceStatus),
    check("videos_reference_status_valid", sql`${t.referenceStatus} in ('none', 'uploading', 'processing', 'ready', 'failed')`),
    check("videos_reference_source_valid", sql`${t.referenceSource} is null or ${t.referenceSource} in ('file', 'link')`),
  ],
);

/** Fotogramas de la referencia (JPEG), en la propia base de datos. El vídeo en sí no se guarda. */
export const videoFrames = pgTable(
  "video_frames",
  {
    videoId: bigint("video_id", { mode: "number" })
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    timeMs: integer("time_ms").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
  },
  (t) => [unique("video_frames_video_index").on(t.videoId, t.index)],
);

/**
 * Subidas por trozos de un vídeo de referencia. El identificador es aleatorio y es también el
 * nombre del archivo temporal; `received` cuenta los trozos ya escritos. La sube la persona
 * (`user_id`, siempre quien creó el vídeo) o, en su nombre, una tarea del agente del Mac
 * (`agent_task_id`). Las de más de 24 h se borran con su archivo.
 */
export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: text("id").primaryKey(),
    videoId: bigint("video_id", { mode: "number" })
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    agentTaskId: bigint("agent_task_id", { mode: "number" }),
    filename: text("filename").notNull(),
    totalBytes: integer("total_bytes").notNull(),
    received: integer("received").notNull().default(0),
    /** Tipo comprobado por el contenido del primer trozo. */
    mime: text("mime"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [index("upload_sessions_video").on(t.videoId), index("upload_sessions_created").on(t.createdAt)],
);
