import { AsyncLocalStorage } from "async_hooks";
import { mkdirSync } from "fs";
import type { Pool, PoolClient } from "pg";
import path from "path";
import { AppError } from "./errors";
import { configuredPassphrase, hashPassphrase } from "./passphrase";

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlRow = Record<string, SqlValue | undefined>;

type Runner = {
  all(sql: string, params: unknown[]): Promise<SqlRow[]>;
  get(sql: string, params: unknown[]): Promise<SqlRow | undefined>;
  run(sql: string, params: unknown[]): Promise<void>;
};

const txStore = new AsyncLocalStorage<Runner>();

type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): SqlRow[];
    get(...params: unknown[]): SqlRow | undefined;
    run(...params: unknown[]): unknown;
  };
  close(): void;
};

const globalSql = globalThis as unknown as {
  __looteaSql?: {
    mode: "postgres" | "sqlite";
    ready: Promise<void> | null;
    sqlite?: SqliteDb;
    sqliteFile?: string;
    pool?: Pool;
  };
};

function slot() {
  if (!globalSql.__looteaSql) {
    globalSql.__looteaSql = { mode: "sqlite", ready: null };
  }
  return globalSql.__looteaSql;
}

export function resolveDatabaseTarget(env: { DATABASE_URL?: string; VERCEL?: string }): "postgres" | "sqlite" {
  if (env.DATABASE_URL?.trim()) return "postgres";
  if (env.VERCEL) {
    throw new AppError(
      503,
      "Na Vercel este painel precisa de DATABASE_URL. O SQLite local não persiste nesse ambiente.",
      "database_unconfigured",
    );
  }
  return "sqlite";
}

export function toPostgres(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function databaseFile(): string {
  return process.env.INVENTORY_DB_PATH || path.join(process.cwd(), "data", "inventory.db");
}

const SCHEMA = `
  create table if not exists app_meta (
    key text primary key,
    value text not null
  );
  create table if not exists profiles (
    id text primary key,
    record_number integer not null unique,
    display_name text,
    meta_profile_id text,
    profile_url text,
    status text not null,
    responsible text,
    notes text,
    email_username text,
    created_at text not null,
    updated_at text not null
  );
  create table if not exists bms (
    id text primary key,
    name text not null,
    meta_bm_id text not null unique,
    status text not null,
    responsible text,
    notes text,
    created_at text not null,
    updated_at text not null
  );
  create table if not exists profile_bms (
    profile_id text not null,
    bm_id text not null,
    primary key (profile_id, bm_id)
  );
  create table if not exists secret_fields (
    profile_id text not null,
    service text not null,
    field text not null,
    ciphertext text not null,
    updated_at text not null,
    primary key (profile_id, service, field)
  );
  create table if not exists email_providers (
    profile_id text primary key,
    provider text not null,
    other_label text,
    updated_at text not null
  );
  create table if not exists sessions (
    id text primary key,
    csrf_token text not null,
    expires_at text not null,
    step_up_until text,
    created_at text not null
  );
`;

function sqliteRunner(db: SqliteDb): Runner {
  return {
    async all(sql, params) {
      return db.prepare(sql).all(...params);
    },
    async get(sql, params) {
      return db.prepare(sql).get(...params);
    },
    async run(sql, params) {
      db.prepare(sql).run(...params);
    },
  };
}

function pgRunner(query: Pool | PoolClient): Runner {
  return {
    async all(sql, params) {
      const result = await query.query(toPostgres(sql), params);
      return result.rows as SqlRow[];
    },
    async get(sql, params) {
      const result = await query.query(toPostgres(sql), params);
      return (result.rows[0] as SqlRow | undefined) ?? undefined;
    },
    async run(sql, params) {
      await query.query(toPostgres(sql), params);
    },
  };
}

async function openSqlite(file: string): Promise<SqliteDb> {
  const { DatabaseSync } = await import("node:sqlite");
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("pragma journal_mode = WAL");
  db.exec("pragma foreign_keys = ON");
  db.exec("pragma busy_timeout = 3000");
  db.exec(SCHEMA);
  try {
    db.exec("alter table profiles add column email_username text");
  } catch (error) {
    if (!/duplicate column/i.test(String(error))) throw error;
  }
  db.exec(`
    create table if not exists login_attempts (
      id integer primary key,
      ip text not null,
      at text not null
    );
  `);
  return db as unknown as SqliteDb;
}

function sslFor(connectionString: string): { rejectUnauthorized: false } | undefined {
  if (/sslmode=disable/.test(connectionString)) return undefined;
  if (/@(localhost|127\.0\.0\.1)(:|\/|\?|$)/.test(connectionString)) return undefined;
  return { rejectUnauthorized: false };
}

async function openPool(connectionString: string): Promise<Pool> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
    ssl: sslFor(connectionString),
  });
  const client = await pool.connect();
  try {
    await client.query(SCHEMA);
    try {
      await client.query("alter table profiles add column email_username text");
    } catch (error) {
      if (!/already exists/i.test(String(error))) throw error;
    }
    await client.query(`
      create table if not exists login_attempts (
        id integer generated by default as identity primary key,
        ip text not null,
        at text not null
      );
    `);
  } finally {
    client.release();
  }
  return pool;
}

