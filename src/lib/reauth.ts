import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/rate-limit";

export const EXPORT_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutos
const REAUTH_MAX_ATTEMPTS = 5;

function getSecretKey(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "test") {
      return "test-reauth-secret-key-32-chars-long";
    }
    throw new Error("AUTH_SECRET não definida para reautenticação.");
  }
  return secret;
}

function sign(payload: string): string {
  const secret = getSecretKey();
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Cria um token assinado de uso temporário para exportação de dados sigilosos.
 */
export function issueExportToken(userId: string, ttlMs = EXPORT_TOKEN_TTL_MS): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${userId}.${expiresAt}`;
  const signature = sign(payload);
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

/**
 * Valida se um token de exportação é íntegro, pertence ao usuário indicado e ainda está dentro do prazo.
 */
export function verifyExportToken(token: string, expectedUserId: string): boolean {
  if (!token || typeof token !== "string") return false;

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return false;

    const [tokenUserId, expiresAtStr, signature] = parts;
    if (tokenUserId !== expectedUserId) return false;

    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

    const payload = `${tokenUserId}.${expiresAtStr}`;
    const expectedSig = sign(payload);

    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

/**
 * Verifica a senha atual do usuário autenticado para operações de alto privilégio (como download de backup),
 * com rate limiting por usuário para evitar ataques de força bruta.
 */
export async function verifyUserPassword(
  userId: string,
  password: unknown
): Promise<{ ok: boolean; error?: string }> {
  if (typeof password !== "string" || !password.trim()) {
    return { ok: false, error: "Informe sua senha atual." };
  }

  const rateKey = `reauth:${userId}`;
  const limit = isRateLimited(rateKey, REAUTH_MAX_ATTEMPTS);
  if (!limit.allowed) {
    const waitMsg = limit.retryAfterSeconds
      ? ` Tente novamente em ${Math.ceil(limit.retryAfterSeconds / 60)} minuto(s).`
      : " Tente novamente mais tarde.";
    return { ok: false, error: `Muitas tentativas de confirmação.${waitMsg}` };
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.passwordHash) {
    recordFailure(rateKey);
    return { ok: false, error: "Usuário não encontrado." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    recordFailure(rateKey);
    return { ok: false, error: "Senha incorreta." };
  }

  clearFailures(rateKey);
  return { ok: true };
}

/**
 * Reautentica o usuário com sua senha e emite um token efêmero de exportação.
 */
export async function reauthenticateForExport(
  userId: string,
  password: unknown
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const check = await verifyUserPassword(userId, password);
  if (!check.ok) {
    return { ok: false, error: check.error };
  }

  const token = issueExportToken(userId);
  return { ok: true, token };
}
