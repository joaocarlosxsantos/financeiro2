import { Receipt } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import {
  getAccounts,
  getCategories,
  getMonthSummary,
  getRecurringStatus,
  getTransactions,
} from "@/server/queries";
import { monthRefFromParam, monthLabel } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { MonthSwitcher } from "@/components/month-switcher";
import { RecurringBanner } from "@/components/recurring-banner";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Hint } from "@/components/ui/hint";
import { TransactionComposer } from "./transaction-composer";
import { TransactionList } from "./transaction-list";
import { Filters } from "./filters";

export const metadata = { title: "Lançamentos — Financeiro 2.0" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    m?: string;
    cat?: string;
    kind?: string;
    nature?: string;
    q?: string;
    acc?: string;
  }>;
}) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const ref = monthRefFromParam(sp.m);

  const [accounts, categories, transactions, summary, recurring] = await Promise.all([
    getAccounts(userId),
    getCategories(userId),
    getTransactions(userId, {
      ref,
      categoryId: sp.cat || undefined,
      accountKind: sp.acc === "CARD" || sp.acc === "OTHER" ? sp.acc : undefined,
      kind: sp.kind === "INCOME" || sp.kind === "EXPENSE" ? sp.kind : undefined,
      nature: sp.nature === "FIXED" || sp.nature === "VARIABLE" ? sp.nature : undefined,
      search: sp.q || undefined,
    }),
    getMonthSummary(userId, ref),
    getRecurringStatus(userId, ref),
  ]);

  const plain = transactions.map((t) => ({
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    description: t.description,
    amountCents: t.amountCents,
    kind: t.kind as "INCOME" | "EXPENSE",
    nature: t.nature as "FIXED" | "VARIABLE",
    categoryId: t.categoryId,
    categoryName: t.categoryName,
    categoryColor: t.categoryColor,
    accountId: t.accountId,
    accountName: t.accountName,
    isCard: t.accountType === "CREDIT_CARD",
    notes: t.notes,
    isTransfer: t.isTransfer,
    recurringRuleId: t.recurringRuleId,
    installmentGroupId: t.installmentGroupId,
    installmentNumber: t.installmentNumber,
    installmentTotal: t.installmentTotal,
  }));

  const plainCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as "INCOME" | "EXPENSE",
    nature: c.nature as "FIXED" | "VARIABLE",
    color: c.color,
  }));

  const plainAccounts = accounts.map((a) => ({ id: a.id, name: a.name }));
  const uncategorized = plain.filter((t) => !t.categoryId).length;

  return (
    <>
      <PageHeader
        title="Lançamentos"
        description="Tudo que entrou e saiu. Classificar cada gasto como fixo ou variável é o que faz o painel virar decisão."
        action={<MonthSwitcher value={ref} />}
      />

      <RecurringBanner
        monthRef={ref}
        monthName={monthLabel(ref)}
        count={recurring.pending.length}
        incomeCents={recurring.pendingIncomeCents}
        expenseCents={recurring.pendingExpenseCents}
      />

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Filters categories={plainCategories} />

          {uncategorized > 0 ? (
            <Hint tone="info">
              {uncategorized} lançamento(s) sem categoria neste mês. Escolha a categoria direto na
              lista — o valor entra na análise no mesmo instante.
            </Hint>
          ) : null}

          <Card className="p-0">
            {plain.length ? (
              <TransactionList
                transactions={plain}
                categories={plainCategories}
                accounts={plainAccounts}
              />
            ) : (
              <EmptyState
                icon={Receipt}
                title={`Nada lançado em ${monthLabel(ref)}`}
                description="Use o formulário ao lado para adicionar, ou importe o extrato do banco na aba Importar."
              />
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <ul className="mb-4 space-y-2 border-b pb-4 text-[0.8125rem]">
              <li className="flex items-baseline justify-between gap-3">
                <span className="muted">Entrou</span>
                <span className="tnum font-semibold text-[var(--text-in)]">
                  {formatCents(summary.incomeCents)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3">
                <span className="muted">Saiu</span>
                <span className="tnum font-semibold text-[var(--text-out)]">
                  {formatCents(summary.expenseCents)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3">
                <span className="muted">Sobrou</span>
                <span className="tnum font-semibold">
                  {formatCents(summary.incomeCents - summary.expenseCents)}
                </span>
              </li>
            </ul>
            <TransactionComposer categories={plainCategories} accounts={plainAccounts} />
          </Card>
        </div>
      </div>
    </>
  );
}
