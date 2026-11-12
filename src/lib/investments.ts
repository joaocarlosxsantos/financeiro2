type Position = {
  investedCents: number;
  netWorthCents: number;
  totalIncomplete: boolean;
  accounts: Array<{ type: string; financeMode: string; bankBalanceCents: number | null }>;
};

export function investmentPosition(balance: Position) {
  const accounts = balance.accounts.filter((account) => account.type === "INVESTMENT");
  const incomplete = accounts.some((account) => account.financeMode === "integracao" && account.bankBalanceCents === null);
  const sharePct = !balance.totalIncomplete && balance.netWorthCents > 0 && balance.investedCents >= 0 && balance.investedCents <= balance.netWorthCents
    ? Math.round(balance.investedCents / balance.netWorthCents * 1000) / 10 : null;
  return { hasInvestments: accounts.length > 0, incomplete, sharePct };
}

export function projectionOpeningCents(balance: Position, savedCents: number) {
  const position = investmentPosition(balance);
  return position.hasInvestments && !position.incomplete ? Math.max(0, balance.investedCents) : savedCents;
}

export function investmentMovementLabel(row: { accountType?: string; origin?: string; isTransfer: boolean; kind: string; description: string }) {
  if (row.accountType !== "INVESTMENT" || row.origin !== "PLUGGY") return null;
  if (row.isTransfer && row.kind === "INCOME" && row.description.startsWith("Aplicação ·")) return "Aplicação";
  if (row.isTransfer && row.kind === "EXPENSE" && row.description.startsWith("Resgate ·")) return "Resgate";
  return row.kind === "EXPENSE" && row.description.startsWith("Imposto ·") ? "Imposto" : null;
}
