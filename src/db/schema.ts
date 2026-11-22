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
  uniqueIndex,
  timestamp,
  type AnyPgColumn,
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
  /**
   * Avatar habitual de los vídeos nuevos: `elegido` (la foto de `default_avatar_photo_id` o, si
   * no hay, la primera foto con papel avatar), `sin_sustitucion` o `nadie`.
   */
  defaultAvatarMode: text("default_avatar_mode").notNull().default("elegido"),
  defaultAvatarPhotoId: bigint("default_avatar_photo_id", { mode: "number" }).references((): AnyPgColumn => productPhotos.id, {
    onDelete: "set null",
  }),
  /** Emoji que acompaña al nombre en toda la web (1–16 caracteres, para los compuestos). */
  emoji: text("emoji"),
  /** Archivado por el dueño: sale de las listas y selectores, pero no se borra nada. */
  archivedAt: instant("archived_at"),
}, (t) => [
  check("products_emoji_length", sql`${t.emoji} is null or char_length(${t.emoji}) between 1 and 16`),
  check("products_default_avatar_mode_valid", sql`${t.defaultAvatarMode} in ('elegido', 'sin_sustitucion', 'nadie')`),
  check("products_default_avatar_only_chosen", sql`${t.defaultAvatarMode} = 'elegido' or ${t.defaultAvatarPhotoId} is null`),
]);

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

/** Tope de la imagen de un avatar de la biblioteca (el mismo que el de una foto de producto). */
export const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

/**
 * Biblioteca global de avatares: las personas que pueden salir en los vídeos de cualquier
 * producto. Todos los ven; solo el dueño los sube o cambia. Solo `src/server/avatars.ts` lee o
 * escribe esta tabla. No se borran: se retiran (`retired`), y un avatar retirado ya no se elige
 * solo ni sale en los selectores, pero los vídeos que ya lo llevan lo conservan.
 */
export const avatars = pgTable(
  "avatars",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** El selector de siempre («mujer 7»): único. */
    name: text("name").notNull(),
    /** `mujer`, `hombre`, `nina`, `nino` u `otro`. */
    group: text("group").notNull(),
    /** El número dentro de su grupo («mujer 7» → 7), si lo tiene. */
    number: integer("number"),
    /** Edad aproximada en años; `null` hasta que el dueño la ponga. */
    ageYears: integer("age_years"),
    /** Rasgos o región (`aleman`, `nordico`, `latino`…), en minúsculas y sin tildes. */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    description: text("description"),
    /** `image/jpeg`, `image/png` o `image/webp`, según el contenido. */
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    data: bytea("data").notNull(),
    /** El identificador en el Higgsfield del dueño, si ya lo tenía (informativo: cada persona sube el suyo con `ensureMedia`). */
    higgsfieldMediaId: text("higgsfield_media_id"),
    retired: boolean("retired").notNull().default(false),
    /** Sin clave ajena, igual que `products.created_by`. */
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("avatars_sha256").on(t.sha256),
    uniqueIndex("avatars_name").on(t.name),
    check("avatars_group_valid", sql`${t.group} in ('mujer', 'hombre', 'nina', 'nino', 'otro')`),
    check("avatars_name_length", sql`char_length(${t.name}) between 1 and 60`),
    check("avatars_age_valid", sql`${t.ageYears} is null or ${t.ageYears} between 0 and 120`),
    check("avatars_number_valid", sql`${t.number} is null or ${t.number} > 0`),
    check("avatars_description_length", sql`${t.description} is null or char_length(${t.description}) <= 500`),
    check("avatars_size_valid", sql`${t.size} > 0 and ${t.size} <= ${sql.raw(String(MAX_AVATAR_BYTES))}`),
    check("avatars_mime_valid", sql`${t.mime} in ('image/jpeg', 'image/png', 'image/webp')`),
  ],
);

/**
 * Variantes de un producto (colores, modelos): qué fotos de artículo (en orden) y qué foto de
 * embalaje la representan. Un vídeo con variante usa solo esas fotos. Solo `src/server/variants.ts`
 * lee o escribe esta tabla, siempre después de comprobar el producto con `getProductFor`. Las fotos
 * de artículo van en una lista (sin clave ajena): una foto borrada deja de salir sola.
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    articlePhotoIds: bigint("article_photo_ids", { mode: "number" }).array().notNull().default(sql`'{}'::bigint[]`),
    packagingPhotoId: bigint("packaging_photo_id", { mode: "number" }).references(() => productPhotos.id, { onDelete: "set null" }),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_variants_product_name").on(t.productId, t.name),
    check("product_variants_name_length", sql`char_length(${t.name}) between 1 and 60`),
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
 * Lotes: una lista de vídeos (de uno o varios productos) que se trabajan a la vez. Lo ve quien lo
 * creó y el dueño; dentro, cada persona solo ve los vídeos de los productos que ve. Solo
 * `src/server/videos/` toca esta tabla. `created_by` sin clave ajena, igual que en `videos`.
 */
