import {
  EMAIL_PROVIDERS,
  SECRET_FIELDS,
  STATUSES,
  type AccessService,
  type EmailProvider,
  type SecretField,
  type Status,
} from "./constants";
import type {
  BmInput,
  CreateProfileInput,
  EmailDraft,
  ProfileInput,
  SecretDraft,
  SecretPatch,
} from "./types";

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string): Parsed<never> {
  return { ok: false, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectTopLevelSecrets(record: Record<string, unknown>): Parsed<never> | null {
  const banned = new Set([
    "password",
    "senha",
    "username",
    "login",
    "totp",
    "otp",
    "recovery",
    "recoverycodes",
    "token",
    "secret",
    "email",
  ]);
  for (const key of Object.keys(record)) {
    if (banned.has(key.toLowerCase())) {
      return fail("Envie login e senha somente nos blocos de acesso Meta e e-mail.");
    }
  }
  return null;
}

export function parseStatus(value: unknown): Parsed<Status> {
  if (typeof value === "string" && (STATUSES as readonly string[]).includes(value)) {
    return { ok: true, value: value as Status };
  }
  return fail("Escolha um status: Ativo, Offline, Restrito ou Em análise.");
}

export function parseRecordNumber(value: unknown): Parsed<number> {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 999999) {
    return { ok: true, value };
  }
  if (typeof value === "string" && /^[1-9]\d{0,5}$/.test(value.trim())) {
    return { ok: true, value: Number(value.trim()) };
  }
  return fail("Informe o número do registro.");
}

export function parseDigits(value: unknown, label: string, required: boolean): Parsed<string | null> {
  if (value == null || value === "") {
    return required ? fail(`Informe ${label}.`) : { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return fail(`${label} precisa ser texto, para não cortar dígitos.`);
  }
  const digits = value.trim().replace(/\s+/g, "");
  if (!digits) return required ? fail(`Informe ${label}.`) : { ok: true, value: null };
  if (!/^\d{1,32}$/.test(digits)) return fail(`${label} deve ter só dígitos (até 32).`);
  return { ok: true, value: digits };
}

export function parseHttpsUrl(value: unknown): Parsed<string | null> {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return fail("Link inválido.");
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > 500) return fail("O link é longo demais.");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return fail("O link precisa ser um endereço https válido.");
  }
  if (url.protocol !== "https:") return fail("O link precisa começar com https.");
  if (url.username || url.password) return fail("Não coloque usuário ou senha no link.");
  return { ok: true, value: url.toString() };
}

