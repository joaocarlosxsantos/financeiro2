"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createDebt, type ActionState } from "@/server/actions/debts";
import { Field, MoneyInput, Input, Select, Textarea } from "@/components/ui/field";
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
// eslint-disable-next-line react-hooks/set-state-in-effect -- After debt creation succeeds, restore the default debt kind selection.
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
        <Select className="min-h-12 min-w-0 max-w-full text-base!" name="kind" value={kind} onChange={(e) => onKindChange(e.target.value)}>
          {Object.entries(DEBT_KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Nome">
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="name" required placeholder="Ex.: Rotativo Nubank" />
      </Field>

      <div className="grid min-w-0 grid-cols-1 items-start gap-3 min-[480px]:grid-cols-2">
        <Field label="Saldo devedor (R$)">
          <MoneyInput className="min-h-12 min-w-0 max-w-full text-base!" name="balance" inputMode="decimal" required placeholder="0,00" />
        </Field>
        <Field label="Juros ao mês (%)" hint="Está na fatura ou no contrato.">
          <Input className="min-h-12 min-w-0 max-w-full text-base!"
            name="rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-3 min-[480px]:grid-cols-2">
        <Field label="Parcela mínima (R$)">
          <MoneyInput className="min-h-12 min-w-0 max-w-full text-base!" name="minimum" inputMode="decimal" placeholder="0,00" />
        </Field>
        <Field label="Vence no dia">
          <Input className="min-h-12 min-w-0 max-w-full text-base!" name="dueDay" type="number" min={1} max={31} defaultValue={10} required />
        </Field>
      </div>

      <Field label="Credor (opcional)">
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="creditor" placeholder="Ex.: Banco Inter" />
      </Field>

      <Field label="Observação (opcional)">
        <Textarea className="min-h-12 min-w-0 max-w-full text-base!" name="note" placeholder="Ex.: renegociar em novembro" />
      </Field>

      {state.error ? (
        <p role="alert" className="rounded-xl bg-[var(--color-money-out-soft)] px-3.5 py-2.5 text-[0.8125rem] text-[var(--text-out)]">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="min-h-11 min-w-11 w-full" pendingLabel="Salvando...">
        Adicionar dívida
      </SubmitButton>
    </form>
  );
}
