"use client";

import { useActionState, useEffect, useRef } from "react";
import { createGoal, type ActionState } from "@/server/actions/goals";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

const initial: ActionState = {};

const KINDS = [
  { value: "PURCHASE", label: "Compra", color: "#6366f1" },
  { value: "TRIP", label: "Viagem", color: "#0891b2" },
  { value: "DEBT_PAYOFF", label: "Quitar dívida", color: "#f43f5e" },
  { value: "INVESTMENT", label: "Investimento", color: "#0d9488" },
  { value: "CUSTOM", label: "Outra", color: "#d95926" },
];

export function GoalComposer() {
  const [state, formAction] = useActionState(createGoal, initial);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <Field label="Nome da meta">
        <Input name="name" required placeholder="Ex.: Trocar de notebook" />
      </Field>

      <Field label="Tipo">
        <Select name="kind" defaultValue="PURCHASE">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor da meta">
          <Input name="target" inputMode="decimal" required placeholder="0,00" />
        </Field>
        <Field label="Já tenho">
          <Input name="saved" inputMode="decimal" placeholder="0,00" />
        </Field>
      </div>

      <Field label="Prazo (opcional)" hint="Uma data deixa a meta concreta e mostra se o ritmo dá conta.">
        <Input name="targetDate" type="date" />
      </Field>

      <Field label="Cor">
        <div className="flex gap-2">
          {KINDS.map((k) => (
            <label key={k.color} className="cursor-pointer">
              <input type="radio" name="color" value={k.color} defaultChecked={k.value === "PURCHASE"} className="peer sr-only" />
              <span
                className="block size-8 rounded-lg ring-offset-2 ring-offset-[var(--surface)] peer-checked:ring-2 peer-checked:ring-[var(--text-muted)]"
                style={{ background: k.color }}
              />
            </label>
          ))}
        </div>
      </Field>

      <Field label="Observação (opcional)">
        <Textarea name="note" placeholder="Por que essa meta importa para você?" />
      </Field>

      {state.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[0.8125rem] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Criando...">
        Criar meta
      </SubmitButton>
    </form>
  );
}