export const batches = pgTable(
  "batches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    /** «Desglosar al subir»: pedir el desglose de cada vídeo en cuanto su referencia está lista. */
    autoAnalyze: boolean("auto_analyze").notNull().default(true),
    /**
     * «Enviar lote» (`src/server/videos/lote.ts`): `borrador` → `preguntas` → `imagenes` →
     * `revision_imagenes` → `clips` → `listo` (clips hechos; se montan en el Mac) → `montado` (cada
     * montaje terminado o fallido con su motivo), o `pausado` (con `pause`) por saldo, precio o un fallo.
     */
    status: text("status").notNull().default("borrador"),
    /** El total que autorizó quien envió el lote (imágenes + estimación de los clips), en créditos. */
    budgetCredits: integer("budget_credits"),
    /** Lo previsto por vídeo al confirmar: `{ [videoId]: { frame, clip } }`, en créditos. */
    estimates: jsonb("estimates").$type<Record<string, { frame: number; clip: number }>>(),
    /** Por qué está en pausa y desde qué estado (`from`); `null` si no lo está. */
    pause: jsonb("pause").$type<{
      kind: "saldo" | "precio" | "presupuesto" | "fallo";
      reason: string;
      from: string;
      /** Créditos de más que hay que autorizar para seguir (precio o presupuesto). */
      extraCredits: number;
      /** El vídeo que lo causó, si es uno (para «Saltar»). */
      videoId: number | null;
      /** Precio nuevo de ese vídeo, si la pausa es por precio. */
      kindOf: "frame" | "clip" | null;
      quoted: number | null;
    }>(),
    sentAt: instant("sent_at"),
    /** Cuándo se confirmó el presupuesto: lo que se pide desde entonces cuenta contra él. */
    confirmedAt: instant("confirmed_at"),
    /** Último «Continuar»: lo que falló antes se puede volver a pedir. */
    resumedAt: instant("resumed_at"),
    /** Reserva de quien está avanzando el lote (un solo avance a la vez). */
    advancingAt: instant("advancing_at"),
  },
  (t) => [
    index("batches_created_by").on(t.createdBy, t.createdAt),
    index("batches_status").on(t.status),
    check(
      "batches_status_valid",
      sql`${t.status} in ('borrador', 'preguntas', 'imagenes', 'revision_imagenes', 'clips', 'listo', 'montado', 'pausado')`,
    ),
    check("batches_budget_valid", sql`${t.budgetCredits} is null or ${t.budgetCredits} >= 0`),
  ],
);

/**
 * Lo que un lote dice de uno de sus productos: las «Indicaciones para los vídeos de {producto}»
 * (llegan al desglose de cada vídeo de ese producto en ese lote) y la «Edición de referencia» del
 * grupo (la que usan los vídeos del grupo que no tienen la suya). La fila existe mientras tenga
 * alguna de las dos. Solo `src/server/videos/` toca esta tabla.
 */
export const batchProducts = pgTable(
  "batch_products",
  {
    batchId: bigint("batch_id", { mode: "number" })
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    notes: text("notes"),
    /** «Edición de referencia» del grupo: un enlace admitido (como `videos.edit_reference_url`) o `null`. */
    editReferenceUrl: text("edit_reference_url"),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.batchId, t.productId] }),
    check("batch_products_notes_length", sql`${t.notes} is null or char_length(${t.notes}) between 1 and 4000`),
    check(
      "batch_products_edit_reference_url_valid",
      sql`${t.editReferenceUrl} is null or (char_length(${t.editReferenceUrl}) <= 2000 and ${t.editReferenceUrl} like 'https://%')`,
    ),
    check("batch_products_not_empty", sql`${t.notes} is not null or ${t.editReferenceUrl} is not null`),
  ],
);

/**
 * Vídeos de un producto: cada uno parte de un vídeo de referencia y lo continúa (y lo paga, con
 * su Higgsfield) solo quien lo creó. Solo `src/server/videos/` toca esta tabla y las dos
 * siguientes, y siempre después de comprobar el producto con `getProductFor`. `created_by` sin
 * clave ajena, igual que `products.created_by`.
 */
/** Tope de una canción guardada (la mayor de la biblioteca real pesa 13 MB). */
export const MAX_SONG_BYTES = 25 * 1024 * 1024;
/** Lo más que pesa un vídeo montado (`edits.data`). */
export const MAX_EDIT_BYTES = 200 * 1024 * 1024;
/** Lo más largo de cada rótulo del montaje. */
export const MAX_EDIT_TEXT = 200;

/**
 * Biblioteca de canciones, común a todas las personas: todos las ven y las eligen; solo el dueño
 * las sube, cambia o borra. Solo `src/server/songs.ts` lee o escribe esta tabla. El audio va en la
 * propia base de datos, como las fotos. `drop_ms` es el marcador humano del drop (el ancla que se
 * alinea con el primer fotograma del cuerpo) y `start_ms`, el segundo desde el que suena.
 */
