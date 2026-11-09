import Link from "next/link";
import { Wallet } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getBalances } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { EmptyState } from "@/components/ui/empty";
import { Money } from "@/components/ui/money";
import { AccountList } from "./account-list";

export const metadata = { title: "Saldos — Financeiro 2.0" };

export default async function AccountsPage() {
  const userId = await requireUserId();
  const overview = await getBalances(userId);

  if (!overview.accounts.length) {
    return (
      <>
        <PageHeader title="Saldos" description="Saldos atuais e patrimônio líquido consolidado." />
        <Card className="min-w-0 p-0">
          <EmptyState
            icon={Wallet}
            title="Nenhuma conta cadastrada"
            description="Cadastre contas e cartões nas configurações para acompanhar os saldos."
            action={
              <Link
                href="/configuracoes"
                className="inline-flex h-10 items-center rounded-[var(--radius-button)] bg-[var(--btn-brand)] px-4 text-sm font-medium text-[var(--on-acento)] hover:opacity-90"
              >
                Ir para configurações
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Saldos"
        description="Saldos atuais e patrimônio líquido consolidado."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {overview.needsOpeningBalance ? (
            <Hint tone="tip" title="Informe o saldo inicial">
              Alguma conta está sem saldo inicial. Informe o saldo na data de referência para
              conciliação correta com o extrato bancário.
            </Hint>
          ) : null}
          {overview.totalIncomplete ? <Hint tone="info" title="Total incompleto">Há conta integrada sem snapshot bancário disponível. O consolidado fica incompleto até a próxima sincronização.</Hint> : null}

          <Card className="min-w-0 p-0">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-[0.75rem] font-semibold tracking-normal text-[var(--text-muted)]">
                Saldos
              </h2>
              <p className="muted mt-0.5 text-xs">Contas manuais usam saldo inicial e movimentações; contas integradas usam snapshot bancário.</p>
            </div>
            <AccountList
              accounts={overview.accounts.map((a) => ({
                id: a.id,
                name: a.name,
                type: a.type,
                institution: a.institution,
                color: a.color,
                balanceCents: a.balanceCents,
                financeMode: a.financeMode,
                bankBalanceCents: a.bankBalanceCents,
                bankBalanceAt: a.bankBalanceAt?.toISOString() ?? null,
                openingBalanceCents: a.openingBalanceCents,
                openingBalanceDate: a.openingBalanceDate
                  ? a.openingBalanceDate.toISOString().slice(0, 10)
                  : null,
                incomeCents: a.incomeCents,
                expenseCents: a.expenseCents,
                transactionCount: a.transactionCount,
              }))}
            />
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="min-w-0">
            <CardHeader
              title="Patrimônio líquido"
              subtitle="Total em contas menos saldo de dívidas."
            />
            <div className="mb-4">
              {!overview.totalIncomplete ? <Money
                cents={overview.netWorthCents}
                size="hero"
                className="font-medium"
                tone={overview.netWorthCents < 0 ? "out" : undefined}
              /> : <p className="text-2xl font-semibold">Total incompleto</p>}
            </div>

            <ul className="space-y-2.5 text-[0.8125rem]">
              <Row label="Disponível em contas" value={overview.availableCents} incomplete={overview.totalIncomplete} />
              <Row label="Guardado em metas" value={overview.savedInGoalsCents} />
              <Row label="Dívidas" value={-overview.debtBalanceCents} negative />
            </ul>

            <p className="muted mt-4 text-xs leading-relaxed">
              {overview.totalIncomplete ? "Total incompleto: falta snapshot bancário de uma ou mais contas integradas." : "Consolidação baseada em saldos manuais e snapshots bancários disponíveis."}
            </p>
          </Card>

          <Hint tone="info" title="Conciliação com o banco">
            Se o saldo divergir do extrato, atualize o saldo inicial na data de hoje e lance as
            movimentações a partir dela.
          </Hint>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  negative,
  incomplete,
}: {
  label: string;
  value: number;
  negative?: boolean;
  incomplete?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="muted">{label}</span>
      {incomplete && label === "Disponível em contas" ? <span className="text-xs font-medium">Total incompleto</span> : <Money
        cents={value}
        size="sm"
        className="font-semibold"
        tone={negative && value !== 0 ? "out" : undefined}
      />}
    </li>
  );
}
