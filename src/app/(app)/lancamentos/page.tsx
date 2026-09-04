import { CreditCard, Receipt } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getAccounts, getCategories, getRecurringStatus, getTransactions } from "@/server/queries";
import { monthRefFromParam, monthLabel } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { RecurringBanner } from "@/components/recurring-banner";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { Hint } from "@/components/ui/hint";
import { TransactionComposer } from "./transaction-composer";
import { TransactionList } from "./transaction-list";
import { Filters } from "./filters";
import { PeriodSwitcher } from "./period-switcher";
import { ExportMenu } from "./export-menu";

export const metadata = { title: "Lançamentos — Financeiro 2.0" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
    from?: string;
    to?: string;
  }>;
}) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const ref = monthRefFromParam(sp.m);

  /**
   * Período customizado: só entra em vigor com `from` e `to` válidos e com
   * `from <= to`. Fora isso a página se comporta como sempre — presa ao mês
   * de `ref`. É o que deixa buscar/ver lançamentos além de um único mês.
   */
  const customRange =
    sp.from && sp.to && ISO_DATE.test(sp.from) && ISO_DATE.test(sp.to) && sp.from <= sp.to
      ? { from: sp.from, to: sp.to }
      : null;

  const [accounts, categories, transactions, recurring] = await Promise.all([
    getAccounts(userId),
    getCategories(userId),
    getTransactions(
      userId,
      {
        ref: customRange ? undefined : ref,
        dateFrom: customRange?.from,
        dateTo: customRange?.to,
        categoryId: sp.cat && sp.cat !== "NONE" ? sp.cat : undefined,
        uncategorized: sp.cat === "NONE",
        accountKind: sp.acc === "CARD" || sp.acc === "OTHER" ? sp.acc : undefined,
        kind: sp.kind === "INCOME" || sp.kind === "EXPENSE" ? sp.kind : undefined,
        nature: sp.nature === "FIXED" || sp.nature === "VARIABLE" ? sp.nature : undefined,
        search: sp.q || undefined,
      },
      customRange ? 1000 : 300,
    ),
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

  /**
   * Entrou/Saiu/Sobrou consideram só conta corrente — cartão tem linha própria,
   * porque a compra no cartão ainda não saiu de fato da conta (só quando a
   * fatura é paga). Os quatro valores refletem exatamente os filtros ativos
   * acima: a lista e o resumo nunca mostram números diferentes.
   */
  const cash = plain.filter((t) => !t.isTransfer && !t.isCard);
  const card = plain.filter((t) => !t.isTransfer && t.isCard);

  const entrouCents = sumByKind(cash, "INCOME");
  const saiuCents = sumByKind(cash, "EXPENSE");
  const cartaoCents = sumByKind(card, "EXPENSE") - sumByKind(card, "INCOME");
  const sobrouCents = entrouCents - saiuCents;

  return (
    <>
      <PageHeader
        title="Lançamentos"
        description="Tudo que entrou e saiu. Classificar cada gasto como fixo ou variável é o que faz o painel virar decisão."
        action={
          <div className="flex items-center gap-2">
            <PeriodSwitcher value={ref} range={customRange} />
            <ExportMenu />
          </div>
        }
      />

      <RecurringBanner
        monthRef={ref}
        monthName={monthLabel(ref)}
        count={recurring.pending.length}
        incomeCents={recurring.pendingIncomeCents}
        expenseCents={recurring.pendingExpenseCents}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Filters categories={plainCategories} />

          {uncategorized > 0 ? (
            <Hint tone="info">
              {uncategorized} lançamento(s) sem categoria {customRange ? "nesse período" : "neste mês"}.
              Escolha a categoria direto na lista — o valor entra na análise no mesmo instante.
            </Hint>
          ) : null}

          {customRange && plain.length >= 1000 ? (
            <Hint tone="warn">
              Mostrando os 1.000 lançamentos mais recentes do período. Estreite as datas ou use a
              busca para achar algo mais específico.
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
                title={customRange ? "Nada lançado nesse período" : `Nada lançado em ${monthLabel(ref)}`}
                description="Use o formulário ao lado para adicionar, ou importe o extrato do banco na aba Importar."
              />
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <ul className="mb-4 border-b pb-4 text-[0.8125rem]">
              <li className="flex items-baseline justify-between gap-3 py-1">
                <span className="muted">Entrou</span>
                <span className="tnum font-semibold text-[var(--text-in)]">
                  {formatCents(entrouCents)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3 py-1">
                <span className="muted">Saiu</span>
                <span className="tnum font-semibold text-[var(--text-out)]">
                  {formatCents(saiuCents)}
                </span>
              </li>
              <li
                className="mt-2 flex items-baseline justify-between gap-3 border-t pt-2"
                title="Compras no cartão — só saem da sua conta de fato quando a fatura é paga"
              >
                <span className="muted inline-flex items-center gap-1.5">
                  <CreditCard className="size-3.5" />
                  Cartão
                </span>
                <span className="tnum font-semibold text-amber-700 dark:text-amber-300">
                  {formatCents(cartaoCents)}
                </span>
              </li>
              <li className="mt-2 flex items-baseline justify-between gap-3 border-t pt-2">
                <span className="muted">Sobrou</span>
                <span className="tnum font-semibold">{formatCents(sobrouCents)}</span>
              </li>
            </ul>
            <TransactionComposer categories={plainCategories} accounts={plainAccounts} />
          </Card>
        </div>
      </div>
    </>
  );
}

function sumByKind(items: { kind: "INCOME" | "EXPENSE"; amountCents: number }[], kind: "INCOME" | "EXPENSE") {
  return items.filter((t) => t.kind === kind).reduce((acc, t) => acc + t.amountCents, 0);
}