export const songs = pgTable(
  "songs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    title: text("title").notNull(),
    /** El número de la biblioteca antigua («canción 12»); `null` si no tiene. */
    number: integer("number"),
    /** Secciones o carpetas de la biblioteca («navideñas», «eiswerk»…). */
    sections: text("sections").array().notNull().default(sql`'{}'::text[]`),
    durationMs: integer("duration_ms").notNull(),
    sha256: text("sha256").notNull(),
    /** `audio/mpeg`, `audio/mp4` o `audio/wav`, según el contenido. */
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    dropMs: integer("drop_ms"),
    startMs: integer("start_ms").notNull().default(0),
    /** Sin clave ajena: el dueño en el propio ordenador (id 0) no tiene fila en `users`. */
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("songs_sha256").on(t.sha256),
    check("songs_title_length", sql`char_length(${t.title}) between 1 and 200`),
    check("songs_size_valid", sql`${t.size} > 0 and ${t.size} <= ${sql.raw(String(MAX_SONG_BYTES))}`),
    check("songs_mime_valid", sql`${t.mime} in ('audio/mpeg', 'audio/mp4', 'audio/wav')`),
    check("songs_duration_valid", sql`${t.durationMs} > 0`),
    check("songs_drop_valid", sql`${t.dropMs} is null or (${t.dropMs} >= 0 and ${t.dropMs} <= ${t.durationMs})`),
    check("songs_start_valid", sql`${t.startMs} >= 0 and ${t.startMs} <= ${t.durationMs}`),
    check("songs_number_valid", sql`${t.number} is null or ${t.number} > 0`),
  ],
);

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
    /**
     * Quién sale: `elegido` (el avatar de `avatar_photo_id`), `biblioteca` (el avatar de la
     * biblioteca `avatar_library_id`), `automatico` (lo elige el desglose, parecido a la persona de
     * la referencia), `sin_sustitucion` (se conservan las personas de la referencia) o `nadie`.
     * Solo con `elegido` hay foto de avatar y solo con `biblioteca`, avatar de la biblioteca.
     */
    avatarMode: text("avatar_mode").notNull().default("elegido"),
    /** El avatar de la biblioteca (con `avatarMode = biblioteca`). */
    avatarLibraryId: bigint("avatar_library_id", { mode: "number" }).references(() => avatars.id, { onDelete: "set null" }),
    /** La variante del producto; `null`: las fotos de siempre del producto. */
    variantId: bigint("variant_id", { mode: "number" }).references(() => productVariants.id, { onDelete: "set null" }),
    /** `replicar` (por defecto), `adaptacion_concepto` o `solo_gancho`. */
    kind: text("kind").notNull().default("replicar"),
    /**
     * «Qué adaptación quieres» (máx. 12.000 caracteres). Solo cuenta con `kind = adaptacion_concepto`;
     * si se pasa a `replicar` se conserva sin usarse, para no perderla por un clic.
     */
    adaptation: text("adaptation"),
    /**
     * Duración del gancho en segundos (2–8). Solo cuenta con `kind = solo_gancho`: la referencia se
     * recorta a esa duración al prepararse (`segmentMsFor`).
     */
    hookSeconds: integer("hook_seconds").notNull().default(4),
    /**
     * Los cuerpos (`product_bodies.id`) que se pegan detrás del gancho, en orden. Solo cuentan con
     * `kind = solo_gancho`. Sin clave ajena (es una lista): un cuerpo desmarcado deja de salir.
     */
    bodyClipIds: jsonb("body_clip_ids").$type<number[]>().notNull().default([]),
    /** Prompt de la imagen inicial (en inglés): lo propone el desglose y la persona lo puede cambiar. */
    imagePrompt: text("image_prompt"),
    /** Prompt del clip (en inglés, con `@Video1` y `@ImageN`). */
    videoPrompt: text("video_prompt"),
    /** Cómo usa el clip la imagen aprobada: `start_image` (primer fotograma) o `contextual_reference`. */
    frameUse: text("frame_use").notNull().default("start_image"),
    /** Resolución del clip: `480p` (por defecto), `720p` o `1080p`. */
    clipResolution: text("clip_resolution").notNull().default("480p"),
    /** La imagen inicial aprobada (un resultado de una generación `frame` de este vídeo). */
    approvedFrameResultId: bigint("approved_frame_result_id", { mode: "number" }).references(
      (): AnyPgColumn => generationResults.id,
      { onDelete: "set null" },
    ),
    /** El clip aprobado (un resultado de una generación `clip` de este vídeo). */
    approvedClipResultId: bigint("approved_clip_result_id", { mode: "number" }).references(
      (): AnyPgColumn => generationResults.id,
      { onDelete: "set null" },
    ),
    /**
     * El enlace pegado que este vídeo espera del Mac, o el último que falló (su tarea en
     * `agent_tasks`): es lo que enseña la pantalla. `null` si no hay ninguno. Mientras tanto, una
     * referencia que ya estaba lista sigue lista. Se vacía al entregarse el archivo o al subir uno.
     */
    linkTaskId: bigint("link_task_id", { mode: "number" }).references((): AnyPgColumn => agentTasks.id, { onDelete: "set null" }),
    /**
     * El desglose automático del lote no se pide para este vídeo hasta que se cambie (un duplicado
     * sin desglose válido que copiar: así no se gasta antes de editarlo).
     */
    skipAutoAnalysis: boolean("skip_auto_analysis").notNull().default(false),
    /** El lote al que pertenece, si se creó desde un lote. */
    batchId: bigint("batch_id", { mode: "number" }).references(() => batches.id, { onDelete: "set null" }),
    /** «Cambios específicos» para este vídeo (máx. 6.000 caracteres, varias líneas); llega al desglose. */
    note: text("note"),
    /**
     * Respuestas a las «Preguntas del lote» (`OwnerAnswer` en `brief.ts`). Las que llevan `inBrief`
     * llegan al desglose; cambiarlas deja el desglose por repetir.
     */
    ownerAnswers: jsonb("owner_answers")
      .$type<Array<{ key: string; question: string; answer: string; inBrief: boolean }>>()
      .notNull()
      .default([]),
    /** «Saltar este vídeo»: el envío automático del lote no lo toca. */
    autoSkipped: boolean("auto_skipped").notNull().default(false),
    /**
     * La canción elegida para el montaje (no cambia la generación). Si se borra la canción, el
     * vídeo vuelve a «Audio original» (`deleteSong` lo hace antes de borrarla).
     */
    songId: bigint("song_id", { mode: "number" }).references((): AnyPgColumn => songs.id, { onDelete: "set null" }),
    /** `original` (por defecto) o `cancion`. La canción elegida manda: con canción, siempre `cancion`. */
    audioMode: text("audio_mode").notNull().default("original"),
    /**
     * «Referencia de edición»: un enlace (de los sitios admitidos) a un vídeo cuyo montaje se
     * quiere imitar. Solo se guarda; lo usará el montador. `null` si no hay.
     */
    editReferenceUrl: text("edit_reference_url"),
    /**
     * Montaje automático en el Mac (`src/server/videos/edits.ts`): `null` (nunca se pidió),
     * `en_marcha` (su tarea `edit_task_id` espera o la tiene un Mac), `hecho` (la última versión está
     * en `edits`) o `fallido` (con `edit_error`, apto para la persona: p. ej. «Montaje: necesita el Mac»).
     */
    editStatus: text("edit_status"),
    editError: text("edit_error"),
    /** La tarea del Mac del último montaje pedido. */
    editTaskId: bigint("edit_task_id", { mode: "number" }).references((): AnyPgColumn => agentTasks.id, { onDelete: "set null" }),
    /** Rótulos del montaje (el principal y el CTA). Los propone el desglose; quien creó el vídeo o el dueño los cambia. */
    editMainText: text("edit_main_text"),
    editCtaText: text("edit_cta_text"),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("videos_product").on(t.productId, t.createdAt),
    index("videos_song").on(t.songId),
    check("videos_audio_mode_valid", sql`${t.audioMode} in ('cancion', 'original')`),
    check("videos_audio_mode_song", sql`(${t.songId} is null) = (${t.audioMode} = 'original')`),
    index("videos_reference_status").on(t.referenceStatus),
    index("videos_batch").on(t.batchId),
    index("videos_link_task").on(t.linkTaskId),
    check("videos_note_length", sql`${t.note} is null or char_length(${t.note}) <= 6000`),
    check("videos_edit_status_valid", sql`${t.editStatus} is null or ${t.editStatus} in ('en_marcha', 'hecho', 'fallido')`),
    check(
      "videos_edit_texts_length",
      sql`(${t.editMainText} is null or char_length(${t.editMainText}) <= ${sql.raw(String(MAX_EDIT_TEXT))}) and (${t.editCtaText} is null or char_length(${t.editCtaText}) <= ${sql.raw(String(MAX_EDIT_TEXT))})`,
    ),
    check(
      "videos_edit_reference_url_valid",
      sql`${t.editReferenceUrl} is null or (char_length(${t.editReferenceUrl}) <= 2000 and ${t.editReferenceUrl} like 'https://%')`,
    ),
    check("videos_kind_valid", sql`${t.kind} in ('replicar', 'adaptacion_concepto', 'solo_gancho')`),
    check("videos_hook_seconds_valid", sql`${t.hookSeconds} between 2 and 8`),
    check("videos_adaptation_length", sql`${t.adaptation} is null or char_length(${t.adaptation}) <= 12000`),
    check("videos_avatar_mode_valid", sql`${t.avatarMode} in ('elegido', 'biblioteca', 'automatico', 'sin_sustitucion', 'nadie')`),
    check("videos_avatar_only_chosen", sql`${t.avatarMode} = 'elegido' or ${t.avatarPhotoId} is null`),
    check("videos_avatar_library_only_biblioteca", sql`${t.avatarMode} = 'biblioteca' or ${t.avatarLibraryId} is null`),
    index("videos_variant").on(t.variantId),
    check("videos_reference_status_valid", sql`${t.referenceStatus} in ('none', 'uploading', 'processing', 'ready', 'failed')`),
    check("videos_reference_source_valid", sql`${t.referenceSource} is null or ${t.referenceSource} in ('file', 'link')`),
    check("videos_frame_use_valid", sql`${t.frameUse} in ('start_image', 'contextual_reference')`),
    check("videos_clip_resolution_valid", sql`${t.clipResolution} in ('480p', '720p', '1080p')`),
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
 * Desgloses del vídeo de referencia hechos por Claude: cada «Repetir desglose» es una versión
 * nueva y las anteriores no se tocan. Como mucho uno en marcha por vídeo (índice único parcial).
 * `result` es el desglose validado (`Analysis` en `src/server/videos/analysis.ts`); el coste está
 * en el libro de gasto (`spend_entry_id`, sin clave ajena, igual que el libro).
 */
