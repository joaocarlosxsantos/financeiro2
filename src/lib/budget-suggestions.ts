import type { MonthRef } from "./dates";

export type CategorySuggestion = {
  suggestedCents: number;
  monthsCount: number;
  label: string;
};

export type TransactionForSuggestion = {
  id?: string;
  categoryId: string | null;
  amountCents: number;
  kind: "INCOME" | "EXPENSE";
  isTransfer?: boolean;
  isCardPayment?: boolean;
  /** Data da transação (para cartão, já com a data corrigida pela fatura de competência). */
  date: Date | string;
};

/**
 * Converte os gastos dos últimos 3 meses (do mais recente [0] ao mais antigo [2])
 * para a janela relevante de histórico da categoria:
 * - Se m3 > 0: considera os 3 meses [m1, m2, m3].
 * - Se m3 == 0 e m2 > 0: considera 2 meses [m1, m2].
 * - Se m3 == 0 e m2 == 0 e m1 > 0: considera 1 mês [m1].
 * - Se todos 0: [0, 0, 0].
 */
export function getCategoryHistoryWindow(
  recentToOldest: readonly [number, number, number],
): number[] {
  const [m1, m2, m3] = recentToOldest;
  if (m3 > 0) return [m1, m2, m3];
  if (m2 > 0) return [m1, m2];
  if (m1 > 0) return [m1];
  return [0, 0, 0];
}

/**
 * Calcula a sugestão de orçamento por categoria a partir de valores mensais fechados.
 * - 3 meses: usa a mediana para eliminar outliers simples e picos atípicos.
 * - 2 meses: usa a média dos 2 meses.
 * - 1 mês: usa o valor do único mês fechado.
 * - 0 meses ou todos zero: retorna 0 centavos ("sem histórico").
 * - Arredonda para dezenas de reais (múltiplo de R$ 10,00 = 1000 centavos, mínimo de R$ 10 se > 0).
 */
export function calculateCategorySuggestion(
  monthlyValues: readonly number[],
): CategorySuggestion {
  const values = monthlyValues.filter((v) => Number.isFinite(v) && v >= 0);
  if (!values.length || values.every((v) => v === 0)) {
    return {
      suggestedCents: 0,
      monthsCount: values.length,
      label: "sem histórico",
    };
  }

  let baseCents = 0;
  if (values.length === 3) {
    // Mediana dos 3 meses: elimina outliers (ex: 300, 350, 1500 -> 350)
    const sorted = [...values].sort((a, b) => a - b);
    baseCents = sorted[1]!;
  } else if (values.length === 2) {
    baseCents = Math.round((values[0]! + values[1]!) / 2);
  } else {
    baseCents = values[0]!;
  }

  // Arredondamento para dezenas de reais (mínimo de R$ 10,00 se > 0)
  const rounded = baseCents > 0 ? Math.max(1000, Math.round(baseCents / 1000) * 1000) : 0;
  const label = `média ${values.length}m`;

  return {
    suggestedCents: rounded,
    monthsCount: values.length,
    label,
  };
}

/**
 * Agrupa transações brutas de meses fechados por categoria,
 * excluindo transferências, pagamentos de fatura de cartão e receitas.
 */
export function aggregateMonthlyExpensesByCategory(
  transactions: readonly TransactionForSuggestion[],
  months: readonly MonthRef[],
): Map<string, number[]> {
  const result = new Map<string, number[]>();

  // Cria índice rápido dos meses fechados solicitados (ano-mês -> índice)
  const monthIndexMap = new Map<string, number>();
  months.forEach((m, idx) => {
    monthIndexMap.set(`${m.year}-${String(m.month).padStart(2, "0")}`, idx);
  });

  for (const tx of transactions) {
    // Apenas despesas com categoria válida, não transferências e não pagamentos de fatura
    if (tx.kind !== "EXPENSE" || !tx.categoryId || tx.isTransfer || tx.isCardPayment) {
      continue;
    }

    const d = typeof tx.date === "string" ? new Date(tx.date) : tx.date;
    if (isNaN(d.getTime())) continue;

    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthIdx = monthIndexMap.get(key);
    if (monthIdx === undefined) continue;

    let history = result.get(tx.categoryId);
    if (!history) {
      history = new Array(months.length).fill(0);
      result.set(tx.categoryId, history);
    }
    history[monthIdx] = (history[monthIdx] ?? 0) + tx.amountCents;
  }

  return result;
}

/**
 * Constrói as sugestões para uma lista de categorias a partir de gastos mensais por categoria.
 */
export function buildCategorySuggestions(
  categoryIds: readonly string[],
  monthlyTotalsByCategory: ReadonlyMap<string, readonly number[]>,
): Map<string, CategorySuggestion> {
  const map = new Map<string, CategorySuggestion>();
  for (const catId of categoryIds) {
    const history = monthlyTotalsByCategory.get(catId) ?? [];
    map.set(catId, calculateCategorySuggestion(history));
  }
  return map;
}