function parseText(
  value: unknown,
  label: string,
  max: number,
  required: boolean,
): Parsed<string | null> {
  if (value == null) return required ? fail(`Informe ${label}.`) : { ok: true, value: null };
  if (typeof value !== "string") return fail(`${label} inválido.`);
  const trimmed = value.trim();
  if (!trimmed) return required ? fail(`Informe ${label}.`) : { ok: true, value: null };
  if (trimmed.length > max) return fail(`${label} pode ter no máximo ${max} caracteres.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(trimmed)) {
    return fail(`${label} contém caractere inválido.`);
  }
  return { ok: true, value: trimmed };
}

function parseLine(value: unknown, label: string, max: number, required: boolean): Parsed<string | null> {
  const parsed = parseText(value, label, max, required);
  if (!parsed.ok || parsed.value == null) return parsed;
  if (/[\r\n]/.test(parsed.value)) return fail(`${label} deve ficar em uma linha.`);
  return parsed;
}

function parseIdList(value: unknown, label: string): Parsed<string[]> {
  if (value == null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail(`${label} inválidos.`);
  if (value.length > 100) return fail(`Há ${label} demais.`);
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !UUID.test(item)) return fail(`${label} inválidos.`);
    if (!ids.includes(item)) ids.push(item);
  }
  return { ok: true, value: ids };
}

function parseProfileFields(record: Record<string, unknown>): Parsed<ProfileInput> {
  const recordNumber = parseRecordNumber(record.recordNumber);
  if (!recordNumber.ok) return recordNumber;
  const displayName = parseLine(record.displayName, "O nome", 120, false);
  if (!displayName.ok) return displayName;
  const metaProfileId = parseDigits(record.metaProfileId, "o ID do perfil na Meta", false);
  if (!metaProfileId.ok) return metaProfileId;
  const profileUrl = parseHttpsUrl(record.profileUrl);
  if (!profileUrl.ok) return profileUrl;
  const status = parseStatus(record.status);
  if (!status.ok) return status;
  const responsible = parseLine(record.responsible, "O responsável", 120, false);
  if (!responsible.ok) return responsible;
  const notes = parseText(record.notes, "As notas", 2000, false);
  if (!notes.ok) return notes;
  const bmIds = parseIdList(record.bmIds, "vínculos de BM");
  if (!bmIds.ok) return bmIds;
  return {
    ok: true,
    value: {
      recordNumber: recordNumber.value,
      displayName: displayName.value,
      metaProfileId: metaProfileId.value,
      profileUrl: profileUrl.value,
      status: status.value,
      responsible: responsible.value,
      notes: notes.value,
      bmIds: bmIds.value,
    },
  };
}

export function parseProfileInput(body: unknown): Parsed<ProfileInput> {
  if (!isRecord(body)) return fail("Dados inválidos.");
  if ("meta" in body || "email" in body) {
    return fail("Envie o acesso pelo bloco correspondente, separado dos dados do perfil.");
  }
  const banned = rejectTopLevelSecrets(body);
  if (banned) return banned;
  return parseProfileFields(body);
}

function parseUsername(value: unknown): Parsed<string | undefined> {
  if (value == null || value === "") return { ok: true, value: undefined };
  if (typeof value !== "string") return fail("Usuário inválido.");
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: undefined };
  if (trimmed.length > 254) return fail("O usuário pode ter no máximo 254 caracteres.");
  if (/[\u0000-\u001F]/.test(trimmed)) return fail("Usuário inválido.");
  return { ok: true, value: trimmed };
}

function parsePassword(value: unknown): Parsed<string | undefined> {
  if (value == null || value === "") return { ok: true, value: undefined };
  if (typeof value !== "string") return fail("Senha inválida.");
  if (value.length > 500) return fail("A senha pode ter no máximo 500 caracteres.");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value) || /[\r\n]/.test(value)) {
    return fail("Senha inválida.");
  }
  if (!value.trim()) return fail("Senha vazia.");
  return { ok: true, value };
}

function parseTotp(value: unknown): Parsed<string | undefined> {
  if (value == null || value === "") return { ok: true, value: undefined };
  if (typeof value !== "string") return fail("Código 2FA inválido.");
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  if (!compact) return { ok: true, value: undefined };
  if (!/^[A-Z2-7]{8,128}$/.test(compact)) {
    return fail("Código 2FA inválido. Cole o segredo em base32.");
  }
  return { ok: true, value: compact };
}

function parseRecovery(value: unknown): Parsed<string | undefined> {
  if (value == null || value === "") return { ok: true, value: undefined };
  if (typeof value !== "string") return fail("Códigos de recuperação inválidos.");
  if (!value.trim()) return { ok: true, value: undefined };
  if (value.length > 4000) return fail("Os códigos de recuperação passam de 4000 caracteres.");
  if (value.includes("\0")) return fail("Códigos de recuperação inválidos.");
  return { ok: true, value: value.trim() };
}

function parseSecretDraft(record: Record<string, unknown>): Parsed<SecretDraft | undefined> {
  const username = parseUsername(record.username);
  if (!username.ok) return username;
  const password = parsePassword(record.password);
  if (!password.ok) return password;
  const totp = parseTotp(record.totp);
  if (!totp.ok) return totp;
  const recovery = parseRecovery(record.recovery);
  if (!recovery.ok) return recovery;
  const draft: SecretDraft = {};
  if (username.value) draft.username = username.value;
  if (password.value) draft.password = password.value;
  if (totp.value) draft.totp = totp.value;
  if (recovery.value) draft.recovery = recovery.value;
  return { ok: true, value: Object.keys(draft).length ? draft : undefined };
}

function parseProvider(value: unknown): Parsed<EmailProvider | undefined> {
  if (value == null || value === "") return { ok: true, value: undefined };
  if (typeof value === "string" && (EMAIL_PROVIDERS as readonly string[]).includes(value)) {
    return { ok: true, value: value as EmailProvider };
  }
  return fail("Selecione o provedor de e-mail.");
}

export function parseCreateProfile(body: unknown): Parsed<CreateProfileInput> {
  if (!isRecord(body)) return fail("Dados inválidos.");
  const rest = { ...body };
  delete rest.meta;
  delete rest.email;
  const banned = rejectTopLevelSecrets(rest);
  if (banned) return banned;
  const profile = parseProfileFields(rest);
  if (!profile.ok) return profile;

  let meta: SecretDraft | undefined;
  if (body.meta != null) {
    if (!isRecord(body.meta)) return fail("Acesso Meta inválido.");
    const parsed = parseSecretDraft(body.meta);
    if (!parsed.ok) return parsed;
    meta = parsed.value;
  }

  let email: EmailDraft | undefined;
  if (body.email != null) {
    if (!isRecord(body.email)) return fail("Acesso de e-mail inválido.");
    const parsed = parseSecretDraft(body.email);
    if (!parsed.ok) return parsed;
    const provider = parseProvider(body.email.provider);
    if (!provider.ok) return provider;
    const other = parseLine(body.email.otherLabel, "O provedor", 60, false);
    if (!other.ok) return other;
    if (parsed.value && !provider.value) return fail("Selecione o provedor de e-mail.");
    if (provider.value === "other" && !other.value) return fail("Informe qual é o outro provedor.");
    if (provider.value) {
      email = {
        ...parsed.value,
        provider: provider.value,
        otherLabel: provider.value === "other" ? other.value : null,
      };
    }
  }

  return { ok: true, value: { ...profile.value, meta, email } };
}

function parsePatchValue(field: SecretField, value: unknown): Parsed<string | null | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (field === "username") {
    const parsed = parseUsername(value);
    if (!parsed.ok) return parsed;
    return { ok: true, value: parsed.value };
  }
  if (field === "password") {
    const parsed = parsePassword(value);
    if (!parsed.ok) return parsed;
    return { ok: true, value: parsed.value };
  }
  if (field === "totp") {
    const parsed = parseTotp(value);
    if (!parsed.ok) return parsed;
    return { ok: true, value: parsed.value };
  }
  const parsed = parseRecovery(value);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

export function parseSecretPatch(body: unknown): Parsed<SecretPatch> {
  if (!isRecord(body)) return fail("Dados inválidos.");
  if (body.service !== "meta" && body.service !== "email") return fail("Acesso inválido.");
  const service = body.service as AccessService;
  const patch: SecretPatch = { service };
  let touched = false;
  for (const field of SECRET_FIELDS) {
    const parsed = parsePatchValue(field, body[field]);
    if (!parsed.ok) return parsed;
    if (parsed.value !== undefined) {
      patch[field] = parsed.value;
      touched = true;
    }
  }
  if (service === "email") {
    const provider = parseProvider(body.provider);
    if (!provider.ok) return provider;
    if (!provider.value) return fail("Selecione o provedor de e-mail.");
    const other = parseLine(body.otherLabel, "O provedor", 60, false);
    if (!other.ok) return other;
    if (provider.value === "other" && !other.value) return fail("Informe qual é o outro provedor.");
    patch.provider = provider.value;
    patch.otherLabel = provider.value === "other" ? other.value : null;
    touched = true;
  }
  if (!touched) return fail("Nada para salvar neste acesso.");
  return { ok: true, value: patch };
}

export function parseReveal(body: unknown): Parsed<{ service: AccessService; field: SecretField }> {
  if (!isRecord(body)) return fail("Dados inválidos.");
  if (body.service !== "meta" && body.service !== "email") return fail("Acesso inválido.");
  if (typeof body.field !== "string" || !(SECRET_FIELDS as readonly string[]).includes(body.field)) {
    return fail("Campo de acesso inválido.");
  }
  return { ok: true, value: { service: body.service, field: body.field as SecretField } };
}

export function parseBmInput(body: unknown): Parsed<BmInput> {
  if (!isRecord(body)) return fail("Dados inválidos.");
  const banned = rejectTopLevelSecrets(body);
  if (banned) return banned;
  const name = parseLine(body.name, "O nome da BM", 160, true);
  if (!name.ok) return name;
  const metaBmId = parseDigits(body.metaBmId, "o ID da BM na Meta", true);
  if (!metaBmId.ok || !metaBmId.value) return fail("Informe o ID da BM na Meta.");
  const status = parseStatus(body.status);
  if (!status.ok) return status;
  const responsible = parseLine(body.responsible, "O responsável", 120, false);
  if (!responsible.ok) return responsible;
  const notes = parseText(body.notes, "As notas", 2000, false);
  if (!notes.ok) return notes;
  const profileIds = parseIdList(body.profileIds, "vínculos de perfil");
  if (!profileIds.ok) return profileIds;
  return {
    ok: true,
    value: {
      name: name.value as string,
      metaBmId: metaBmId.value,
      status: status.value,
      responsible: responsible.value,
      notes: notes.value,
      profileIds: profileIds.value,
    },
  };
}

export function parseStatusBody(body: unknown): Parsed<Status> {
  if (!isRecord(body)) return fail("Dados inválidos.");
  return parseStatus(body.status);
}

export function emptyPresence(): Record<SecretField, boolean> {
  return { username: false, password: false, totp: false, recovery: false };
}