export const videoAnalyses = pgTable(
  "video_analyses",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    videoId: bigint("video_id", { mode: "number" })
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** `queued`, `running`, `done`, `failed` o `paused` (esperando saldo). */
    status: text("status").notNull().default("queued"),
    /** Por qué falló o está en pausa, en español y apto para la persona. */
    error: text("error"),
    result: jsonb("result"),
    /** La referencia (recorte subido a Higgsfield) de la que sale el desglose: si el vídeo cambia de referencia, ya no vale. */
    referenceMediaId: text("reference_media_id"),
    ruleVersions: jsonb("rule_versions").$type<Record<string, number>>(),
    /**
     * Las indicaciones del vídeo con las que se hizo (copia de `videos`): si cambian después, el
     * desglose ya no vale, igual que con la referencia. `adaptation` solo con `adaptacion_concepto`.
     */
    kind: text("kind").notNull().default("replicar"),
    avatarMode: text("avatar_mode").notNull().default("elegido"),
    /**
     * El avatar y la variante con los que se hizo (copia de `videos`, sin clave ajena: es una
     * instantánea). Cambiarlos deja el desglose por repetir. `avatar_photo_id` solo con `elegido`
     * (los desgloses de antes de guardarlo lo tienen vacío y no se comparan) y `avatar_library_id`
     * solo con `biblioteca`.
     */
    avatarPhotoId: bigint("avatar_photo_id", { mode: "number" }),
    avatarLibraryId: bigint("avatar_library_id", { mode: "number" }),
    variantId: bigint("variant_id", { mode: "number" }),
    /** Con `automatico`: el avatar que eligió el código a partir del desglose; `null` si ninguno encaja (hay pregunta). */
    autoAvatarId: bigint("auto_avatar_id", { mode: "number" }).references(() => avatars.id, { onDelete: "set null" }),
    note: text("note"),
    adaptation: text("adaptation"),
    /** Duración del gancho con la que se hizo; solo con `solo_gancho`. */
    hookSeconds: integer("hook_seconds"),
    /** «Indicaciones» del lote para el producto del vídeo, si las había. */
    productNotes: text("product_notes"),
    /** Las respuestas del dueño a las preguntas del lote que llevaba (texto, como se mandó). */
    answers: text("answers"),
    spendEntryId: bigint("spend_entry_id", { mode: "number" }),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("video_analyses_video_version").on(t.videoId, t.version),
    uniqueIndex("video_analyses_one_active")
      .on(t.videoId)
      .where(sql`${t.status} in ('queued', 'running', 'paused')`),
    index("video_analyses_status").on(t.status, t.updatedAt),
    check("video_analyses_status_valid", sql`${t.status} in ('queued', 'running', 'done', 'failed', 'paused')`),
    check("video_analyses_kind_valid", sql`${t.kind} in ('replicar', 'adaptacion_concepto', 'solo_gancho')`),
    check("video_analyses_avatar_mode_valid", sql`${t.avatarMode} in ('elegido', 'biblioteca', 'automatico', 'sin_sustitucion', 'nadie')`),
  ],
);

