"use client";

import { useActionState, useEffect, useRef } from "react";
import { createGoal, type ActionState } from "@/server/actions/goals";
import { Field, MoneyInput, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

import { GOAL_COLORS } from "@/lib/goal-colors";

const initial: ActionState = {};

const KINDS = [
  { value: "PURCHASE", label: "Compra", color: GOAL_COLORS[0], ink: "var(--text-info)" },
  { value: "TRIP", label: "Viagem", color: GOAL_COLORS[1], ink: "var(--text-warn)" },
  { value: "DEBT_PAYOFF", label: "Quitar dívida", color: GOAL_COLORS[2], ink: "var(--text-out)" },
  { value: "INVESTMENT", label: "Investimento", color: GOAL_COLORS[3], ink: "var(--text-in)" },
  { value: "CUSTOM", label: "Outra", color: GOAL_COLORS[4], ink: "var(--text-muted)" },
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
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="name" required placeholder="Ex.: Trocar de notebook" />
      </Field>

      <Field label="Tipo">
        <Select className="min-h-12 min-w-0 max-w-full text-base!" name="kind" defaultValue="PURCHASE">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid min-w-0 grid-cols-1 items-start gap-3 min-[480px]:grid-cols-2">
        <Field label="Valor da meta">
          <MoneyInput className="min-h-12 min-w-0 max-w-full text-base!" name="target" inputMode="decimal" required placeholder="0,00" />
        </Field>
        <Field label="Já tenho">
          <MoneyInput className="min-h-12 min-w-0 max-w-full text-base!" name="saved" inputMode="decimal" placeholder="0,00" />
        </Field>
      </div>

      <Field label="Prazo (opcional)" hint="Uma data deixa a meta concreta e mostra se o ritmo dá conta.">
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="targetDate" type="date" />
      </Field>

      <Field label="Cor">
        <div className="flex gap-2">
          {KINDS.map((k) => (
            <label key={k.color} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
              <input
                type="radio"
                name="color"
                value={k.color}
                aria-label={`Cor ${k.label.toLowerCase()}`}
                defaultChecked={k.value === "PURCHASE"}
                className="peer sr-only"
              />
              <span
                className="block size-11 rounded-lg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--acento)] ring-offset-2 ring-offset-[var(--surface)] peer-checked:ring-2 peer-checked:ring-[var(--text-muted)]"
                style={{ background: k.ink }}
              />
            </label>
          ))}
        </div>
      </Field>

      <Field label="Observação (opcional)">
        <Textarea className="min-h-12 min-w-0 max-w-full text-base!" name="note" placeholder="Por que essa meta importa para você?" />
      </Field>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-[var(--color-money-out-soft)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--text-out)]">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="min-h-11 min-w-11 w-full" pendingLabel="Criando...">
        Criar meta
      </SubmitButton>
    </form>
  );
}
