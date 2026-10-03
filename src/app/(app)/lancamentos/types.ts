export type PlainCategory = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  nature: "FIXED" | "VARIABLE";
  color: string;
};

export type PlainAccount = { id: string; name: string };

export type PlainSplit = {
  id: string;
  name: string;
  phone: string | null;
  amountCents: number;
};

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
  /** Grupo de transferência pareada (transfer_group_id). */
  transferGroupId?: string | null;
  /** Rota formatada da transferência (ex.: Conta A → Conta B). */
  transferRoute?: string | null;
  fromAccountName?: string | null;
  toAccountName?: string | null;
  /** Preenchido quando o lançamento nasceu de uma regra recorrente. */
  recurringRuleId: string | null;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  /** Divisão desta despesa com outras pessoas. */
  splits?: PlainSplit[];
  /** Minha parte calculada (total - soma das partes dos outros). */
  myShareCents?: number;
};