/**
 * Generaciones en Higgsfield (imagen inicial `frame` o clip `clip`), una fila por ronda. La
 * intención se confirma aquí antes de llamar: `intent` → `submitting` (llamada en curso) →
 * `submitted` (identificadores guardados) → `done` | `failed`. `not_sent`: seguro que no llegó (no
 * gasta ronda, por eso queda fuera del índice único). `unknown`: no se sabe si llegó; se
 * reconcilia contra el historial de Higgsfield y nunca se reenvía sola. Los créditos son enteros.
 */
export const generations = pgTable(
  "generations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    videoId: bigint("video_id", { mode: "number" })
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    round: integer("round").notNull(),
    status: text("status").notNull().default("intent"),
    /** Quien paga (con su Higgsfield): siempre quien creó el vídeo. */
    userId: bigint("user_id", { mode: "number" }).notNull(),
    /** La petición tal cual se presupuestó y se envía (`HfImageRequest` o `HfVideoRequest`). */
    request: jsonb("request").notNull(),
    count: integer("count").notNull(),
    quotedCredits: integer("quoted_credits").notNull(),
    creditsSpent: integer("credits_spent"),
    jobIds: jsonb("job_ids").$type<string[]>().notNull().default([]),
    /** Por qué falló o no se envió, en español y apto para la persona. */
    error: text("error"),
    /** Por qué la persona rechazó esta ronda (una línea); hace falta para regenerar. */
    rejectReason: text("reject_reason"),
    /** La última respuesta de Higgsfield en crudo, recortada a 20 000 caracteres. */
    raw: jsonb("raw"),
    intentAt: instant("intent_at").notNull().defaultNow(),
    submitStartedAt: instant("submit_started_at"),
    submittedAt: instant("submitted_at"),
    finishedAt: instant("finished_at"),
    lastPolledAt: instant("last_polled_at"),
    /** Reserva del trabajo que descarga los resultados y hace las miniaturas (`video.finalizar`). */
    finalizingAt: instant("finalizing_at"),
    /**
     * Hasta cuándo se vuelve a mirar una generación `failed` por tope de una hora o porque
     * Higgsfield no encontraba sus trabajos: si terminan tarde, no se pierden.
     */
    recheckUntil: instant("recheck_until"),
    /**
     * En duda: trabajos del historial que se parecen pero no se pueden adoptar con seguridad
     * (`{ jobId, createdAt, model, thumbUrl }`), para que la persona elija si es uno de ellos.
     */
    candidates: jsonb("candidates").$type<Array<{ jobId: string; createdAt: string | null; model: string; thumbUrl: string | null }>>(),
    /** Quién y cuándo resolvió a mano una duda, y cómo (`adoptado` o `no_esta`). */
    resolvedBy: bigint("resolved_by", { mode: "number" }),
    resolvedAt: instant("resolved_at"),
    resolvedAs: text("resolved_as"),
  },
  (t) => [
    uniqueIndex("generations_video_kind_round")
      .on(t.videoId, t.kind, t.round)
      .where(sql`${t.status} <> 'not_sent'`),
    // Como mucho una en marcha o en duda por tipo y vídeo.
    uniqueIndex("generations_one_active")
      .on(t.videoId, t.kind)
      .where(sql`${t.status} in ('intent', 'submitting', 'submitted', 'unknown')`),
    index("generations_status").on(t.status),
    index("generations_video_kind").on(t.videoId, t.kind, t.id),
    index("generations_job_ids").using("gin", t.jobIds),
    check("generations_kind_valid", sql`${t.kind} in ('frame', 'clip')`),
    check(
      "generations_status_valid",
      sql`${t.status} in ('intent', 'submitting', 'submitted', 'done', 'failed', 'not_sent', 'unknown')`,
    ),
    check("generations_count_valid", sql`${t.count} between 1 and 12`),
    check("generations_round_valid", sql`${t.round} >= 1`),
    check("generations_resolved_as_valid", sql`${t.resolvedAs} is null or ${t.resolvedAs} in ('adoptado', 'no_esta')`),
    check("generations_credits_valid", sql`${t.quotedCredits} >= 0 and (${t.creditsSpent} is null or ${t.creditsSpent} >= 0)`),
  ],
);

