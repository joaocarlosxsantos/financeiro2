"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createTransaction, type ActionState } from "@/server/actions/transactions";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { PlainAccount, PlainCategory } from "./types";

const initial: ActionState = {};

export function TransactionComposer({
  categories,
  accounts,
}: {
  categories: PlainCategory[];
  accounts: PlainAccount[];
}) {
  const [state, formAction] = useActionState(createTransaction, initial);
  const [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [categoryId, setCategoryId] = useState("");
  const [nature, setNature] = useState<"FIXED" | "VARIABLE">("VARIABLE");
  const formRef = useRef<HTMLFormElement>(null);

  const visible = categories.filter((c) => c.kind === kind);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setCategoryId("");
    }
  }, [state]);

  // A natureza (fixo/variável) segue a categoria escolhida, mas dá para trocar.
  function onCategoryChange(id: string) {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat) setNature(cat.nature);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-2)] p-1">
        {(["EXPENSE", "INCOME"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setCategoryId("");
            }}
            className={cn(
              "cursor-pointer rounded-lg py-2 text-[0.8125rem] font-medium transition-colors",
              kind === k
                ? k === "EXPENSE"
                  ? "bg-[var(--color-money-out)] text-white shadow-sm"
                  : "bg-[var(--color-money-in)] text-white shadow-sm"
                : "hover:bg-[var(--surface)]",
            )}
          >
            {k === "EXPENSE" ? "Saiu" : "Entrou"}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="nature" value={nature} />

      <Field label="Descrição">
        <Input name="description" required placeholder="Ex.: Mercado do mês" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)">
          <Input name="amount" inputMode="decimal" required placeholder="0,00" />
        </Field>
        <Field label="Data">
          <Input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </Field>
      </div>

      <Field label="Categoria">
        <Select name="categoryId" value={categoryId} onChange={(e) => onCategoryChange(e.target.value)}>
          <option value="">Sem categoria</option>
          {visible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      {kind === "EXPENSE" ? (
        <Field label="Tipo de gasto" hint="Fixo se repete todo mês. Variável muda conforme o seu comportamento.">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-2)] p-1">
            {(["FIXED", "VARIABLE"] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNature(n)}
                className={cn(
                  "cursor-pointer rounded-lg py-2 text-[0.8125rem] font-medium transition-colors",
                  nature === n ? "bg-[var(--surface)] shadow-sm ring-1 ring-[var(--border)]" : "muted",
                )}
              >
                {n === "FIXED" ? "Fixo" : "Variável"}
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      <Field label="Conta">
        <Select name="accountId" required defaultValue={accounts[0]?.id ?? ""}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      {state.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[0.8125rem] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Lançando...">
        Adicionar lançamento
      </SubmitButton>
    </form>
  );
}
