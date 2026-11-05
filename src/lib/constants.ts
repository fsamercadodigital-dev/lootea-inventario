export const STATUSES = ["Ativo", "Offline", "Restrito", "Em análise"] as const;

export type Status = (typeof STATUSES)[number];

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
