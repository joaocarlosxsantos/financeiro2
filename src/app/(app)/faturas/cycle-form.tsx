"use client";

import { useActionState } from "react";
import { saveCardCycle, type ActionState } from "@/server/actions/invoices";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

const initial: ActionState = {};

export function CycleForm({
  accountId,
  closingDay,
  dueDay,
}: {
  accountId: string;
  closingDay: number;
  dueDay: number;
}) {
  const [state, formAction] = useActionState(saveCardCycle, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="accountId" value={accountId} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha no dia">
          <Input name="closingDay" type="number" min={1} max={31} defaultValue={closingDay} required />
        </Field>
        <Field label="Vence no dia">
          <Input name="dueDay" type="number" min={1} max={31} defaultValue={dueDay} required />
        </Field>
      </div>

      {state.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[0.8125rem] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[0.8125rem] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Ciclo atualizado.
        </p>
      ) : null}

      <SubmitButton size="sm">Salvar ciclo</SubmitButton>
    </form>
  );
}
