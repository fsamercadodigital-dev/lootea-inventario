import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { profileLabel } from "../src/lib/format.ts";
import { resolveDatabaseTarget, toPostgres } from "../src/lib/sql.ts";
import { parseBmInput, parseCreateProfile, parseHttpsUrl } from "../src/lib/validators.ts";

const dir = mkdtempSync(path.join(tmpdir(), "lootea-test-"));
const dbPath = path.join(dir, "inventory.db");
process.env.INVENTORY_DB_PATH = dbPath;
process.env.INVENTORY_DATA_KEY = randomBytes(32).toString("base64");
process.env.INVENTORY_PASSPHRASE = randomBytes(18).toString("hex");
process.env.INVENTORY_DATA_KEY_FILE = path.join(dir, "missing-key");
process.env.INVENTORY_PASSPHRASE_FILE = path.join(dir, "missing-pass");

const origin = "http://127.0.0.1:38471";
const passphrase = process.env.INVENTORY_PASSPHRASE;
const metaPassword = `m-${randomBytes(12).toString("hex")}`;
const emailPassword = `e-${randomBytes(12).toString("hex")}`;
const replacement = `n-${randomBytes(12).toString("hex")}`;
const rejectedSecret = `x-${randomBytes(12).toString("hex")}`;
const bmId = "9007199254740993";

function call(pathname: string, options: { method?: string; cookie?: string; csrf?: string; json?: unknown } = {}) {
  const headers = new Headers();
  headers.set("origin", origin);
  headers.set("host", "127.0.0.1:38471");
  headers.set("accept", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.csrf) headers.set("x-csrf-token", options.csrf);
  if (options.json !== undefined) headers.set("content-type", "application/json");
  return new Request(`${origin}${pathname}`, {
    method: options.method ?? "GET",
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  });
}

function cookiePair(response: Response): string {
  const cookies = response.headers.getSetCookie?.() ?? [];
  const pair = cookies[0]?.split(";")[0];
  assert.ok(pair);
  return pair;
}

function fileHas(secret: string): boolean {
  const chunks: Buffer[] = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      chunks.push(readFileSync(dbPath + suffix));
    } catch {
      /* absent */
    }
  }
  return Buffer.concat(chunks).includes(Buffer.from(secret));
}

test("validadores rejeitam link inseguro e ID numérico", () => {
  assert.equal(parseHttpsUrl("http://example.com").ok, false);
  assert.equal(parseHttpsUrl("https://user:secret@example.com").ok, false);
  assert.equal(parseHttpsUrl("https://example.com/perfil").ok, true);
  const numericId = parseBmInput({
    name: "BM",
    metaBmId: 9007199254740993,
    status: "Ativo",
  });
  assert.equal(numericId.ok, false);
  const textId = parseBmInput({ name: "BM", metaBmId: bmId, status: "Ativo" });
  assert.equal(textId.ok, true);
  if (textId.ok) assert.equal(textId.value.metaBmId, bmId);
  assert.equal(parseBmInput({ name: "BM", metaBmId: bmId, status: "Offline" }).ok, false);
  assert.equal(parseBmInput({ name: "BM", metaBmId: bmId, status: "Em análise" }).ok, false);
  assert.equal(parseCreateProfile({ status: "Offline" }).ok, false);
  assert.equal(parseCreateProfile({ status: "Em análise" }).ok, false);
  const missingProvider = parseCreateProfile({
    displayName: null,
    status: "Ativo",
    email: { password: "segredo-local" },
  });
  assert.equal(missingProvider.ok, false);
  assert.equal(profileLabel({ displayName: null }), "Sem nome");
  assert.equal(profileLabel({ displayName: "  " }), "Sem nome");
  assert.equal(profileLabel({ displayName: "Fernando Bejarano" }), "Fernando Bejarano");
  assert.equal(toPostgres("select * from t where a = ? and b = ?"), "select * from t where a = $1 and b = $2");
  assert.equal(resolveDatabaseTarget({ DATABASE_URL: "postgres://db.example/app" }), "postgres");
  assert.equal(resolveDatabaseTarget({}), "sqlite");
  assert.throws(() => resolveDatabaseTarget({ VERCEL: "1" }), /DATABASE_URL/);
});

