"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { archiveBillGrouping, createBillGrouping, type ActionState } from "@/server/actions/bills";
import { Field, Input } from "@/components/ui/field";
import { Button, SubmitButton } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

const initial: ActionState = {};

export type PlainGrouping = { id: string; name: string; color: string };

/** Pastas simples pra organizar contas — sem lógica própria, só nome e cor. */
export function BillGroupingsManager({ groupings }: { groupings: PlainGrouping[] }) {
  const [state, formAction] = useActionState(createBillGrouping, initial);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: `Arquivar o agrupamento "${name}"?`,
      description: "As contas dentro dele continuam salvas, só ficam sem agrupamento.",
      confirmLabel: "Arquivar",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => void (await archiveBillGrouping(id)));
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-xl border">
        {groupings.map((g) => (
          <li key={g.id} className="flex items-center gap-3 px-3 py-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{g.name}</span>
            <button
              type="button"
              aria-label={`Arquivar ${g.name}`}
              onClick={() => void remove(g.id, g.name)}
              className="muted cursor-pointer rounded-lg p-1.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
        {!groupings.length ? (
          <li className="muted px-3 py-4 text-center text-[0.8125rem]">Nenhum agrupamento ainda.</li>
        ) : null}
      </ul>

      {open ? (
        <form ref={formRef} action={formAction} className="space-y-2 rounded-xl border bg-[var(--surface-2)] p-3">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label="Nome">
                <Input name="name" required placeholder="Ex.: Casa" />
              </Field>
            </div>
            <Field label="Cor">
              <Input name="color" type="color" defaultValue="#64748b" className="h-11 w-16 p-1" />
            </Field>
          </div>
          {state.error ? <p className="text-[0.8125rem] text-rose-600">{state.error}</p> : null}
          <div className="flex gap-2">
            <SubmitButton size="sm">Adicionar</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Novo agrupamento
        </Button>
      )}
    </div>
  );
}