async function ensurePassphrase(runner: Runner): Promise<void> {
  const existing = await runner.get("select value from app_meta where key = ?", ["passphrase_hash"]);
  if (typeof existing?.value === "string" && existing.value) return;
  const passphrase = configuredPassphrase();
  if (!passphrase) return;
  await runner.run("insert into app_meta (key, value) values (?, ?)", ["passphrase_hash", hashPassphrase(passphrase)]);
}

async function init(): Promise<void> {
  const state = slot();
  const mode = resolveDatabaseTarget({
    DATABASE_URL: process.env.DATABASE_URL,
    VERCEL: process.env.VERCEL,
  });
  state.mode = mode;
  if (mode === "postgres") {
    const connectionString = process.env.DATABASE_URL!.trim();
    state.pool = await openPool(connectionString);
    await ensurePassphrase(pgRunner(state.pool));
    return;
  }
  const file = databaseFile();
  if (state.sqlite && state.sqliteFile !== file) {
    state.sqlite.close();
    state.sqlite = undefined;
  }
  if (!state.sqlite) {
    state.sqlite = await openSqlite(file);
    state.sqliteFile = file;
  }
  await ensurePassphrase(sqliteRunner(state.sqlite));
}

function ready(): Promise<void> {
  const state = slot();
  if (!state.ready) {
    state.ready = init().catch((error) => {
      state.ready = null;
      throw error;
    });
  }
  return state.ready;
}

async function runner(): Promise<Runner> {
  const current = txStore.getStore();
  if (current) return current;
  await ready();
  const state = slot();
  if (state.mode === "postgres") {
    if (!state.pool) throw new AppError(503, "Não foi possível abrir o banco.");
    return pgRunner(state.pool);
  }
  if (!state.sqlite) throw new AppError(503, "Não foi possível abrir o banco.");
  return sqliteRunner(state.sqlite);
}

export async function qAll(sql: string, params: unknown[] = []): Promise<SqlRow[]> {
  const db = await runner();
  return db.all(sql, params);
}

export async function qGet(sql: string, params: unknown[] = []): Promise<SqlRow | undefined> {
  const db = await runner();
  return db.get(sql, params);
}

export async function qRun(sql: string, params: unknown[] = []): Promise<void> {
  const db = await runner();
  await db.run(sql, params);
}

export async function withTx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  await ready();
  const state = slot();
  if (state.mode === "sqlite") {
    if (!state.sqlite) throw new AppError(503, "Não foi possível abrir o banco.");
    state.sqlite.exec("begin immediate");
    try {
      const result = await txStore.run(sqliteRunner(state.sqlite), fn);
      state.sqlite.exec("commit");
      return result;
    } catch (error) {
      try {
        state.sqlite.exec("rollback");
      } catch {
        /* keep the original error */
      }
      throw error;
    }
  }
  if (!state.pool) throw new AppError(503, "Não foi possível abrir o banco.");
  const client = await state.pool.connect();
  try {
    await client.query("begin");
    const result = await txStore.run(pgRunner(client), fn);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* keep the original error */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function checkpointLocal(): Promise<void> {
  await ready();
  const state = slot();
  if (state.mode !== "sqlite" || !state.sqlite) return;
  state.sqlite.exec("pragma wal_checkpoint(full)");
}

export async function closeDb(): Promise<void> {
  const state = slot();
  state.ready = null;
  if (state.sqlite) {
    state.sqlite.close();
    state.sqlite = undefined;
  }
  if (state.pool) {
    await state.pool.end();
    state.pool = undefined;
  }
}
