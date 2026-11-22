import { afterEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/db/client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("conexión con la base de datos", () => {
  it("un error en una conexión en reposo se anota y el proceso sigue", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = getPool();

    // Sin nadie escuchando, este evento tumbaría el proceso.
    expect(() => pool.emit("error", new Error("terminating connection due to administrator command"))).not.toThrow();

    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0].join(" ")).toContain("[db]");
    expect(errors.mock.calls[0].join(" ")).toContain("terminating connection");
    const { rows } = await pool.query("select 1 as uno");
    expect(rows).toEqual([{ uno: 1 }]);
  });

  it("solo hay un aviso por error aunque la conexión se pida muchas veces", () => {
    expect(getPool().listenerCount("error")).toBe(1);
    getPool();
    expect(getPool().listenerCount("error")).toBe(1);
  });
});
