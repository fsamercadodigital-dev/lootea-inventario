import type { AccessService, EmailProvider, SecretField, Status, StoredStatus } from "./constants";

export type SecretPresence = Record<SecretField, boolean>;

export type ProfilePublic = {
  id: string;
  recordNumber: number;
  displayName: string | null;
  metaProfileId: string | null;
  profileUrl: string | null;
  status: StoredStatus;
  responsible: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  bmIds: string[];
  hasAccess: boolean;
};

export type BmPublic = {
  id: string;
  name: string;
  metaBmId: string;
  status: StoredStatus;
  responsible: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  profileIds: string[];
};

export type EmailAccessState = SecretPresence & {
  provider: EmailProvider | null;
  otherLabel: string | null;
};

export type ProfileDetail = ProfilePublic & {
  vault: VaultState;
  meta: SecretPresence;
  email: EmailAccessState;
};

export type VaultState = "ready" | "missing" | "invalid";

export type Inventory = {
  profiles: ProfilePublic[];
  bms: BmPublic[];
  vault: VaultState;
};

export type SecretDraft = Partial<Record<SecretField, string>>;

export type EmailDraft = SecretDraft & {
  provider: EmailProvider;
  otherLabel: string | null;
};

export type ProfileInput = {
  displayName: string | null;
  metaProfileId: string | null;
  profileUrl: string | null;
  status: Status;
  responsible: string | null;
  notes: string | null;
  bmIds: string[];
};

export type CreateProfileInput = ProfileInput & {
  meta?: SecretDraft;
  email?: EmailDraft;
};

export type BmInput = {
  name: string;
  metaBmId: string;
  status: Status;
  responsible: string | null;
  notes: string | null;
  profileIds: string[];
};

export type ProfileUpdate = Omit<ProfileInput, "status"> & { status: StoredStatus };

export type BmUpdate = Omit<BmInput, "status"> & { status: StoredStatus };

export type SecretPatch = {
  service: AccessService;
  provider?: EmailProvider;
  otherLabel?: string | null;
} & Partial<Record<SecretField, string | null>>;
