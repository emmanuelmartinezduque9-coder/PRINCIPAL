import { bigint, bigserial, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
