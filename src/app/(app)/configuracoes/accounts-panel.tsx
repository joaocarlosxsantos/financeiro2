"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createAccount, deleteAccount, type ActionState } from "@/server/actions/settings";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, SubmitButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

const initial: ActionState = {};

export function AccountsPanel({
  accounts,
}: {
  accounts: { id: string; name: string; type: string; color: string; institution: string | null }[];
}) {
  const [state, formAction] = useActionState(createAccount, initial);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state]);

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-xl border">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <span className="size-2.5 rounded-full" style={{ background: a.color }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.875rem] font-medium">{a.name}</p>
              <p className="muted text-xs">
                {a.type}
                {a.institution ? ` · ${a.institution}` : ""}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Arquivar ${a.name}`}
              onClick={async () => {
                const ok = await confirm({
                  title: `Arquivar a conta "${a.name}"?`,
                  description: "Os lançamentos continuam salvos.",
                  confirmLabel: "Arquivar",
                  tone: "danger",
                });
                if (!ok) return;
                start(async () => void (await deleteAccount(a.id)));
              }}
              className="muted cursor-pointer rounded-lg p-2.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {!accounts.length ? (
          <li className="muted px-4 py-6 text-center text-[0.8125rem]">Nenhuma conta cadastrada.</li>
        ) : null}
      </ul>

      {open ? (
        <form ref={ref} action={formAction} className="space-y-3 rounded-xl border bg-[var(--surface-2)] p-4">
          <Field label="Nome">
            <Input name="name" required placeholder="Ex.: Nubank" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <Select name="type" defaultValue="CHECKING">
                <option value="CHECKING">Conta corrente</option>
                <option value="SAVINGS">Poupança</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
                <option value="CASH">Dinheiro</option>
                <option value="INVESTMENT">Investimento</option>
              </Select>
            </Field>
            <Field label="Instituição (opcional)">
              <Input name="institution" placeholder="Ex.: Banco Inter" />
            </Field>
          </div>
          {state.error ? <p className="text-[0.8125rem] text-rose-600">{state.error}</p> : null}
          <div className="flex gap-2">
            <SubmitButton size="sm">Adicionar conta</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Nova conta
        </Button>
      )}
    </div>
  );
}
