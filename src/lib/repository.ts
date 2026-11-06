import { randomUUID } from "crypto";
import { SECRET_FIELDS, isStatus, isStoredStatus, type EmailProvider, type SecretField, type Status, type StoredStatus } from "./constants";
import { decryptField, encryptField, fieldAad, loadDataKey, vaultStatus } from "./crypto-box";
import { AppError } from "./errors";
import { qAll, qGet, qRun, withTx, type SqlRow, type SqlValue } from "./sql";
import type {
  BmInput,
  BmPublic,
  BmUpdate,
  CreateProfileInput,
  EmailAccessState,
  Inventory,
  ProfileDetail,
  ProfilePublic,
  ProfileUpdate,
  SecretDraft,
  SecretPatch,
  SecretPresence,
} from "./types";
import { emptyPresence } from "./validators";

function text(value: SqlValue | undefined): string {
  if (typeof value === "string") return value;
  throw new AppError(500, "Não foi possível concluir. Tente de novo.");
}

function nullableText(value: SqlValue | undefined): string | null {
  if (value == null) return null;
  return text(value);
}

function integer(value: SqlValue | undefined): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  throw new AppError(500, "Não foi possível concluir. Tente de novo.");
}

function statusOf(value: SqlValue | undefined): StoredStatus {
  if (typeof value === "string" && isStoredStatus(value)) return value;
  throw new AppError(500, "Não foi possível concluir. Tente de novo.");
}

function commitStatus(existing: StoredStatus, next: StoredStatus): StoredStatus {
  if (isStatus(next) || next === existing) return next;
  throw new AppError(400, "Escolha um status: Ativo ou Restrito.");
}

function isUnique(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  return code === "23505" || code.includes("SQLITE_CONSTRAINT") || /unique/i.test(error.message);
}

async function presenceFor(profileId: string, service: string): Promise<SecretPresence> {
  const presence = emptyPresence();
  const rows = await qAll("select field from secret_fields where profile_id = ? and service = ?", [profileId, service]);
  for (const row of rows) {
    const field = text(row.field);
    if ((SECRET_FIELDS as readonly string[]).includes(field)) presence[field as SecretField] = true;
  }
  return presence;
}

async function hasAnySecret(profileId: string): Promise<boolean> {
  const row = await qGet("select 1 as ok from secret_fields where profile_id = ? limit 1", [profileId]);
  return Boolean(row);
}

async function bmIdsFor(profileId: string): Promise<string[]> {
  const rows = await qAll("select bm_id from profile_bms where profile_id = ? order by bm_id", [profileId]);
  return rows.map((row) => text(row.bm_id));
}

async function profileIdsFor(bmId: string): Promise<string[]> {
  const rows = await qAll("select profile_id from profile_bms where bm_id = ? order by profile_id", [bmId]);
  return rows.map((row) => text(row.profile_id));
}

