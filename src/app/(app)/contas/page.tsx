import Link from "next/link";
import { Wallet } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getBalances } from "@/server/queries";
import { formatCents } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { EmptyState } from "@/components/ui/empty";
import { AccountList } from "./account-list";

export const metadata = { title: "Contas — Financeiro 2.0" };

export default async function AccountsPage() {
  const userId = await requireUserId();
  const overview = await getBalances(userId);

  if (!overview.accounts.length) {
    return (
      <>
        <PageHeader title="Contas" description="Onde o seu dinheiro está agora." />
        <Card className="p-0">
          <EmptyState
            icon={Wallet}
            title="Nenhuma conta cadastrada"
            description="Cadastre suas contas e cartões nas configurações para acompanhar o saldo de cada um."
            action={
              <Link
                href="/configuracoes"
                className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                Ir para configurações
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const comuns = overview.accounts.filter((a) => !a.isCard);
  const cartoes = overview.accounts.filter((a) => a.isCard);

  return (
    <>
      <PageHeader
        title="Contas"
        description="Onde o seu dinheiro está agora, e quanto dele já tem dono. O sistema só conhece o que você lançou — por isso o saldo parte de um valor inicial que você informa."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {overview.needsOpeningBalance ? (
            <Hint tone="tip" title="Informe o saldo inicial">
              Alguma conta ainda está sem saldo inicial. Abra o extrato do banco, copie o saldo de
              uma data e informe abaixo: a partir dela o sistema soma o que entrou e subtrai o que
              saiu. Sem esse ponto de partida o saldo mostrado é só a movimentação, não o valor real.
            </Hint>
          ) : null}

          <Card className="p-0">
            <div className="border-b px-5 py-4">
              <h2 className="text-[0.9375rem] font-semibold tracking-tight">Contas</h2>
              <p className="muted mt-0.5 text-[0.8125rem]">
                Saldo inicial + o que entrou − o que saiu. Transferências entram na conta: elas
                movem dinheiro de verdade.
              </p>
            </div>
            <AccountList
              accounts={comuns.map((a) => ({
                id: a.id,
                name: a.name,
                type: a.type,
                institution: a.institution,
                color: a.color,
                balanceCents: a.balanceCents,
                openingBalanceCents: a.openingBalanceCents,
                openingBalanceDate: a.openingBalanceDate
                  ? a.openingBalanceDate.toISOString().slice(0, 10)
                  : null,
                incomeCents: a.incomeCents,
                expenseCents: a.expenseCents,
                transactionCount: a.transactionCount,
                isCard: false,
              }))}
            />
          </Card>

          {cartoes.length ? (
            <Card className="p-0">
              <div className="border-b px-5 py-4">
                <h2 className="text-[0.9375rem] font-semibold tracking-tight">Cartões</h2>
                <p className="muted mt-0.5 text-[0.8125rem]">
                  Aqui o número é o que você <strong>deve</strong>: compras menos estornos menos os
                  pagamentos de fatura registrados.
                </p>
              </div>
              <AccountList
                accounts={cartoes.map((a) => ({
                  id: a.id,
                  name: a.name,
                  type: a.type,
                  institution: a.institution,
                  color: a.color,
                  balanceCents: a.balanceCents,
                  openingBalanceCents: a.openingBalanceCents,
                  openingBalanceDate: null,
                  incomeCents: a.incomeCents,
                  expenseCents: a.expenseCents,
                  transactionCount: a.transactionCount,
                  isCard: true,
                }))}
              />
            </Card>
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader
              title="Patrimônio líquido"
              subtitle="O que você tem menos o que você deve."
            />
            <p
              className="tnum mb-4 text-3xl font-semibold tracking-tight"
              style={{
                color:
                  overview.netWorthCents >= 0
                    ? "var(--text-in)"
                    : "var(--text-out)",
              }}
            >
              {formatCents(overview.netWorthCents)}
            </p>

            <ul className="space-y-2.5 text-[0.8125rem]">
              <Row label="Disponível em contas" value={overview.availableCents} />
              <Row label="Guardado em metas" value={overview.savedInGoalsCents} />
              <Row label="Devido em cartões" value={-overview.cardOwedCents} negative />
              <Row label="Dívidas" value={-overview.debtBalanceCents} negative />
            </ul>

            <p className="muted mt-4 text-xs leading-relaxed">
              Só entra o que o sistema conhece. Carro, imóvel e investimentos fora daqui não estão
              nesta conta.
            </p>
          </Card>

          <Hint tone="info" title="Como conciliar com o banco">
            Se o saldo aqui não bate com o do banco, quase sempre falta lançamento. Informe o saldo
            inicial com a data de hoje e passe a lançar (ou importar) a partir daí — assim os dois
            números andam juntos daqui para frente.
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
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="muted">{label}</span>
      <span
        className="tnum font-semibold"
        style={negative && value !== 0 ? { color: "var(--text-out)" } : undefined}
      >
        {formatCents(value)}
      </span>
    </li>
  );
}
