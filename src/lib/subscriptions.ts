export type RawTransactionForDetection = {
  id?: string;
  description: string;
  amountCents: number;
  date: Date;
  categoryName?: string | null;
  isTransfer?: boolean;
  isCardPayment?: boolean;
  installmentGroupId?: string | null;
  accountType?: string;
};

export type DetectedSubscription = {
  lastChargeId?: string;
  lastChargedOn: string;
  name: string;
  normalizedName: string;
  categoryName?: string;
  currentAmountCents: number;
  previousAmountCents?: number;
  monthOccurrences: number;
  cadence: "monthly" | "annual";
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
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Product-specific names: Amazon/Google/Apple alone can be ordinary purchases.
const merchants: [RegExp, string][] = [
  [/\bnetflix\b/, "Netflix"], [/\bspotify\b/, "Spotify"],
  [/\b(?:amazon prime|prime video|amzn prime)\b/, "Amazon Prime"],
  [/\b(?:youtube premium|youtube music)\b/, "YouTube Premium"],
  [/\b(?:disney plus|disneyplus)\b/, "Disney+"], [/disney\s*\+/, "Disney+"],
  [/\b(?:hbo max|hbomax)\b/, "HBO Max"], [/\b(?:globoplay|globo play)\b/, "Globoplay"],
  [/\b(?:chatgpt|openai)\b/, "ChatGPT"], [/\b(?:adobe|canva|notion)\b/, "Software"],
  [/\b(?:icloud|google one|microsoft 365|office 365)\b/, "Cloud"],
  [/\b(?:deezer|apple music|apple tv|paramount plus|paramountplus)\b/, "Streaming"],
];

function subscriptionIdentity(description: string) {
  const norm = normalizeName(description);
  const merchant = merchants.find(([pattern]) => pattern.test(norm) || pattern.test(description.toLowerCase()));
  // Exact merchant group tolerates processor prefixes and changing bank IDs.
  // Keep separate software products instead of grouping all as "Software".
  if (merchant) return { key: merchant[1] === "Software" || merchant[1] === "Cloud" || merchant[1] === "Streaming" ? norm : normalizeName(merchant[1]), known: true };
  return { key: norm, known: false };
}

/**
 * Agrupa transações recorrentes e identifica:
 * 1) Assinaturas/recorrências presentes no extrato que não estão cadastradas como regras.
 * 2) Variações de preço com aumento em relação ao mês anterior.
 */
export function detectSubscriptions(
  transactions: RawTransactionForDetection[],
  registeredRuleDescriptions: string[],
  asOf?: Date,
): DetectedSubscription[] {
  const normalizedRules = new Set(registeredRuleDescriptions.map(d => subscriptionIdentity(d).key));

  // Agrupa transações por nome normalizado
  type TxMonthData = {
    id?: string;
    yearMonth: string; // YYYY-MM
    date: Date;
    amountCents: number;
    rawDescription: string;
    categoryName?: string;
  };

  const groups = new Map<string, TxMonthData[]>();

  for (const tx of transactions) {
    const raw = normalizeName(tx.description);
    if (tx.isTransfer || tx.isCardPayment || tx.installmentGroupId || tx.accountType === "INVESTMENT"
      || tx.amountCents <= 0 || !Number.isFinite(tx.date.getTime())
      || /\b(?:pix|ted|doc|transferencia|resgate|aplicacao|fatura|parcela|compra unica)\b/.test(raw)
      || /\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(tx.description)) continue;
    const { key: norm, known } = subscriptionIdentity(tx.description);
    if (!norm || norm.length < 3) continue;
    // Repeated supermarket/restaurant purchases are not subscriptions, even
    // with identical amounts or an unrelated recurring rule in the app.
    if (!known && !/\b(?:assinatura|subscription|mensalidade|anuidade|academia|plano mensal|plano anual)\b/.test(raw)
      && !/^(assinaturas?|streaming|subscriptions?)$/.test(normalizeName(tx.categoryName ?? ""))) continue;

    const ym = `${tx.date.getUTCFullYear()}-${String(tx.date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(norm)) {
      groups.set(norm, []);
    }
    groups.get(norm)!.push({
      id: tx.id,
      yearMonth: ym,
      date: tx.date,
      amountCents: tx.amountCents,
      rawDescription: tx.description,
      categoryName: tx.categoryName ?? undefined,
    });
  }

  const subscriptions: DetectedSubscription[] = [];

  for (const [norm, items] of groups.entries()) {
    const chronological = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
    if (chronological.length < 2) continue;
    const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
    const intervals = chronological.slice(1).map((item, i) => ({
      months: monthIndex(item.date) - monthIndex(chronological[i].date),
      days: (item.date.getTime() - chronological[i].date.getTime()) / 86_400_000,
    }));
    const monthly = intervals.every(gap => gap.months === 1 && gap.days >= 23 && gap.days <= 38);
    const annual = intervals.every(gap => gap.months === 12 && gap.days >= 350 && gap.days <= 380);
    if (!monthly && !annual) continue;
    if (asOf) {
      const ageDays = (asOf.getTime() - chronological[chronological.length - 1].date.getTime()) / 86_400_000;
      if (ageDays < 0 || ageDays > (annual ? 380 : 45)) continue;
    }
    const known = subscriptionIdentity(chronological[0].rawDescription).known;
    const amounts = chronological.map(r => r.amountCents);
    if (Math.max(...amounts) / Math.min(...amounts) > (known ? 1.3 : 1.2)) continue;
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
      lastChargeId: latestTx.id,
      lastChargedOn: latestTx.date.toISOString().slice(0, 10),
      name: latestTx.rawDescription,
      normalizedName: norm,
      categoryName: latestTx.categoryName,
      currentAmountCents: currentAmount,
      previousAmountCents: previousAmount,
      monthOccurrences: byMonth.size,
      cadence: annual ? "annual" : "monthly",
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
