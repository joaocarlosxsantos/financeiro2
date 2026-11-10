"use server";

import { requireUserId } from "@/lib/auth";
import { reauthenticateForExport, verifyUserPassword } from "@/lib/reauth";

export type ReauthState = { ok?: boolean; error?: string; token?: string };

/**
 * Confirma a senha do usuário autenticado e gera um token efêmero de autorização
 * para o download seguro de backup de dados.
 */
export async function confirmPasswordForExportAction(
  _prev: ReauthState,
  formData: FormData
): Promise<ReauthState> {
  const userId = await requireUserId();
  const password = formData.get("password");
  return reauthenticateForExport(userId, password);
}

/**
 * Validação programática de senha para obtenção de token de exportação.
 */
export async function requestExportToken(password: string): Promise<ReauthState> {
  const userId = await requireUserId();
  return reauthenticateForExport(userId, password);
}

/**
 * Verifica a senha atual do usuário sem emitir token (para confirmações sensíveis).
 */
export async function verifyPasswordAction(password: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await requireUserId();
  return verifyUserPassword(userId, password);
}
