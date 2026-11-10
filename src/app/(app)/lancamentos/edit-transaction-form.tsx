"use client";

import { useActionState } from "react";
import { editManualTransaction } from "@/server/actions/edit-transaction";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { formatCentsPlain } from "@/lib/money";
import type { PlainTransaction } from "./types";

export function EditTransactionForm({ transaction, onSaved }: { transaction: PlainTransaction; onSaved: () => void }) {
  const [state, action, pending] = useActionState(async (_previous: { error?: string; ok?: boolean }, form: FormData) => {
    const result = await editManualTransaction({ id: transaction.id, description: form.get("description"), amount: form.get("amount"), date: form.get("date") });
    if (result.ok) onSaved();
    return result;
  }, {});
  return <form action={action} className="mb-5 space-y-4" aria-busy={pending}>
    <fieldset disabled={pending} className="space-y-4">
      <Field label="Descrição"><Input name="description" required minLength={2} maxLength={255} defaultValue={transaction.description} /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Valor (R$)"><Input name="amount" required inputMode="decimal" defaultValue={formatCentsPlain(transaction.amountCents)} /></Field>
        <Field label="Data"><Input name="date" required type="date" defaultValue={transaction.date} /></Field>
      </div>
    </fieldset>
    {state.error && <p role="alert" className="text-sm text-[var(--text-out)]">{state.error}</p>}
    <SubmitButton pendingLabel="Salvando…">Salvar alterações</SubmitButton>
  </form>;
}
