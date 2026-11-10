"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createRecurringRule, type ActionState } from "@/server/actions/recurring";
import { Field, MoneyInput, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { monthRefToParam, type MonthRef } from "@/lib/dates";

type Category = { id: string; name: string; kind: "INCOME" | "EXPENSE"; nature: "FIXED" | "VARIABLE" };
type Account = { id: string; name: string };

const initial: ActionState = {};

export function RuleComposer({
  monthRef,
  accounts,
  categories,
}: {
  monthRef: MonthRef;
  accounts: Account[];
  categories: Category[];
}) {
  const [state, formAction] = useActionState(createRecurringRule, initial);
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [nature, setNature] = useState<"FIXED" | "VARIABLE">("FIXED");
  const [categoryId, setCategoryId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const visible = categories.filter((c) => c.kind === kind);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
// eslint-disable-next-line react-hooks/set-state-in-effect -- After recurring rule creation succeeds, clear the controlled category selection.
      setCategoryId("");
    }
  }, [state]);

  function onCategoryChange(id: string) {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat) setNature(cat.nature);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-card)] bg-[var(--surface-2)] p-1">
        {(["EXPENSE", "INCOME"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setCategoryId("");
            }}
            className={["min-h-11 min-w-11", cn(
              "cursor-pointer rounded-[var(--radius-button)] py-2 text-[0.8125rem] font-medium transition-colors",
              kind === k
                ? k === "EXPENSE"
                  ? "bg-[var(--btn-out)] text-[var(--on-acento)] shadow-sm"
                  : "bg-[var(--btn-in)] text-[var(--on-acento)] shadow-sm"
                : "hover:bg-[var(--surface)] text-[var(--text-muted)]",
            )].filter(Boolean).join(" ")}
          >
            {k === "EXPENSE" ? "Sai todo mês" : "Entra todo mês"}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="nature" value={nature} />

      <Field label="Descrição">
        <Input className="min-h-12 min-w-0 max-w-full text-base!" name="description" required placeholder="Ex.: Aluguel" />
      </Field>

      <div className="grid min-w-0 grid-cols-1 items-start gap-3 min-[480px]:grid-cols-2">
        <Field label="Valor (R$)">
          <MoneyInput className="min-h-12 min-w-0 max-w-full text-base!" name="amount" inputMode="decimal" required placeholder="0,00" />
        </Field>
        <Field label="Dia do mês" hint="Meses curtos usam o último dia.">
          <Input className="min-h-12 min-w-0 max-w-full text-base!" name="dayOfMonth" type="number" min={1} max={31} defaultValue={5} required />
        </Field>
      </div>

      <Field label="Categoria">
        <Select className="min-h-12 min-w-0 max-w-full text-base!" name="categoryId" value={categoryId} onChange={(e) => onCategoryChange(e.target.value)}>
          <option value="">Sem categoria</option>
          {visible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Conta">
        <Select className="min-h-12 min-w-0 max-w-full text-base!" name="accountId" required defaultValue={accounts[0]?.id ?? ""}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      {/*
        Empilhados em vez de lado a lado: o seletor nativo de mês
        (`<input type="month">`) segue o idioma do navegador, não o do site —
        "setembro de 2026" (ou "September 2026") não cabe numa coluna de
        metade da largura deste painel e o texto corta. Uma coluna só dá
        espaço de sobra pros dois, em qualquer idioma.
      */}
      <div className="space-y-3">
        <Field label="Começa em">
          <Input className="min-h-12 min-w-0 max-w-full text-base!" name="startMonth" type="month" required defaultValue={monthRefToParam(monthRef)} />
        </Field>
        <Field label="Até (opcional)" hint="Deixe vazio para não ter fim.">
          <Input className="min-h-12 min-w-0 max-w-full text-base!" name="endMonth" type="month" />
        </Field>
      </div>

      <Field label="Observação (opcional)">
        <Textarea className="min-h-12 min-w-0 max-w-full text-base!" name="notes" placeholder="Ex.: reajusta em janeiro" />
      </Field>

      {state.error ? (
        <p role="alert" className="rounded-[var(--radius-input)] bg-[var(--color-money-out-soft)] px-3.5 py-2 text-xs text-[var(--text-out)]">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="min-h-11 min-w-11 w-full" pendingLabel="Criando...">
        Criar recorrência
      </SubmitButton>
    </form>
  );
}
