import { z } from "zod";

/**
 * Remove caracteres de controle ASCII perigosos (bytes nulos, escapes, caracteres invisíveis de terminal),
 * evitando problemas de quebra de banco, injeção de caracteres de formatação e ataques de DoS.
 *
 * Se allowNewlines for false (padrão para nomes, títulos e descrições), normaliza quebras
 * de linha e múltiplos espaços para um espaço único.
 */
export function sanitizeFreeText(input: unknown, allowNewlines = false): string {
  if (typeof input !== "string") return "";
  const cleaned = allowNewlines
    ? input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    : input.replace(/[\x00-\x1F\x7F]/g, " ");

  if (!allowNewlines) {
    return cleaned.replace(/\s+/g, " ").trim();
  }
  return cleaned.trim();
}

/**
 * Schema Zod para nomes de entidades (contas, categorias, agrupamentos, dívidas, metas, participantes).
 * Garante remoção de caracteres de controle, trim e limite estrito de comprimento.
 */
export function safeNameSchema(min = 1, max = 100, message?: string) {
  return z.preprocess(
    (val) => sanitizeFreeText(val, false),
    z
      .string()
      .min(min, message ?? `O nome deve ter pelo menos ${min} caractere(s).`)
      .max(max, `O nome não pode ultrapassar ${max} caracteres.`)
  );
}

/**
 * Schema Zod para descrições de transações, regras recorrentes e lançamentos.
 */
export function safeDescriptionSchema(min = 2, max = 255, message?: string) {
  return z.preprocess(
    (val) => sanitizeFreeText(val, false),
    z
      .string()
      .min(min, message ?? `A descrição deve ter pelo menos ${min} caracteres.`)
      .max(max, `A descrição não pode ultrapassar ${max} caracteres.`)
  );
}

/**
 * Schema Zod para campos opcionais de texto curto (ex: instituição, credor, telefone, palavras-chave).
 */
export function safeOptionalTextSchema(max = 100) {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    const sanitized = sanitizeFreeText(val, false);
    return sanitized === "" ? undefined : sanitized;
  }, z.string().max(max, `O campo não pode ultrapassar ${max} caracteres.`).optional());
}

/**
 * Schema Zod para notas e observações longas opcionais (permite quebras de linha).
 */
export function safeNotesSchema(max = 2000) {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    const sanitized = sanitizeFreeText(val, true);
    return sanitized === "" ? undefined : sanitized;
  }, z.string().max(max, `As observações não podem ultrapassar ${max} caracteres.`).optional());
}