/** Un resultado por trabajo de una generación, con su miniatura (JPEG) en la propia base de datos. */
export const generationResults = pgTable(
  "generation_results",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    generationId: bigint("generation_id", { mode: "number" })
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    jobId: text("job_id").notNull(),
    ok: boolean("ok").notNull(),
    url: text("url"),
    error: text("error"),
    thumbMime: text("thumb_mime"),
    thumb: bytea("thumb"),
  },
  (t) => [unique("generation_results_generation_index").on(t.generationId, t.index), unique("generation_results_job").on(t.jobId)],
);

/**
 * Subidas por trozos de un vídeo de referencia. El identificador es aleatorio y es también el
 * nombre del archivo temporal; `received` cuenta los trozos ya escritos. La sube la persona
 * (`user_id`, siempre quien creó el vídeo) o, en su nombre, una tarea del agente del Mac
 * (`agent_task_id`; si la tarea se borra, su sesión también). Las de más de 24 h se borran con su
 * archivo.
 */
export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: text("id").primaryKey(),
    videoId: bigint("video_id", { mode: "number" })
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    /** La tarea del Mac que entrega el archivo (enlace pegado); `null` si lo sube la persona. */
    agentTaskId: bigint("agent_task_id", { mode: "number" }).references((): AnyPgColumn => agentTasks.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    /** Lo anuncia el navegador al empezar. El Mac no sabe el tamaño hasta descargar: `null`. */
    totalBytes: integer("total_bytes"),
    received: integer("received").notNull().default(0),
    /** Tipo comprobado por el contenido del primer trozo. */
    mime: text("mime"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("upload_sessions_video").on(t.videoId),
    index("upload_sessions_created").on(t.createdAt),
    index("upload_sessions_agent_task").on(t.agentTaskId),
  ],
);

