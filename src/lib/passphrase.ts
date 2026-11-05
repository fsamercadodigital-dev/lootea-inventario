import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";

export function configuredPassphrase(): string | null {
  if (process.env.INVENTORY_PASSPHRASE !== undefined) {
    return process.env.INVENTORY_PASSPHRASE || null;
  }
  const file =
    process.env.INVENTORY_PASSPHRASE_FILE || path.join(process.cwd(), "data", "passphrase.txt");
  if (!existsSync(file)) return null;
  const value = readFileSync(file, "utf8").trim();
  return value || null;
}

export function hashPassphrase(passphrase: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(passphrase, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassphrase(passphrase: string, stored: string): boolean {
  const [kind, saltPart, hashPart] = stored.split("$");
  if (kind !== "scrypt" || !saltPart || !hashPart) return false;
  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(hashPart, "base64url");
  const actual = scryptSync(passphrase, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
