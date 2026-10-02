import { Repeat } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getAccounts, getCategories, getRecurringStatus, getUser } from "@/server/queries";
import { monthRefFromParam, monthLabel } from "@/lib/dates";
import { formatCents, pct } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { MonthSwitcher } from "@/components/month-switcher";
import { Card, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { EmptyState } from "@/components/ui/empty";
import { PendingPanel } from "./pending-panel";
import { RuleList } from "./rule-list";
import { RuleComposer } from "./rule-composer";

export const metadata = { title: "Recorrentes — Financeiro 2.0" };

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const userId = await requireUserId();
  const { m } = await searchParams;
  const ref = monthRefFromParam(m);

  const [user, status, accounts, categories] = await Promise.all([
    getUser(userId),
    getRecurringStatus(userId, ref),
    getAccounts(userId),
    getCategories(userId),
  ]);

  const income = user.monthlyIncomeCents;
  const comprometido = income ? pct(status.monthlyExpenseCents, income) : 0;

  return (
    <>
      <PageHeader
        title="Lançamentos recorrentes"
        description="Compromissos e receitas que se repetem todo mês."
        action={<MonthSwitcher value={ref} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {status.pending.length ? (
            <PendingPanel
              monthRef={ref}
              monthName={monthLabel(ref)}
              pending={status.pending.map((r) => ({
                id: r.id,
                description: r.description,
                amountCents: r.amountCents,
                kind: r.kind,
                dayOfMonth: r.dayOfMonth,
                categoryName: r.categoryName,
                categoryColor: r.categoryColor,
              }))}
              incomeCents={status.pendingIncomeCents}
              expenseCents={status.pendingExpenseCents}
            />
          ) : status.rules.length ? (
            <Hint tone="good" title={`Tudo lançado em ${monthLabel(ref)}`}>
              Todas as recorrências ativas já foram lançadas neste mês.
            </Hint>
          ) : null}

          <Card className="p-0">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Suas recorrências
              </h2>
              <p className="muted mt-0.5 text-xs">
                Pausar interrompe a geração futura sem apagar lançamentos anteriores.
              </p>
            </div>

            {status.rules.length ? (
              <RuleList
                monthRef={ref}
                rules={status.rules.map((r) => ({
                  id: r.id,
                  description: r.description,
                  amountCents: r.amountCents,
                  kind: r.kind,
                  nature: r.nature,
                  dayOfMonth: r.dayOfMonth,
                  active: r.active,
                  categoryName: r.categoryName,
                  categoryColor: r.categoryColor,
                  accountName: r.accountName,
                  generated: r.generated,
                  dueThisMonth: r.dueThisMonth,
                  endYear: r.endYear,
                  endMonth: r.endMonth,
                }))}
              />
            ) : (
              <EmptyState
                icon={Repeat}
                title="Nenhuma recorrência cadastrada"
                description="Cadastre compromissos mensais (aluguel, contas, assinaturas ou salário) ao lado."
              />
            )}
          </Card>

          <Hint tone="tip" title="Geração sob controle">
            Lançamentos recorrentes não entram no extrato automaticamente: confira e aprove na lista antes de lançar.
          </Hint>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader title="Compromisso mensal" subtitle="Soma das recorrências ativas." />
            <ul className="space-y-3 text-[0.8125rem]">
              <li className="flex items-baseline justify-between gap-3">
                <span className="muted">Entradas previstas</span>
                <span className="tnum font-mono font-semibold text-[var(--text-in)]">
                  {formatCents(status.monthlyIncomeCents)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3">
                <span className="muted">Saídas previstas</span>
                <span className="tnum font-mono font-semibold text-[var(--text-out)]">
                  {formatCents(status.monthlyExpenseCents)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3 border-t border-[var(--line)] pt-3">
                <span className="muted">Da renda já comprometida</span>
                <span className="tnum font-mono font-semibold">{income ? `${comprometido}%` : "—"}</span>
              </li>
            </ul>

            {income && comprometido > 0 ? (
              <div className="mt-4">
                <Hint tone={comprometido > 60 ? "warn" : "info"}>
                  {comprometido > 60 ? (
                    <>
                      <strong>{comprometido}%</strong> da renda comprometida antes de qualquer gasto discricionário.
                    </>
                  ) : (
                    <>
                      <strong>{comprometido}%</strong> da renda representa seu piso de custo fixo mensal.
                    </>
                  )}
                </Hint>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Nova recorrência"
              subtitle="Receitas ou despesas fixas mensais."
            />
            <RuleComposer
              monthRef={ref}
              accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
              categories={categories.map((c) => ({
                id: c.id,
                name: c.name,
                kind: c.kind as "INCOME" | "EXPENSE",
                nature: c.nature as "FIXED" | "VARIABLE",
              }))}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
