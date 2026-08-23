/** Normaliza texto para comparação: sem acento, minúsculo, sem ruído. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type CategoryHint = { id: string; name: string; keywords: string[]; kind: string };

/**
 * Escolhe a categoria mais provável para uma descrição de extrato.
 * Estratégia simples e previsível: vence a palavra-chave mais longa que
 * aparece na descrição. Sem match, devolve null e a linha fica "sem categoria".
 */
export function suggestCategoryId(
  description: string,
  categories: CategoryHint[],
  kind: "INCOME" | "EXPENSE",
): string | null {
  const desc = normalize(description);
  if (!desc) return null;

  let bestId: string | null = null;
  let bestLen = 0;

  for (const cat of categories) {
    if (cat.kind !== kind) continue;
    for (const kw of cat.keywords) {
      const n = normalize(kw);
      if (!n || n.length <= bestLen) continue;
      if (desc.includes(n)) {
        bestId = cat.id;
        bestLen = n.length;
      }
    }
  }
  return bestId;
}

/** Impressão digital para não importar a mesma transação duas vezes. */
export function fingerprint(parts: {
  accountId: string;
  date: Date;
  amountCents: number;
  description: string;
}): string {
  const day = parts.date.toISOString().slice(0, 10);
  return [parts.accountId, day, parts.amountCents, normalize(parts.description).slice(0, 40)].join("|");
}
