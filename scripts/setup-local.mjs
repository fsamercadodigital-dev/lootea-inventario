import { randomBytes, randomInt } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "data");
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);

const keyPath = path.join(dir, "data-key");
const passPath = path.join(dir, "passphrase.txt");
const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";

if (!existsSync(keyPath)) {
  writeFileSync(keyPath, `${randomBytes(32).toString("base64")}\n`, { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  console.log("Chave do cofre criada em data/data-key");
} else {
  console.log("Chave do cofre já existe em data/data-key");
}

if (!existsSync(passPath)) {
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  const passphrase = Array.from({ length: 5 }, group).join("-");
  writeFileSync(passPath, `${passphrase}\n`, { mode: 0o600 });
  chmodSync(passPath, 0o600);
  console.log("Frase de acesso criada em data/passphrase.txt");
} else {
  console.log("Frase de acesso já existe em data/passphrase.txt");
}

console.log("Arquivos locais, fora do git. Não envie o conteúdo.");