/**
 * Biblioteca de clips: copia en caché del historial de vídeos de Higgsfield de cada persona (una
 * fila por persona y trabajo), para que la pantalla cargue al instante. Solo guarda direcciones
 * `https` de `*.cloudfront.net` (`servableClipUrl`). `video_id` marca los clips que salieron de un
 * vídeo de PRINCIPAL. Solo `src/server/videos/` toca esta tabla y la siguiente. `user_id` sin
 * clave ajena, igual que `credentials`.
 */
export const libraryClips = pgTable(
  "library_clips",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    /** El `job_id` de Higgsfield (el `id` de la entrada del historial). */
    jobId: text("job_id").notNull(),
    /** Miniatura (`results.minUrl`), si es servible. */
    thumbUrl: text("thumb_url"),
    /** El vídeo (`results.rawUrl`). */
    videoUrl: text("video_url").notNull(),
    model: text("model").notNull().default(""),
    /** Cuándo se generó en Higgsfield (`createdAt`). */
    createdAtHf: instant("created_at_hf").notNull(),
    /**
     * Principio del prompt (máx. 300 caracteres, recortado en `library.ts`), para reconocer el
     * clip. Sin CHECK: es texto de fuera y un recuento distinto no debe tumbar la actualización.
     */
    prompt: text("prompt"),
    /** El vídeo de PRINCIPAL del que salió, si su trabajo coincide con un resultado de una generación. */
    videoId: bigint("video_id", { mode: "number" }).references((): AnyPgColumn => videos.id, { onDelete: "set null" }),
    /** Última vez que se vio en el historial. */
    fetchedAt: instant("fetched_at").notNull().defaultNow(),
  },
  (t) => [
    unique("library_clips_user_job").on(t.userId, t.jobId),
    index("library_clips_user_created").on(t.userId, t.createdAtHf, t.id),
  ],
);

/**
 * Cuerpos de un producto: clips de la biblioteca marcados para pegarse detrás de un gancho
 * (`videos.body_clip_ids`). Los ve quien ve el producto; cada persona marca solo sus propios clips.
 * `created_by` sin clave ajena, igual que `products.created_by`.
 */
export const productBodies = pgTable(
  "product_bodies",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    libraryClipId: bigint("library_clip_id", { mode: "number" })
      .notNull()
      .references(() => libraryClips.id, { onDelete: "cascade" }),
    /** Nombre corto para reconocerlo en el selector (1–60 caracteres). */
    label: text("label").notNull(),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("product_bodies_product_clip").on(t.productId, t.libraryClipId),
    index("product_bodies_clip").on(t.libraryClipId),
    check("product_bodies_label_length", sql`char_length(${t.label}) between 1 and 60`),
  ],
);

/**
 * Programas del Mac («agentes»): descargan los enlaces pegados, que la nube no puede alcanzar.
 * Cada uno entra con una ficha que se enseña una sola vez; aquí solo queda su huella SHA-256. El
 * programa es de quien creó la ficha y solo atiende sus tareas. Solo `src/server/agent.ts` toca
 * esta tabla. `created_by` sin clave ajena, igual que en `videos`.
 */
export const agents = pgTable(
  "agents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    /** Último latido; «conectado» es uno en los últimos 90 segundos. */
    lastSeenAt: instant("last_seen_at"),
    /** Lo que el programa dice de sí mismo en cada latido. */
    info: jsonb("info").$type<{ version: string; ytDlp: string | null }>(),
    revokedAt: instant("revoked_at"),
  },
  (t) => [index("agents_created_by").on(t.createdBy)],
);

/**
 * Tareas para el programa del Mac. `link_download`: descargar el enlace pegado como referencia de
 * un vídeo (`videoId`) y entregar el archivo por una sesión de `upload_sessions`. `song_download`:
 * descargar el audio (MP3) de un enlace pegado en «Canciones» (sin vídeo) y entregarlo por la
 * subida propia de la tarea (`uploadId`, `uploadReceived`); al terminar crea la canción (`songId`). `queued` → `leased` (un Mac la tiene reservada y
 * la mantiene con latidos) → `done` | `failed`; una reserva sin latido vuelve a `queued` hasta
 * agotar los intentos. `montaje`: montar el vídeo `videoId` en el Mac con la «ficha de montaje»
 * (`payload`, hecha en el servidor) y entregar el MP4 por la subida propia de la tarea, como una
 * canción; al terminar queda en `edits`. Como mucho una tarea viva de cada tipo por vídeo. `error` es el detalle técnico, solo
 * para el dueño: a la persona se le enseña un texto fijo en el vídeo. La escribe
 * `src/server/agent.ts`; la capa de vídeos solo cancela la tarea viva de un vídeo y lee su enlace,
 * por `src/server/agent-tasks.ts`.
 */
