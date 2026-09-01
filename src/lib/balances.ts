/**
 * Saldo de conta — funções puras.
 *
 * O sistema só conhece os lançamentos que você registrou. Para saber quanto há
 * numa conta, ele precisa de um ponto de partida: o **saldo inicial** e a data
 * em que ele valia. Daí para frente é aritmética.
 */

export type BalanceParts = {
  openingCents: number;
  incomeCents: number;
  expenseCents: number;
};

/**
 * Conta corrente, poupança, dinheiro, investimento.
 * Transferências entram na soma de propósito: elas movem dinheiro de verdade
 * entre as suas contas, mesmo não sendo receita nem despesa.
 */
export function accountBalance({ openingCents, incomeCents, expenseCents }: BalanceParts): number {
  return openingCents + incomeCents - expenseCents;
}

/**
 * Cartão de crédito: o "saldo" é o quanto você DEVE.
 * Compras aumentam a dívida; estornos e pagamentos de fatura registrados a diminuem.
 */
export function cardOwed(input: {
  purchasesCents: number;
  creditsCents: number;
  invoicePaymentsCents: number;
}): number {
  return Math.max(0, input.purchasesCents - input.creditsCents - input.invoicePaymentsCents);
}

/**
 * Patrimônio líquido simples: o que você tem menos o que você deve.
 * Não entra bem material (carro, imóvel) — só o que o sistema conhece.
 */
export function netWorth(input: {
  availableCents: number;
  savedInGoalsCents: number;
  cardOwedCents: number;
  debtBalanceCents: number;
}): number {
  return (
    input.availableCents + input.savedInGoalsCents - input.cardOwedCents - input.debtBalanceCents
  );
}
