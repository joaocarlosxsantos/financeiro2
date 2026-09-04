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
 * Patrimônio líquido simples: o que você tem menos o que você deve.
 * Não entra bem material (carro, imóvel) — só o que o sistema conhece.
 * Cartão de crédito não entra aqui: é só demonstrativo, sem saldo devedor
 * próprio — o que saiu de verdade já está refletido nas contas do extrato.
 */
export function netWorth(input: {
  availableCents: number;
  savedInGoalsCents: number;
  debtBalanceCents: number;
}): number {
  return input.availableCents + input.savedInGoalsCents - input.debtBalanceCents;
}