function profileFrom(row: SqlRow, bmIds: string[], hasAccess: boolean, emailUsername: string | null): ProfilePublic {
  return {
    id: text(row.id),
    recordNumber: integer(row.record_number),
    displayName: nullableText(row.display_name),
    metaProfileId: nullableText(row.meta_profile_id),
    profileUrl: nullableText(row.profile_url),
    status: statusOf(row.status),
    responsible: nullableText(row.responsible),
    notes: nullableText(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    bmIds,
    hasAccess,
    emailUsername,
  };
}

async function emailUsernameFor(profileId: string, stored: string | null): Promise<string | null> {
  const current = stored?.trim() || null;
  if (current) return current;
  if (vaultStatus() !== "ready") return null;
  const row = await qGet("select ciphertext from secret_fields where profile_id = ? and service = ? and field = ?", [
    profileId,
    "email",
    "username",
  ]);
  if (!row) return null;
  try {
    const value = decryptField(text(row.ciphertext), fieldAad(profileId, "email", "username")).trim();
    if (!value) return null;
    await qRun("update profiles set email_username = ? where id = ? and email_username is null", [value, profileId]);
    return value;
  } catch {
    return null;
  }
}

function bmFrom(row: SqlRow, profileIds: string[]): BmPublic {
  return {
    id: text(row.id),
    name: text(row.name),
    metaBmId: text(row.meta_bm_id),
    status: statusOf(row.status),
    responsible: nullableText(row.responsible),
    notes: nullableText(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    profileIds,
  };
}

async function requireProfileRow(id: string): Promise<SqlRow> {
  const row = await qGet("select * from profiles where id = ?", [id]);
  if (!row) throw new AppError(404, "Perfil não encontrado.");
  return row;
}

async function requireBmRow(id: string): Promise<SqlRow> {
  const row = await qGet("select * from bms where id = ?", [id]);
  if (!row) throw new AppError(404, "BM não encontrada.");
  return row;
}

async function emailState(profileId: string): Promise<EmailAccessState> {
  const row = await qGet("select provider, other_label from email_providers where profile_id = ?", [profileId]);
  return {
    ...(await presenceFor(profileId, "email")),
    provider: row ? (text(row.provider) as EmailProvider) : null,
    otherLabel: row ? nullableText(row.other_label) : null,
  };
}

async function toDetail(row: SqlRow): Promise<ProfileDetail> {
  const id = text(row.id);
  return {
    ...profileFrom(row, await bmIdsFor(id), await hasAnySecret(id), await emailUsernameFor(id, nullableText(row.email_username))),
    vault: vaultStatus(),
    meta: await presenceFor(id, "meta"),
    email: await emailState(id),
  };
}

async function publicProfile(row: SqlRow): Promise<ProfilePublic> {
  const id = text(row.id);
  return profileFrom(row, await bmIdsFor(id), await hasAnySecret(id), await emailUsernameFor(id, nullableText(row.email_username)));
}

export async function listInventory(): Promise<Inventory> {
  const profileRows = await qAll("select * from profiles order by record_number");
  const bmRows = await qAll("select * from bms order by name");
  return {
    profiles: await Promise.all(profileRows.map((row) => publicProfile(row))),
    bms: await Promise.all(bmRows.map(async (row) => bmFrom(row, await profileIdsFor(text(row.id))))),
    vault: vaultStatus(),
  };
}

export async function getProfile(id: string): Promise<ProfileDetail | null> {
  const row = await qGet("select * from profiles where id = ?", [id]);
  if (!row) return null;
  return toDetail(row);
}

async function assertBms(ids: string[]): Promise<void> {
  for (const id of ids) {
    if (!(await qGet("select id from bms where id = ?", [id]))) {
      throw new AppError(400, "Uma das BMs vinculadas não existe.");
    }
  }
}

async function assertProfiles(ids: string[]): Promise<void> {
  for (const id of ids) {
    if (!(await qGet("select id from profiles where id = ?", [id]))) {
      throw new AppError(400, "Um dos perfis vinculados não existe.");
    }
  }
}

async function replaceProfileLinks(profileId: string, bmIds: string[]): Promise<void> {
  await assertBms(bmIds);
  await qRun("delete from profile_bms where profile_id = ?", [profileId]);
  for (const bmId of bmIds) {
    await qRun("insert into profile_bms (profile_id, bm_id) values (?, ?)", [profileId, bmId]);
  }
}

async function replaceBmLinks(bmId: string, profileIds: string[]): Promise<void> {
  await assertProfiles(profileIds);
  await qRun("delete from profile_bms where bm_id = ?", [bmId]);
  for (const profileId of profileIds) {
    await qRun("insert into profile_bms (profile_id, bm_id) values (?, ?)", [profileId, bmId]);
  }
}

async function writeDraft(profileId: string, service: string, draft: SecretDraft | undefined, now: string): Promise<void> {
  if (!draft) return;
  for (const field of SECRET_FIELDS) {
    const value = draft[field];
    if (!value) continue;
    await qRun(
      `insert into secret_fields (profile_id, service, field, ciphertext, updated_at)
       values (?, ?, ?, ?, ?)
       on conflict(profile_id, service, field) do update set ciphertext = excluded.ciphertext, updated_at = excluded.updated_at`,
      [profileId, service, field, encryptField(value, fieldAad(profileId, service, field)), now],
    );
  }
}

function draftHasSecret(draft: SecretDraft | undefined): boolean {
  if (!draft) return false;
  return SECRET_FIELDS.some((field) => Boolean(draft[field]));
}

async function nextRecordNumber(): Promise<number> {
  const row = await qGet("select coalesce(max(record_number), 0) + 1 as n from profiles");
  const next = integer(row?.n);
  if (next < 1 || next > 999999) throw new AppError(409, "Não há número de registro disponível.");
  return next;
}

export async function createProfile(input: CreateProfileInput): Promise<ProfilePublic> {
  if (draftHasSecret(input.meta) || draftHasSecret(input.email)) loadDataKey();
  const id = randomUUID();
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await withTx(async () => {
        const recordNumber = await nextRecordNumber();
        await qRun(
          `insert into profiles (
            id, record_number, display_name, meta_profile_id, profile_url, status, responsible, notes, email_username, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            recordNumber,
            input.displayName,
            input.metaProfileId,
            input.profileUrl,
            input.status,
            input.responsible,
            input.notes,
            input.email?.username?.trim() || null,
            now,
            now,
          ],
        );
        await replaceProfileLinks(id, input.bmIds);
        await writeDraft(id, "meta", input.meta, now);
        if (input.email) {
          await qRun(
            "insert into email_providers (profile_id, provider, other_label, updated_at) values (?, ?, ?, ?)",
            [id, input.email.provider, input.email.otherLabel, now],
          );
          await writeDraft(id, "email", input.email, now);
        }
      });
      return publicProfile(await requireProfileRow(id));
    } catch (error) {
      if (!isUnique(error) || attempt === 2) {
        if (isUnique(error)) throw new AppError(409, "Não foi possível reservar o número do registro. Tente de novo.");
        throw error;
      }
    }
  }
  throw new AppError(409, "Não foi possível reservar o número do registro. Tente de novo.");
}

export async function updateProfile(id: string, input: ProfileUpdate): Promise<ProfilePublic> {
  const existing = await requireProfileRow(id);
  const status = commitStatus(statusOf(existing.status), input.status);
  const now = new Date().toISOString();
  await withTx(async () => {
    await qRun(
      `update profiles set display_name = ?, meta_profile_id = ?, profile_url = ?, status = ?,
       responsible = ?, notes = ?, updated_at = ? where id = ?`,
      [input.displayName, input.metaProfileId, input.profileUrl, status, input.responsible, input.notes, now, id],
    );
    await replaceProfileLinks(id, input.bmIds);
  });
  return publicProfile(await requireProfileRow(id));
}

export async function setProfileStatus(id: string, status: Status): Promise<ProfilePublic> {
  await requireProfileRow(id);
  await qRun("update profiles set status = ?, updated_at = ? where id = ?", [status, new Date().toISOString(), id]);
  return publicProfile(await requireProfileRow(id));
}

export async function createBm(input: BmInput): Promise<BmPublic> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await withTx(async () => {
    try {
      await qRun(
        `insert into bms (id, name, meta_bm_id, status, responsible, notes, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.name, input.metaBmId, input.status, input.responsible, input.notes, now, now],
      );
    } catch (error) {
      if (isUnique(error)) throw new AppError(409, "Já existe uma BM com esse ID da Meta.");
      throw error;
    }
    await replaceBmLinks(id, input.profileIds);
  });
  const row = await requireBmRow(id);
  return bmFrom(row, await profileIdsFor(id));
}

export async function updateBm(id: string, input: BmUpdate): Promise<BmPublic> {
  const existing = await requireBmRow(id);
  const status = commitStatus(statusOf(existing.status), input.status);
  const now = new Date().toISOString();
  await withTx(async () => {
    try {
      await qRun(
        "update bms set name = ?, meta_bm_id = ?, status = ?, responsible = ?, notes = ?, updated_at = ? where id = ?",
        [input.name, input.metaBmId, status, input.responsible, input.notes, now, id],
      );
    } catch (error) {
      if (isUnique(error)) throw new AppError(409, "Já existe uma BM com esse ID da Meta.");
      throw error;
    }
    await replaceBmLinks(id, input.profileIds);
  });
  return bmFrom(await requireBmRow(id), await profileIdsFor(id));
}

export async function setBmStatus(id: string, status: Status): Promise<BmPublic> {
  await requireBmRow(id);
  await qRun("update bms set status = ?, updated_at = ? where id = ?", [status, new Date().toISOString(), id]);
  return bmFrom(await requireBmRow(id), await profileIdsFor(id));
}

function patchNeedsKey(patch: SecretPatch): boolean {
  return SECRET_FIELDS.some((field) => typeof patch[field] === "string");
}

export async function saveSecrets(profileId: string, patch: SecretPatch): Promise<ProfileDetail> {
  await requireProfileRow(profileId);
  if (patchNeedsKey(patch)) loadDataKey();
  const now = new Date().toISOString();
  await withTx(async () => {
    for (const field of SECRET_FIELDS) {
      const value = patch[field];
      if (value === undefined) continue;
      if (value === null) {
        await qRun("delete from secret_fields where profile_id = ? and service = ? and field = ?", [
          profileId,
          patch.service,
          field,
        ]);
      } else {
        await qRun(
          `insert into secret_fields (profile_id, service, field, ciphertext, updated_at)
           values (?, ?, ?, ?, ?)
           on conflict(profile_id, service, field) do update set ciphertext = excluded.ciphertext, updated_at = excluded.updated_at`,
          [profileId, patch.service, field, encryptField(value, fieldAad(profileId, patch.service, field)), now],
        );
      }
    }
    if (patch.service === "email" && patch.provider) {
      await qRun(
        `insert into email_providers (profile_id, provider, other_label, updated_at) values (?, ?, ?, ?)
         on conflict(profile_id) do update set provider = excluded.provider, other_label = excluded.other_label, updated_at = excluded.updated_at`,
        [profileId, patch.provider, patch.otherLabel ?? null, now],
      );
    }
    if (patch.service === "email" && patch.username !== undefined) {
      await qRun("update profiles set email_username = ? where id = ?", [patch.username?.trim() || null, profileId]);
    }
    await qRun("update profiles set updated_at = ? where id = ?", [now, profileId]);
  });
  return toDetail(await requireProfileRow(profileId));
}

export async function revealSecret(profileId: string, service: "meta" | "email", field: SecretField): Promise<string> {
  await requireProfileRow(profileId);
  const row = await qGet(
    "select ciphertext from secret_fields where profile_id = ? and service = ? and field = ?",
    [profileId, service, field],
  );
  if (!row) throw new AppError(404, "Esse dado ainda não foi cadastrado.");
  return decryptField(text(row.ciphertext), fieldAad(profileId, service, field));
}
