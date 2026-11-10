export type RawTransactionForDetection = {
  description: string;
  amountCents: number;
  date: Date;
  categoryName?: string | null;
};

export type DetectedSubscription = {
  name: string;
  normalizedName: string;
  categoryName?: string;
  currentAmountCents: number;
  previousAmountCents?: number;
  monthOccurrences: number;
  isRegistered: boolean;
  hasPriceIncrease: boolean;
  priceIncreaseCents?: number;
  priceIncreasePct?: number;
};

function normalizeName(desc: string): string {
  return desc
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\d+\/\d+\s*/g, " ") // remove parcela tipo "1/12"
    .replace(/[^\w\s]/g, "")
    .trim();
}

/**
 * Agrupa transações recorrentes e identifica:
 * 1) Assinaturas/recorrências presentes no extrato que não estão cadastradas como regras.
 * 2) Variações de preço com aumento em relação ao mês anterior.
 */
export function detectSubscriptions(
  transactions: RawTransactionForDetection[],
  registeredRuleDescriptions: string[],
): DetectedSubscription[] {
  const normalizedRules = new Set(registeredRuleDescriptions.map(normalizeName));

  // Agrupa transações por nome normalizado
  type TxMonthData = {
    yearMonth: string; // YYYY-MM
    date: Date;
    amountCents: number;
    rawDescription: string;
    categoryName?: string;
  };

  const groups = new Map<string, TxMonthData[]>();

  for (const tx of transactions) {
    const norm = normalizeName(tx.description);
    if (!norm || norm.length < 3) continue;

    const ym = `${tx.date.getUTCFullYear()}-${String(tx.date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(norm)) {
      groups.set(norm, []);
    }
    groups.get(norm)!.push({
      yearMonth: ym,
      date: tx.date,
      amountCents: tx.amountCents,
      rawDescription: tx.description,
      categoryName: tx.categoryName ?? undefined,
    });
  }

  const subscriptions: DetectedSubscription[] = [];

  for (const [norm, items] of groups.entries()) {
    // Agrupa por mês e pega o valor mais recente de cada mês
    const byMonth = new Map<string, TxMonthData>();
    for (const item of items) {
      const existing = byMonth.get(item.yearMonth);
      if (!existing || item.date.getTime() > existing.date.getTime()) {
        byMonth.set(item.yearMonth, item);
      }
    }

    // Só é recorrente/assinatura se aparece em pelo menos 2 meses distintos
    if (byMonth.size < 2) continue;

    // Ordena os meses cronologicamente
    const sortedMonths = Array.from(byMonth.keys()).sort();
    const latestMonth = sortedMonths[sortedMonths.length - 1];
    const previousMonth = sortedMonths[sortedMonths.length - 2];

    const latestTx = byMonth.get(latestMonth)!;
    const previousTx = byMonth.get(previousMonth)!;

    const currentAmount = latestTx.amountCents;
    const previousAmount = previousTx.amountCents;

    let hasPriceIncrease = false;
    let priceIncreaseCents: number | undefined;
    let priceIncreasePct: number | undefined;

    if (currentAmount > previousAmount && previousAmount > 0) {
      hasPriceIncrease = true;
      priceIncreaseCents = currentAmount - previousAmount;
      priceIncreasePct = Math.round((priceIncreaseCents / previousAmount) * 100);
    }

    const isRegistered = normalizedRules.has(norm);

    subscriptions.push({
      name: latestTx.rawDescription,
      normalizedName: norm,
      categoryName: latestTx.categoryName,
      currentAmountCents: currentAmount,
      previousAmountCents: previousAmount,
      monthOccurrences: byMonth.size,
      isRegistered,
      hasPriceIncrease,
      priceIncreaseCents,
      priceIncreasePct,
    });
  }

  // Ordena primeiro as que tiveram aumento de preço, depois as não cadastradas, depois por valor decrescente
  return subscriptions.sort((a, b) => {
    if (a.hasPriceIncrease !== b.hasPriceIncrease) return a.hasPriceIncrease ? -1 : 1;
    if (a.isRegistered !== b.isRegistered) return a.isRegistered ? 1 : -1;
    return b.currentAmountCents - a.currentAmountCents;
  });
}