test("persistência, sessão e cofre", async () => {
  const dbMod = await import("../src/lib/sql.ts");
  const loginRoute = await import("../src/app/api/login/route.ts");
  const inventoryRoute = await import("../src/app/api/inventory/route.ts");
  const profilesRoute = await import("../src/app/api/profiles/route.ts");
  const profileRoute = await import("../src/app/api/profiles/[id]/route.ts");
  const secretsRoute = await import("../src/app/api/profiles/[id]/secrets/route.ts");
  const revealRoute = await import("../src/app/api/profiles/[id]/secrets/reveal/route.ts");
  const bmsRoute = await import("../src/app/api/bms/route.ts");
  const ctx = { params: Promise.resolve({}) };

  const anonymous = await inventoryRoute.GET(call("/api/inventory"), ctx);
  assert.equal(anonymous.status, 401);

  const wrong = await loginRoute.POST(call("/api/login", { method: "POST", json: { passphrase: "errada" } }), ctx);
  assert.equal(wrong.status, 401);

  const logged = await loginRoute.POST(call("/api/login", { method: "POST", json: { passphrase } }), ctx);
  assert.equal(logged.status, 200);
  const cookie = cookiePair(logged);
  const csrf = ((await logged.json()) as { csrfToken: string }).csrfToken;
  const auth = { cookie, csrf };

  const empty = await inventoryRoute.GET(call("/api/inventory", auth), ctx);
  assert.equal(empty.status, 200);
  const emptyBody = (await empty.json()) as { profiles: unknown[]; bms: unknown[] };
  assert.equal(emptyBody.profiles.length, 0);
  assert.equal(emptyBody.bms.length, 0);

  const created = await profilesRoute.POST(
    call("/api/profiles", {
      method: "POST",
      ...auth,
      json: {
        displayName: null,
        status: "Ativo",
        meta: { username: "acesso.teste", password: metaPassword, totp: "jbsw y3dp ehpk 3pxp" },
        email: { provider: "hotmail", username: "caixa.teste", password: emailPassword },
      },
    }),
    ctx,
  );
  assert.equal(created.status, 201);
  const createdBody = (await created.json()) as {
    profile: { id: string; displayName: string | null; hasAccess: boolean; recordNumber: number; emailUsername: string | null };
  };
  assert.equal(createdBody.profile.displayName, null);
  assert.equal(createdBody.profile.hasAccess, true);
  assert.equal(createdBody.profile.recordNumber, 1);
  assert.equal(createdBody.profile.emailUsername, "caixa.teste");
  const profileId = createdBody.profile.id;
  const profileCtx = { params: Promise.resolve({ id: profileId }) };

  await dbMod.checkpointLocal();
  assert.equal(fileHas(metaPassword), false);
  assert.equal(fileHas(emailPassword), false);
  assert.equal(fileHas("acesso.teste"), false);

  const detailRes = await profileRoute.GET(call(`/api/profiles/${profileId}`, auth), profileCtx);
  assert.equal(detailRes.status, 200);
  const detailText = await detailRes.text();
  assert.equal(detailText.includes(metaPassword), false);
  assert.equal(detailText.includes("ciphertext"), false);
  assert.equal(detailText.includes("acesso.teste"), false);
  const detail = JSON.parse(detailText) as {
    profile: { meta: { password: boolean; totp: boolean }; email: { provider: string; username: boolean } };
  };
  assert.equal(detail.profile.meta.password, true);
  assert.equal(detail.profile.meta.totp, true);
  assert.equal(detail.profile.email.provider, "hotmail");
  assert.equal(detail.profile.email.username, true);

  const revealAnon = await revealRoute.POST(
    call(`/api/profiles/${profileId}/secrets/reveal`, { method: "POST", json: { service: "meta", field: "password" } }),
    profileCtx,
  );
  assert.equal(revealAnon.status, 401);

  const revealed = await revealRoute.POST(
    call(`/api/profiles/${profileId}/secrets/reveal`, { method: "POST", ...auth, json: { service: "meta", field: "password" } }),
    profileCtx,
  );
  assert.equal(revealed.status, 200);
  const revealedBody = (await revealed.json()) as { value: string };
  assert.equal(revealedBody.value, metaPassword);

  const totp = await revealRoute.POST(
    call(`/api/profiles/${profileId}/secrets/reveal`, { method: "POST", ...auth, json: { service: "meta", field: "totp" } }),
    profileCtx,
  );
  const totpBody = (await totp.json()) as { value: string };
  assert.equal(totpBody.value, "JBSWY3DPEHPK3PXP");

  const statusRes = await profileRoute.PATCH(
    call(`/api/profiles/${profileId}`, { method: "PATCH", ...auth, json: { status: "Restrito" } }),
    profileCtx,
  );
  assert.equal(statusRes.status, 200);
  const statusBody = (await statusRes.json()) as { profile: { status: string } };
  assert.equal(statusBody.profile.status, "Restrito");

  const bmRes = await bmsRoute.POST(
    call("/api/bms", {
      method: "POST",
      ...auth,
      json: { name: "BM teste", metaBmId: bmId, status: "Ativo", profileIds: [profileId] },
    }),
    ctx,
  );
  assert.equal(bmRes.status, 201);
  const bmBody = (await bmRes.json()) as { bm: { metaBmId: string; profileIds: string[] } };
  assert.equal(typeof bmBody.bm.metaBmId, "string");
  assert.equal(bmBody.bm.metaBmId, bmId);
  assert.deepEqual(bmBody.bm.profileIds, [profileId]);
  const storedType = await dbMod.qGet("select typeof(meta_bm_id) as kind from bms");
  assert.equal(storedType?.kind, "text");

  const linked = await profileRoute.GET(call(`/api/profiles/${profileId}`, auth), profileCtx);
  const linkedBody = (await linked.json()) as { profile: { bmIds: string[] } };
  assert.equal(linkedBody.profile.bmIds.length, 1);

  const updated = await secretsRoute.PUT(
    call(`/api/profiles/${profileId}/secrets`, {
      method: "PUT",
      ...auth,
      json: { service: "meta", password: replacement },
    }),
    profileCtx,
  );
  assert.equal(updated.status, 200);
  const updatedText = await updated.text();
  assert.equal(updatedText.includes(replacement), false);
  await dbMod.checkpointLocal();
  assert.equal(fileHas(metaPassword), false);
  assert.equal(fileHas(replacement), false);

  const revealedNext = await revealRoute.POST(
    call(`/api/profiles/${profileId}/secrets/reveal`, { method: "POST", ...auth, json: { service: "meta", field: "password" } }),
    profileCtx,
  );
  const nextBody = (await revealedNext.json()) as { value: string };
  assert.equal(nextBody.value, replacement);

  const second = await profilesRoute.POST(
    call("/api/profiles", { method: "POST", ...auth, json: { recordNumber: 99, displayName: "Outro", status: "Ativo" } }),
    ctx,
  );
  assert.equal(second.status, 201);
  const secondBody = (await second.json()) as { profile: { recordNumber: number; emailUsername: string | null } };
  assert.equal(secondBody.profile.recordNumber, 2);
  assert.equal(secondBody.profile.emailUsername, null);

  const badLink = await profilesRoute.POST(
    call("/api/profiles", {
      method: "POST",
      ...auth,
      json: { status: "Ativo", profileUrl: "http://exemplo.test" },
    }),
    ctx,
  );
  assert.equal(badLink.status, 400);

  const originalKey = process.env.INVENTORY_DATA_KEY;
  process.env.INVENTORY_DATA_KEY = "aaaa";
  const blocked = await secretsRoute.PUT(
    call(`/api/profiles/${profileId}/secrets`, {
      method: "PUT",
      ...auth,
      json: { service: "meta", password: rejectedSecret },
    }),
    profileCtx,
  );
  assert.equal(blocked.status, 503);
  process.env.INVENTORY_DATA_KEY = originalKey;
  await dbMod.checkpointLocal();
  assert.equal(fileHas(rejectedSecret), false);
  const still = await revealRoute.POST(
    call(`/api/profiles/${profileId}/secrets/reveal`, { method: "POST", ...auth, json: { service: "meta", field: "password" } }),
    profileCtx,
  );
  const stillBody = (await still.json()) as { value: string };
  assert.equal(stillBody.value, replacement);

  const list = await inventoryRoute.GET(call("/api/inventory", auth), ctx);
  const listText = await list.text();
  assert.equal(listText.includes(replacement), false);
  assert.equal(listText.includes(emailPassword), false);
  assert.equal(listText.includes("caixa.teste"), true);
  assert.equal(listText.includes("acesso.teste"), false);
  const listBody = JSON.parse(listText) as { profiles: { status: string; recordNumber: number }[] };
  assert.equal(listBody.profiles[0]?.status, "Restrito");
  assert.equal(listBody.profiles[0]?.recordNumber, 1);

  await dbMod.qRun("update profiles set status = ? where id = ?", ["Offline", profileId]);
  await dbMod.qRun("update bms set status = ? where meta_bm_id = ?", ["Em análise", bmId]);
  const legacy = await inventoryRoute.GET(call("/api/inventory", auth), ctx);
  assert.equal(legacy.status, 200);
  const legacyBody = (await legacy.json()) as { profiles: { status: string }[]; bms: { status: string }[] };
  assert.equal(legacyBody.profiles[0]?.status, "Offline");
  assert.equal(legacyBody.bms[0]?.status, "Em análise");

  const rejectedStatus = await profileRoute.PATCH(
    call(`/api/profiles/${profileId}`, { method: "PATCH", ...auth, json: { status: "Offline" } }),
    profileCtx,
  );
  assert.equal(rejectedStatus.status, 400);

  const echoed = await profileRoute.PATCH(
    call(`/api/profiles/${profileId}`, {
      method: "PATCH",
      ...auth,
      json: { recordNumber: 50, displayName: "Mantém número", status: "Offline", bmIds: [] },
    }),
    profileCtx,
  );
  assert.equal(echoed.status, 200);
  const echoedBody = (await echoed.json()) as { profile: { status: string; recordNumber: number; displayName: string | null } };
  assert.equal(echoedBody.profile.status, "Offline");
  assert.equal(echoedBody.profile.recordNumber, 1);
  assert.equal(echoedBody.profile.displayName, "Mantém número");

  const switched = await profileRoute.PATCH(
    call(`/api/profiles/${profileId}`, { method: "PATCH", ...auth, json: { status: "Ativo" } }),
    profileCtx,
  );
  assert.equal(switched.status, 200);
  assert.equal(((await switched.json()) as { profile: { status: string } }).profile.status, "Ativo");

  await dbMod.closeDb();
});
