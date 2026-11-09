import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const KEY_LENGTH = 32;
function keyBytes(): Buffer {
  const encoded = process.env.APP_ENCRYPTION_KEY;
  if (!encoded) throw new Error("APP_ENCRYPTION_KEY ausente.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_LENGTH || key.toString("base64") !== encoded) throw new Error("APP_ENCRYPTION_KEY inválida.");
  return key;
}

export function encryptSecret(value: string, userId: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  cipher.setAAD(Buffer.from(`${userId}:${purpose}`));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(envelope: string, userId: string, purpose: string): string {
  const [version, ivPart, tagPart, encryptedPart, extra] = envelope.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !encryptedPart || extra) throw new Error("Envelope inválido.");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(ivPart, "base64url"));
  decipher.setAAD(Buffer.from(`${userId}:${purpose}`));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}

export function secretFingerprint(value: string): string {
  return createHmac("sha256", keyBytes()).update(`item:${value}`).digest("hex");
}
