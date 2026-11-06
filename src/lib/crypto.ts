import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Encrypts CRM tokens before they're stored in Supabase, so a database export
 * alone doesn't leak them. The key comes from TOKEN_ENCRYPTION_KEY (any long
 * random string — it's hashed to 256 bits).
 */
function key(): Buffer {
  const secret = (process.env.TOKEN_ENCRYPTION_KEY ?? "").trim();
  if (secret.length < 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY is missing or too short (use 32+ random characters). Add it in Vercel and redeploy.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, ct] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised encrypted token format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Couldn't decrypt the stored CRM token. TOKEN_ENCRYPTION_KEY may have changed — re-enter the token in Settings.");
  }
}

/** Per-client secret for the CRM webhook URL, derived so there's nothing extra to store. */
export function webhookKey(clientId: string): string {
  return createHmac("sha256", key()).update(`webhook:${clientId}`).digest("base64url").slice(0, 32);
}

export function verifyWebhookKey(clientId: string, provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(webhookKey(clientId));
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
