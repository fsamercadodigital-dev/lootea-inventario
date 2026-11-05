import { randomBytes } from "crypto";
import { AppError } from "./errors";
import { verifyPassphrase } from "./passphrase";
import { qGet, qRun } from "./sql";

export const COOKIE_NAME = "lootea_session";

const SESSION_MS = 12 * 60 * 60 * 1000;
const STEP_UP_MS = 5 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export type Session = {
  id: string;
  csrfToken: string;
  expiresAt: string;
  stepUpUntil: string | null;
};

type SessionRow = {
  id: string;
  csrf_token: string;
  expires_at: string;
  step_up_until: string | null;
};

function asCount(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return 0;
}

export async function isAuthConfigured(): Promise<boolean> {
  const row = await qGet("select value from app_meta where key = ?", ["passphrase_hash"]);
  return typeof row?.value === "string" && row.value.length > 0;
}

async function storedHash(): Promise<string | null> {
  const row = await qGet("select value from app_meta where key = ?", ["passphrase_hash"]);
  return typeof row?.value === "string" ? row.value : null;
}

async function pruneAttempts(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await qRun("delete from login_attempts where at < ?", [cutoff]);
}

async function tooManyAttempts(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const row = await qGet("select count(*) as n from login_attempts where ip = ? and at > ?", [ip, since]);
  return asCount(row?.n) >= MAX_ATTEMPTS;
}

async function recordFailure(ip: string): Promise<void> {
  await qRun("insert into login_attempts (ip, at) values (?, ?)", [ip, new Date().toISOString()]);
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
    stepUpUntil: row.step_up_until,
  };
}

export async function getSession(id: string | null | undefined): Promise<Session | null> {
  if (!id || id.length > 200) return null;
  const row = (await qGet(
    "select id, csrf_token, expires_at, step_up_until from sessions where id = ?",
    [id],
  )) as SessionRow | undefined;
  if (!row?.id) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await qRun("delete from sessions where id = ?", [id]);
    return null;
  }
  return mapSession(row);
}

export async function destroySession(id: string): Promise<void> {
  await qRun("delete from sessions where id = ?", [id]);
}

async function createSession(stepUpUntil: string | null): Promise<Session> {
  const session: Session = {
    id: randomBytes(32).toString("base64url"),
    csrfToken: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + SESSION_MS).toISOString(),
    stepUpUntil,
  };
  await qRun(
    "insert into sessions (id, csrf_token, expires_at, step_up_until, created_at) values (?, ?, ?, ?, ?)",
    [session.id, session.csrfToken, session.expiresAt, session.stepUpUntil, new Date().toISOString()],
  );
  return session;
}

async function assertPassphrase(passphrase: string, ip: string): Promise<void> {
  if (typeof passphrase !== "string" || passphrase.length === 0 || passphrase.length > 500) {
    throw new AppError(401, "Frase de acesso incorreta.");
  }
  await pruneAttempts();
  if (await tooManyAttempts(ip)) throw new AppError(429, "Muitas tentativas. Espere alguns minutos.");
  const hash = await storedHash();
  if (!hash) {
    throw new AppError(503, "O acesso ainda não foi configurado neste servidor.", "auth_unconfigured");
  }
  if (!verifyPassphrase(passphrase, hash)) {
    await recordFailure(ip);
    throw new AppError(401, "Frase de acesso incorreta.");
  }
}

export async function login(passphrase: string, ip: string): Promise<Session> {
  await assertPassphrase(passphrase, ip);
  return createSession(null);
}

export async function stepUp(sessionId: string, passphrase: string, ip: string): Promise<Session> {
  await assertPassphrase(passphrase, ip);
  const until = new Date(Date.now() + STEP_UP_MS).toISOString();
  await qRun("update sessions set step_up_until = ? where id = ?", [until, sessionId]);
  const session = await getSession(sessionId);
  if (!session) throw new AppError(401, "Sessão expirada. Entre de novo.");
  return session;
}
