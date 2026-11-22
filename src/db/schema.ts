import { sql } from "drizzle-orm";
import { bigint, bigserial, index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

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
