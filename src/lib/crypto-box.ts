import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";

export class VaultError extends Error {
  code: "missing" | "invalid" | "decrypt";

  constructor(code: "missing" | "invalid" | "decrypt") {
    super(code);
    this.name = "VaultError";
    this.code = code;
  }
}

export function loadDataKey(): Buffer {
  if (process.env.INVENTORY_DATA_KEY !== undefined) {
    const buf = Buffer.from(process.env.INVENTORY_DATA_KEY, "base64");
    if (buf.length !== 32) throw new VaultError("invalid");
    return buf;
  }
  const file = process.env.INVENTORY_DATA_KEY_FILE || path.join(process.cwd(), "data", "data-key");
  if (!existsSync(file)) throw new VaultError("missing");
  const buf = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
  if (buf.length !== 32) throw new VaultError("invalid");
  return buf;
}

export function vaultStatus(): "ready" | "missing" | "invalid" {
  try {
    loadDataKey();
    return "ready";
  } catch (error) {
    if (error instanceof VaultError && error.code === "missing") return "missing";
    return "invalid";
  }
}

export function fieldAad(profileId: string, service: string, field: string): string {
  return `profile:${profileId}|${service}|${field}`;
}

export function encryptField(plaintext: string, aad: string): string {
  const key = loadDataKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(
    ".",
  );
}

export function decryptField(payload: string, aad: string): string {
  const key = loadDataKey();
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !dataPart || payload.split(".").length !== 4) {
    throw new VaultError("decrypt");
  }
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new VaultError("decrypt");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    throw new VaultError("decrypt");
  }
}
