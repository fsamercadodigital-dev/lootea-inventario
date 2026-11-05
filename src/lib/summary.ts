import type { Status } from "./constants";
import { STATUSES } from "./constants";
import type { BmPublic, ProfilePublic } from "./types";

export type StatusCounts = { total: number } & Record<Status, number>;

function counts(items: { status: Status }[]): StatusCounts {
  const base = { total: items.length, Ativo: 0, Offline: 0, Restrito: 0, "Em análise": 0 };
  for (const item of items) {
    if ((STATUSES as readonly string[]).includes(item.status)) base[item.status] += 1;
  }
  return base;
}

export function summarize(profiles: ProfilePublic[], bms: BmPublic[]) {
  return {
    profiles: {
      ...counts(profiles),
      incomplete: profiles.filter((profile) => !profile.displayName?.trim()).length,
    },
    bms: counts(bms),
  };
}
