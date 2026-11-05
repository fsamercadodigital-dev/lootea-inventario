export function profileLabel(profile: { displayName: string | null; recordNumber: number }): string {
  const name = profile.displayName?.trim();
  return name || `Perfil ${profile.recordNumber}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
