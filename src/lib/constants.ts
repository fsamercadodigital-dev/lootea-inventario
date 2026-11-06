export const STATUSES = ["Ativo", "Restrito"] as const;

export type Status = (typeof STATUSES)[number];

/** Values saved before these options were removed. Readable, not offered for new choices. */
export const LEGACY_STATUSES = ["Offline", "Em análise"] as const;

export type LegacyStatus = (typeof LEGACY_STATUSES)[number];

export type StoredStatus = Status | LegacyStatus;

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isStoredStatus(value: string): value is StoredStatus {
  return isStatus(value) || (LEGACY_STATUSES as readonly string[]).includes(value);
}

export const EMAIL_PROVIDERS = ["gmail", "outlook", "hotmail", "other"] as const;

export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<EmailProvider, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  hotmail: "Hotmail",
  other: "Outro",
};

export const SECRET_FIELDS = ["username", "password", "totp", "recovery"] as const;

export type SecretField = (typeof SECRET_FIELDS)[number];

export type AccessService = "meta" | "email";

export const FIELD_LABELS: Record<SecretField, string> = {
  username: "Usuário",
  password: "Senha",
  totp: "2FA",
  recovery: "Códigos de recuperação",
};