export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull().default("link_download"),
    /** El vídeo cuya referencia trae (`link_download`) o que monta (`montaje`); `null` en una canción. */
    videoId: bigint("video_id", { mode: "number" }).references(() => videos.id, { onDelete: "cascade" }),
    /** La canción que creó (`song_download` terminada); `null` mientras tanto o si se borró. */
    songId: bigint("song_id", { mode: "number" }).references((): AnyPgColumn => songs.id, { onDelete: "set null" }),
    /**
     * La sesión de subida de la reserva en curso de una canción (cada reserva abre una nueva) y
     * cuántos trozos han llegado. El archivo vive en la carpeta temporal de subidas.
     */
    uploadId: text("upload_id"),
    uploadReceived: integer("upload_received").notNull().default(0),
    /** La ficha de montaje (`EditSpec` en `src/server/videos/edits.ts`) de una tarea `montaje`. */
    payload: jsonb("payload"),
    url: text("url").notNull(),
    status: text("status").notNull().default("queued"),
    /** Quien pegó el enlace (quien creó el vídeo): la atiende un Mac suyo. */
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    /** El Mac que la tiene reservada (o el último que la tuvo). */
    agentId: bigint("agent_id", { mode: "number" }).references(() => agents.id),
    leaseExpiresAt: instant("lease_expires_at"),
    /** Cuándo se reservó por última vez: una reserva no dura más de 30 minutos, con latidos o sin ellos. */
    leasedAt: instant("leased_at"),
    /** Veces que se ha reservado. */
    attempts: integer("attempts").notNull().default(0),
    /**
     * Reintento automático de un enlace que falló (`link_download`): 0 la tarea original, 1..3 cada
     * reintento que el servidor puso en cola solo (`MAX_LINK_RETRIES`).
     */
    autoRetry: integer("auto_retry").notNull().default(0),
    /** Un reintento automático no se reserva antes de esta hora (`null`: en cuanto haya un Mac). */
    availableAt: instant("available_at"),
    error: text("error"),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("agent_tasks_queue").on(t.status, t.createdBy, t.id),
    uniqueIndex("agent_tasks_one_active_per_video")
      .on(t.videoId)
      .where(sql`${t.kind} = 'link_download' and ${t.status} in ('queued', 'leased')`),
    uniqueIndex("agent_tasks_one_active_montaje")
      .on(t.videoId)
      .where(sql`${t.kind} = 'montaje' and ${t.status} in ('queued', 'leased')`),
    uniqueIndex("agent_tasks_one_active_song_link")
      .on(t.createdBy, t.url)
      .where(sql`${t.kind} = 'song_download' and ${t.status} in ('queued', 'leased')`),
    check("agent_tasks_kind_valid", sql`${t.kind} in ('link_download', 'song_download', 'montaje')`),
    // Una referencia y un montaje son siempre de un vídeo; una canción, de ninguno.
    check("agent_tasks_target_valid", sql`(${t.kind} in ('link_download', 'montaje')) = (${t.videoId} is not null)`),
    check("agent_tasks_status_valid", sql`${t.status} in ('queued', 'leased', 'done', 'failed')`),
    // Una tarea reservada siempre dice quién la tiene y hasta cuándo.
    check("agent_tasks_lease_complete", sql`${t.status} <> 'leased' or (${t.agentId} is not null and ${t.leaseExpiresAt} is not null)`),
  ],
);

/**
 * Vídeos montados en el Mac (`src/server/videos/edits.ts`): una versión por montaje terminado
 * («Volver a montar» añade otra). El MP4 va en la propia base de datos (máx. 200 MB), con su
 * duración (medida aquí con ffprobe) y la autocomprobación del montador. Solo `src/server/videos/`
 * toca esta tabla.
 */
export const edits = pgTable(
  "edits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    videoId: bigint("video_id", { mode: "number" })
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    durationMs: integer("duration_ms").notNull(),
    /** Resumen de la autocomprobación del montador (planos, cortes en beat, avisos). */
    selfCheck: jsonb("self_check"),
    /** La tarea del Mac que lo entregó (sin clave ajena: es un apunte). */
    taskId: bigint("task_id", { mode: "number" }),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("edits_video_version").on(t.videoId, t.version),
    check("edits_size_valid", sql`${t.size} > 0 and ${t.size} <= ${sql.raw(String(MAX_EDIT_BYTES))}`),
    check("edits_version_valid", sql`${t.version} >= 1`),
    check("edits_duration_valid", sql`${t.durationMs} > 0`),
  ],
);
