import { beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/db/client";
import {
  credentialStatus,
  deleteCredential,
  readCredential,
  saveCredential,
} from "@/server/credentials";
import type { AuthUser } from "@/server/auth";
import { makeUser } from "./helpers/fixtures";
import { truncateAll } from "./helpers/global-setup";

let ana: AuthUser;
let luis: AuthUser;

beforeEach(async () => {
  await truncateAll();
  ana = await makeUser("colaborador");
  luis = await makeUser("colaborador");
});

describe("credenciales", () => {
  it("en la base de datos no aparece el secreto en claro", async () => {
    await saveCredential(ana.id, "higgsfield", { accessToken: "tok-secreto-123" });
    const { rows } = await getPool().query("select * from credentials");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("tok-secreto-123");
  });

  it("cada persona lee solo su credencial", async () => {
    await saveCredential(ana.id, "higgsfield", { accessToken: "tok-secreto-123" }, { account: "ana" });
    expect(await readCredential(luis.id, "higgsfield")).toBeNull();
    const read = await readCredential<{ accessToken: string }>(ana.id, "higgsfield");
    expect(read!.secret.accessToken).toBe("tok-secreto-123");
    expect(read!.meta).toEqual({ account: "ana" });
    expect(read!.updatedAt).toBeInstanceOf(Date);
  });

  it("credentialStatus no incluye el secreto", async () => {
    await saveCredential(ana.id, "higgsfield", { accessToken: "tok-secreto-123" }, { account: "ana" });
    const status = await credentialStatus(ana.id, "higgsfield");
    expect(JSON.stringify(status)).not.toContain("tok-secreto");
    expect(status).toMatchObject({ connected: true, meta: { account: "ana" } });
    expect(await credentialStatus(luis.id, "higgsfield")).toEqual({ connected: false, meta: {}, updatedAt: null });
  });

  it("guardar de nuevo sustituye la credencial (una fila por persona y tipo)", async () => {
    await saveCredential(ana.id, "higgsfield", { accessToken: "viejo" }, { a: 1 });
    await saveCredential(ana.id, "higgsfield", { accessToken: "nuevo" }, { b: 2 });
    const { rows } = await getPool().query("select * from credentials");
    expect(rows).toHaveLength(1);
    const read = await readCredential<{ accessToken: string }>(ana.id, "higgsfield");
    expect(read!.secret.accessToken).toBe("nuevo");
    expect(read!.meta).toEqual({ b: 2 });
  });

  it("los tipos distintos de una misma persona no se mezclan", async () => {
    await saveCredential(ana.id, "higgsfield", { accessToken: "h" });
    await saveCredential(ana.id, "otro", { accessToken: "o" });
    expect((await readCredential<{ accessToken: string }>(ana.id, "otro"))!.secret.accessToken).toBe("o");
  });

  it("una fila copiada a otra persona no se puede leer", async () => {
    await saveCredential(ana.id, "higgsfield", { accessToken: "tok-secreto-123" });
    await getPool().query(
      "insert into credentials (user_id, kind, secret_enc) select $1, kind, secret_enc from credentials where user_id = $2",
      [luis.id, ana.id],
    );
    await expect(readCredential(luis.id, "higgsfield")).rejects.toThrow();
  });

  it("deleteCredential la borra", async () => {
    await saveCredential(ana.id, "higgsfield", { accessToken: "x" });
    await deleteCredential(ana.id, "higgsfield");
    expect(await readCredential(ana.id, "higgsfield")).toBeNull();
    expect((await credentialStatus(ana.id, "higgsfield")).connected).toBe(false);
  });
});
