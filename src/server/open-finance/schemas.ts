import { z } from "zod";
import { MAX_CENTS } from "@/lib/money";

export const pluggyTransactionSchema = z.object({
  id: z.string().min(1).max(200), accountId: z.string().min(1).max(200),
  description: z.string().min(1).max(500), date: z.string().datetime({ offset: true }),
  amount: z.number().finite(), currencyCode: z.string().length(3),
  type: z.enum(["DEBIT", "CREDIT"]), status: z.enum(["POSTED", "PENDING"]),
  operationType: z.string().nullable().optional(), billId: z.string().nullable().optional(), billPostDate: z.string().nullable().optional(), billForecastDate: z.string().nullable().optional(),
  creditCardMetadata: z.object({ payeeMCC: z.number().int().nullable().optional() }).passthrough().nullable().optional(),
});
export const pluggyAccountSchema = z.object({
  id: z.string().min(1).max(200), itemId: z.string().min(1).max(200),
  type: z.enum(["BANK", "CREDIT"]), subtype: z.string().nullable().optional(),
  name: z.string().max(200).optional(), currencyCode: z.string().length(3),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  balance: z.number().finite().nullable().optional(),
  creditData: z.object({ creditLimit: z.number().finite().nullable().optional(), availableCreditLimit: z.number().finite().nullable().optional() }).nullable().optional(),
});

const localIdSchema = z.string().regex(/^[a-z0-9]{26}$/);
export const linkOpenFinanceAccountSchema = z.object({
  accountId: localIdSchema,
  connectionId: localIdSchema,
  externalAccountId: z.string().trim().min(1).max(200).nullable(),
  mode: z.enum(["manual", "integracao"]),
}).strict().superRefine((value, ctx) => {
  if (value.mode === "integracao" && value.externalAccountId === null) {
    ctx.addIssue({ code: "custom", path: ["externalAccountId"], message: "Escolha uma conta externa." });
  }
  if (value.mode === "manual" && value.externalAccountId !== null) {
    ctx.addIssue({ code: "custom", path: ["externalAccountId"], message: "Conta externa inesperada para modo manual." });
  }
});

const localEntityIdSchema = z.string().regex(/^[a-z0-9]{26}$/);
export const deletePluggyTransactionSchema = z.object({ transactionId: localEntityIdSchema, confirmation: z.literal("EXCLUIR LANCAMENTO PLUGGY") }).strict();
export const openFinanceConnectionIdSchema = z.object({ connectionId: localEntityIdSchema }).strict();
export const saveOpenFinanceSetupSchema = z.object({
  clientId: z.string().refine((value) => value.length === 0 || (value.length >= 4 && value.length <= 300)),
  clientSecret: z.string().refine((value) => value.length === 0 || (value.length >= 8 && value.length <= 1000)),
  itemId: z.string().min(4).max(300),
  label: z.string().optional(),
  importFromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
export const deleteAllOpenFinanceSchema = z.object({ connectionId: localEntityIdSchema, confirmation: z.literal("EXCLUIR DADOS PLUGGY") }).strict();
export const removeOpenFinanceCredentialsSchema = z.object({ confirmation: z.literal("REMOVER CREDENCIAIS") }).strict();
export const removeOpenFinanceConnectionSchema = z.object({
  connectionId: localEntityIdSchema,
  confirmation: z.literal("REMOVER CONEXAO"),
  deleteImported: z.boolean(),
}).strict();

export function amountToCents(amount: number | null | undefined): number | null {
  if (amount == null) return null;
  if (!Number.isFinite(amount)) throw new Error("Valor monetário inválido.");
  const cents = Math.round((amount + Math.sign(amount) * Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_CENTS) throw new Error("Valor fora do limite suportado.");
  return cents;
}

export function transactionKind(accountType: "BANK" | "CREDIT", type: "DEBIT" | "CREDIT"): "INCOME" | "EXPENSE" {
  if (accountType === "CREDIT") return type === "DEBIT" ? "EXPENSE" : "INCOME";
  return type === "DEBIT" ? "EXPENSE" : "INCOME";
}

export function isCompatiblePluggyAccount(localType: string, remoteType: "BANK" | "CREDIT"): boolean {
  return (localType === "CREDIT_CARD") === (remoteType === "CREDIT");
}

export function isCardPayment(accountType: "BANK" | "CREDIT", transaction: { type: "DEBIT" | "CREDIT"; operationType?: string | null }): boolean {
  return accountType === "CREDIT" && transaction.type === "CREDIT" && transaction.operationType === "PAGAMENTO_FATURA";
}

export function shouldImportPluggyTransaction(accountType: "BANK" | "CREDIT", transaction: { type: "DEBIT" | "CREDIT"; operationType?: string | null }): boolean {
  return !isCardPayment(accountType, transaction);
}

export function hasPossibleCardPaymentMatch(
  bankDebit: { date: string; amountCents: number; origin: string; isCardPayment: boolean },
  invoices: Array<{ invoiceRef: string; totalAmountCents: number }>,
): boolean {
  if (bankDebit.origin === "MANUAL" || bankDebit.isCardPayment) return false;
  const month = bankDebit.date.slice(0, 7);
  return invoices.some((invoice) => invoice.invoiceRef === month && invoice.totalAmountCents === bankDebit.amountCents);
}

export function isSettled(status: "POSTED" | "PENDING"): boolean {
  return status === "POSTED";
}

export function periodExpenseCents(transactions: Array<{ month: string; kind: "INCOME" | "EXPENSE"; amountCents: number; isCard: boolean; isCardPayment: boolean }>, month: string, mode: "cash" | "accrual"): number {
  return transactions.filter((tx) => tx.month === month && (mode === "cash" ? !tx.isCard : !tx.isCardPayment)).reduce((sum, tx) => sum + (tx.kind === "EXPENSE" ? tx.amountCents : -tx.amountCents), 0);
}
