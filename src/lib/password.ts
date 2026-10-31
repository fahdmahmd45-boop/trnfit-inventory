import { scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";

const N = 16384, r = 8, p = 1, KEYLEN = 32;

function scryptAsync(code: string, salt: Buffer): Promise<Buffer> {
  return new Promise((res, rej) =>
    scrypt(code, salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))),
  );
}

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashSecret(code: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(code, salt);
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifySecret(code: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  const key = await new Promise<Buffer>((res, rej) =>
    scrypt(code, salt, expected.length, { N: +parts[1], r: +parts[2], p: +parts[3], maxmem: 64 * 1024 * 1024 },
      (e, k) => (e ? rej(e) : res(k))),
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

export function randomToken() {
  return randomBytes(32).toString("base64url");
}
