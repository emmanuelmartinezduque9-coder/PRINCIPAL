import { expect, it } from "vitest";
import { looksLikeFinanzas } from "@/db/migrate";

// Nunca migrar sobre la base de datos de Finanzas.
it("reconoce las tablas de Finanzas", () => {
  expect(looksLikeFinanzas(["users", "supplier_orders", "stores"])).toBe(true);
});

it("no confunde las tablas de PRINCIPAL con las de Finanzas", () => {
  expect(looksLikeFinanzas(["users", "sessions", "settings", "products"])).toBe(false);
});

it("runMigrations se niega a migrar sobre una base con tablas de Finanzas", async () => {
  const { Client } = await import("pg");
  const { runMigrations } = await import("@/db/migrate");
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("drop database if exists falsa_finanzas");
    await admin.query("create database falsa_finanzas");
  } finally {
    await admin.end();
  }
  const url = process.env.DATABASE_URL!.replace(/\/[^/]+$/, "/falsa_finanzas");
  const fake = new Client({ connectionString: url });
  await fake.connect();
  try {
    await fake.query("create table stores (id text)");
  } finally {
    await fake.end();
  }
  await expect(runMigrations(url)).rejects.toThrow("Esta base de datos es la de Finanzas");
});
