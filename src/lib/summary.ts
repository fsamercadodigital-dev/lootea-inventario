import { isStatus, type Status, type StoredStatus } from "./constants";
import type { BmPublic, ProfilePublic } from "./types";

export type StatusCounts = { total: number } & Record<Status, number>;

function counts(items: { status: StoredStatus }[]): StatusCounts {
  const base = { total: items.length, Ativo: 0, Restrito: 0 };
  for (const item of items) {
    if (isStatus(item.status)) base[item.status] += 1;
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
