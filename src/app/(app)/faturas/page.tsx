import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getAccounts, getCardInvoices, getCreditCards } from "@/server/queries";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Hint } from "@/components/ui/hint";
import { EmptyState } from "@/components/ui/empty";
import { CardPicker } from "./card-picker";
import { CycleForm } from "./cycle-form";
import { InvoiceCard } from "./invoice-card";

export const metadata = { title: "Faturas — Financeiro 2.0" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const userId = await requireUserId();
  const { c } = await searchParams;

  const [cards, allAccounts] = await Promise.all([getCreditCards(userId), getAccounts(userId)]);

  if (!cards.length) {
    return (
      <>
        <PageHeader
          title="Faturas do cartão"
          description="A compra no cartão é despesa no dia da compra. O pagamento da fatura é só um movimento entre contas suas."
        />
        <Card className="p-0">
          <EmptyState
            icon={CreditCard}
            title="Nenhum cartão de crédito cadastrado"
            description="Cadastre uma conta do tipo cartão de crédito nas configurações e as faturas aparecem aqui."
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

  const card = cards.find((x) => x.id === c) ?? cards[0];
  const invoices = await getCardInvoices(userId, card);

  const sources = allAccounts
    .filter((a) => a.type !== "CREDIT_CARD")
    .map((a) => ({ id: a.id, name: a.name }));

  const aberta = invoices.find((i) => i.status === "aberta");
  const aPagar = invoices.filter((i) => i.status === "fechada" || i.status === "vencida");
  const totalAPagar = aPagar.reduce((acc, i) => acc + i.totalCents, 0);

  return (
    <>
      <PageHeader
        title="Faturas do cartão"
        description="A compra é despesa no dia em que você compra. O pagamento da fatura é só dinheiro mudando de lugar — por isso ele não conta de novo como gasto."
        action={cards.length > 1 ? <CardPicker cards={cards} currentId={card.id} /> : null}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {card.usingDefaults ? (
            <Hint tone="warn" title="Confirme o ciclo deste cartão">
              Estamos usando o padrão: fecha dia {card.closingDay}, vence dia {card.dueDay}. Ajuste
              ao lado com os dias reais do seu cartão — é isso que decide em qual fatura cada compra
              cai.
            </Hint>
          ) : null}

          {invoices.map((invoice) => (
            <InvoiceCard
              key={invoice.label}
              cardId={card.id}
              cardColor={card.color}
              sources={sources}
              invoice={{
                label: invoice.label,
                dueYear: invoice.ref.year,
                dueMonth: invoice.ref.month,
                periodStart: invoice.periodStart.toISOString(),
                closingDate: invoice.closingDate.toISOString(),
                dueDate: invoice.dueDate.toISOString(),
                totalCents: invoice.totalCents,
                status: invoice.status,
                paidAmountCents: invoice.paidAmountCents,
                paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
                items: invoice.items.map((i) => ({
                  id: i.id,
                  date: i.date.toISOString(),
                  description: i.description,
                  amountCents: i.amountCents,
                  categoryName: i.categoryName,
                  categoryColor: i.categoryColor,
                  installmentNumber: i.installmentNumber,
                  installmentTotal: i.installmentTotal,
                })),
              }}
              defaultOpen={
                (invoice.status === "aberta" ||
                  invoice.status === "fechada" ||
                  invoice.status === "vencida") &&
                invoice.totalCents > 0
              }
            />
          ))}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader title="Situação" subtitle={card.name} />
            <ul className="space-y-3 text-[0.8125rem]">
              <li className="flex items-baseline justify-between gap-3">
                <span className="muted">Fatura aberta</span>
                <span className="tnum font-semibold">
                  {aberta ? formatCents(aberta.totalCents) : "—"}
                </span>
              </li>
              {aberta ? (
                <li className="flex items-baseline justify-between gap-3">
                  <span className="muted">Fecha em</span>
                  <span className="tnum">{formatDate(aberta.closingDate)}</span>
                </li>
              ) : null}
              <li className="flex items-baseline justify-between gap-3 border-t pt-3">
                <span className="muted">
                  Fatura{aPagar.length === 1 ? "" : "s"} a pagar
                  {aPagar.length ? ` (${aPagar.length})` : ""}
                </span>
                <span
                  className="tnum font-semibold"
                  style={{ color: totalAPagar > 0 ? "var(--text-out)" : undefined }}
                >
                  {formatCents(totalAPagar)}
                </span>
              </li>
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Ciclo do cartão"
              subtitle="Compra feita depois do fechamento cai na fatura seguinte."
            />
            <CycleForm
              accountId={card.id}
              closingDay={card.closingDay}
              dueDay={card.dueDay}
            />
          </Card>

          <Hint tone="tip" title="Por que o pagamento não vira gasto">
            Se você lançar a compra <strong>e</strong> o pagamento da fatura, o mesmo dinheiro
            aparece duas vezes e seu gasto fica inflado. Ao importar o extrato, marcamos a linha de
            pagamento de fatura como <strong>transferência</strong> — ela some dos totais mas
            continua visível no histórico.
          </Hint>
        </div>
      </div>
    </>
  );
}
