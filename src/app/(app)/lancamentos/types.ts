export type PlainCategory = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  nature: "FIXED" | "VARIABLE";
  color: string;
};

export type PlainAccount = { id: string; name: string };

export type PlainTransaction = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  kind: "INCOME" | "EXPENSE";
  nature: "FIXED" | "VARIABLE";
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountId: string;
  accountName: string;
  /** Compra no cartão — é demonstrativo: fica fora do resumo do painel até a fatura ser paga. */
  isCard: boolean;
  notes: string | null;
  /** Movimento entre contas suas — fica fora dos totais de receita e despesa. */
  isTransfer: boolean;
  /** Preenchido quando o lançamento nasceu de uma regra recorrente. */
  recurringRuleId: string | null;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
};
