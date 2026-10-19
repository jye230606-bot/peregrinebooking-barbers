/**
 * Print a scrypt hash for OWNER_PASSWORD_HASH.
 *
 * The password is read from stdin, never from argv: an argument lands in the
 * shell history and in the process list.
 *
 *   printf 'the new password' | npm run hash-password --silent         (bash)
 *   'the new password' | npm run hash-password --silent                 (PowerShell)
 */
import { randomBytes, scryptSync } from "node:crypto";

const N = 16384;
const r = 8;
const p = 1;

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");

if (!password) {
  console.error("Nothing on stdin. Pipe the password in.");
  process.exit(1);
}

const b64 = (b) => b.toString("base64url");
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, { N, r, p });

const out = ["scrypt", N, r, p, b64(salt), b64(hash)].join("$");
console.log(out);
// Next expands $NAME in .env files, so there the dollars need escaping.
console.error(`\nFor .env.local:  OWNER_PASSWORD_HASH=${out.replaceAll("$", "\\$")}`);
