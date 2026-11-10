import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { getSharedGroup, isSharedSchemaMissing, SHARED_GROUP_PATH } from "@/server/shared-groups";
import { AddSharedExpense, RecordSettlement } from "../group-forms";

export const metadata = { title: "Despesas do grupo" };

export default async function SharedGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const userId = await requireUserId();
  const { groupId } = await params;
  const group = await getSharedGroup(userId, groupId).catch((error: unknown) => {
    if (isSharedSchemaMissing(error)) return null;
    throw error;
  });
  if (!group) notFound();
  const names = new Map(group.members.map(({ id, name }) => [id, name]));
  return <>
    <Link href={SHARED_GROUP_PATH} className="mb-2 inline-flex min-h-11 items-center text-sm text-[var(--text-brand)] underline">Grupos e acertos</Link>
    <PageHeader title={group.name} action={<AddSharedExpense groupId={group.id} members={group.members} />} />
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="min-w-0 space-y-3" aria-labelledby="pending-settlements">
        <h2 id="pending-settlements" className="text-heading font-semibold">Quem deve a quem</h2>
        {group.debts.length ? <ul className="divide-y rounded-xl border border-[var(--line)]">
          {group.debts.map((debt) => <li key={`${debt.fromId}-${debt.toId}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <p className="min-w-0 break-words text-sm"><strong>{names.get(debt.fromId)}</strong> deve a <strong>{names.get(debt.toId)}</strong><span className="tnum mt-1 block">{formatCents(debt.amountCents)}</span></p>
            <RecordSettlement groupId={group.id} debt={debt} from={names.get(debt.fromId)!} to={names.get(debt.toId)!} />
          </li>)}
        </ul> : <p className="muted text-sm">Nenhum acerto em aberto.</p>}
      </section>
      <section className="min-w-0 space-y-3" aria-labelledby="member-balances">
        <h2 id="member-balances" className="text-heading font-semibold">Saldo por pessoa</h2>
        <ul className="divide-y rounded-xl border border-[var(--line)]">{group.balances.map((balance) => <li key={balance.memberId} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
          <span className="min-w-0 break-words">{names.get(balance.memberId)}</span>
          <span className="tnum">{balance.balanceCents ? `${formatCents(Math.abs(balance.balanceCents))} ${balance.balanceCents < 0 ? "a pagar" : "a receber"}` : "Quitado"}</span>
        </li>)}</ul>
      </section>
    </div>
    <section className="mt-7 space-y-3" aria-labelledby="recent-expenses">
      <h2 id="recent-expenses" className="text-heading font-semibold">Despesas recentes</h2>
      {group.expenses.length ? <ul className="divide-y rounded-xl border border-[var(--line)]">
        {group.expenses.slice(0, 20).map((expense) => <li key={expense.id} className="p-3">
          <details>
            <summary className="min-h-11 cursor-pointer break-words text-sm"><strong>{expense.description}</strong> · {formatCents(expense.amountCents)} · Pago por {names.get(expense.payerId)}</summary>
            <ul className="space-y-1 pb-2 pl-4 text-sm text-[var(--text-muted)]">{expense.shares.map((part) => <li key={part.memberId}>{names.get(part.memberId)} · {formatCents(part.amountCents)}</li>)}</ul>
          </details>
        </li>)}
      </ul> : <p className="muted text-sm">Nenhuma despesa registrada.</p>}
    </section>
    {group.settlements.length > 0 && <section className="mt-7 space-y-3" aria-labelledby="recent-payments">
      <h2 id="recent-payments" className="text-heading font-semibold">Acertos recentes</h2>
      <ul className="divide-y rounded-xl border border-[var(--line)]">{group.settlements.slice(0, 20).map((payment) => <li key={payment.id} className="break-words p-3 text-sm">
        {names.get(payment.fromId)} pagou {formatCents(payment.amountCents)} a {names.get(payment.toId)}
      </li>)}</ul>
    </section>}
  </>;
}
