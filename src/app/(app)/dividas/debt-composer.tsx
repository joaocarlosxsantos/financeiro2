"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createDebt, type ActionState } from "@/server/actions/debts";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { DEBT_KIND_LABEL, TYPICAL_RATES } from "@/lib/debts";

const initial: ActionState = {};

export function DebtComposer() {
  const [state, formAction] = useActionState(createDebt, initial);
  const [kind, setKind] = useState("CARD_REVOLVING");
  const [rate, setRate] = useState("13,00");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setKind("CARD_REVOLVING");
      setRate("13,00");
    }
  }, [state]);

  // Trocar o tipo sugere a taxa típica daquele produto — ponto de partida,
  // não verdade: a taxa real está no contrato ou na fatura.
  function onKindChange(next: string) {
    setKind(next);
    const typical = TYPICAL_RATES.find((t) => t.kind === next);
    if (typical) setRate((typical.bps / 100).toFixed(2).replace(".", ","));
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <Field label="Tipo">
        <Select name="kind" value={kind} onChange={(e) => onKindChange(e.target.value)}>
          {Object.entries(DEBT_KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Nome">
        <Input name="name" required placeholder="Ex.: Rotativo Nubank" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Saldo devedor (R$)">
          <Input name="balance" inputMode="decimal" required placeholder="0,00" />
        </Field>
        <Field label="Juros ao mês (%)" hint="Está na fatura ou no contrato.">
          <Input
            name="rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Parcela mínima (R$)">
          <Input name="minimum" inputMode="decimal" placeholder="0,00" />
        </Field>
        <Field label="Vence no dia">
          <Input name="dueDay" type="number" min={1} max={31} defaultValue={10} required />
        </Field>
      </div>

      <Field label="Credor (opcional)">
        <Input name="creditor" placeholder="Ex.: Banco Inter" />
      </Field>

      <Field label="Observação (opcional)">
        <Textarea name="note" placeholder="Ex.: renegociar em novembro" />
      </Field>

      {state.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[0.8125rem] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Salvando...">
        Adicionar dívida
      </SubmitButton>
    </form>
  );
}
