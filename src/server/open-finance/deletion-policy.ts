export type PluggyTransactionIdentity = {
  userId: string;
  accountId: string;
  externalId: string | null;
  origin: string;
};

export type DeletablePluggyTransaction = Omit<PluggyTransactionIdentity, "externalId"> & { externalId: string };

export function canDeletePluggyTransaction(row: PluggyTransactionIdentity | null | undefined, userId: string): row is DeletablePluggyTransaction {
  return Boolean(row && row.userId === userId && row.origin === "PLUGGY" && row.externalId);
}

export function isExternalIdentityTombstoned(externalId: string, tombstones: ReadonlySet<string>): boolean {
  return tombstones.has(externalId);
}

export type ConnectionDataDeletionPlan = {
  transactionIds: string[];
  invoiceIds: string[];
  tombstoneExternalIds: string[];
};

export function planConnectionDataDeletion(input: {
  userId: string;
  accountIds: readonly string[];
  transactions: Array<{ id: string; userId: string; accountId: string; origin: string }>;
  invoices: Array<{ id: string; userId: string; accountId: string }>;
  tombstones: Array<{ userId: string; accountId: string; externalId: string }>;
}): ConnectionDataDeletionPlan {
  const accountIds = new Set(input.accountIds);
  return {
    transactionIds: input.transactions.filter((row) => row.userId === input.userId && accountIds.has(row.accountId) && row.origin === "PLUGGY").map((row) => row.id),
    invoiceIds: input.invoices.filter((row) => row.userId === input.userId && accountIds.has(row.accountId)).map((row) => row.id),
    tombstoneExternalIds: input.tombstones.filter((row) => row.userId === input.userId && accountIds.has(row.accountId)).map((row) => row.externalId),
  };
}
