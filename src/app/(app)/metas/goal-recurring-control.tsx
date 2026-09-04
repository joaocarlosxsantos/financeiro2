"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Repeat, Pause, Play, Trash2 } from "lucide-react";
import {
  createGoalRecurringRule,
  deleteGoalRecurringRule,
  toggleGoalRecurringRule,
  type ActionState,
} from "@/server/actions/goal-recurring";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton, Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { monthRefToParam, currentMonthRef } from "@/lib/dates";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type PlainGoalRecurringRule = {
  id: string;
  amountCents: number;
  dayOfMonth: number;
  active: boolean;
  /** Já caiu um aporte desta regra no mês corrente? */
  generated: boolean;
};

const initial: ActionState = {};

/**
 * "Guarde R$ 200 todo dia 5 nesta meta" — o mesmo conceito de Recorrentes,
 * só que para metas. Sem regra ainda: um link abre o formulário de criar.
 * Com regra: uma linha compacta com pausar/retomar e excluir.
 */
export function GoalRecurringControl({ goalId, rule }: { goalId: string; rule: PlainGoalRecurringRule | null }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createGoalRecurringRule, initial);
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (rule) {
    return (
      <div className={pending ? "opacity-50" : undefined}>
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border bg-[var(--surface-2)] px-3 py-2 text-[0.8125rem]">
          <Repeat className="muted size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <strong className="tnum">{formatCents(rule.amountCents)}</strong> todo dia {rule.dayOfMonth}
            {!rule.active ? <span className="muted"> · pausado</span> : null}
            {rule.active && rule.generated ? <span className="muted"> · já caiu este mês</span> : null}
          </span>
          <button
            type="button"
            title={rule.active ? "Pausar aporte automático" : "Retomar aporte automático"}
            onClick={() => start(async () => void (await toggleGoalRecurringRule(rule.id, !rule.active)))}
            className="muted cursor-pointer rounded-lg p-1.5 hover:bg-[var(--surface)]"
          >
            {rule.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <button
            type="button"
            title="Excluir aporte automático"
            onClick={async () => {
              const ok = await confirm({
                title: "Excluir este aporte automático?",
                confirmLabel: "Excluir",
                tone: "danger",
              });
              if (!ok) return;
              start(async () => void (await deleteGoalRecurringRule(rule.id)));
            }}
            className="muted cursor-pointer rounded-lg p-1.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1.5 text-[0.8125rem] font-medium text-brand-600 hover:underline dark:text-brand-300"
      >
        <Repeat className="size-3.5" />
        {open ? "Fechar" : "Configurar aporte automático"}
      </button>

      {open ? (
        <form
          ref={formRef}
          action={formAction}
          className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border bg-[var(--surface-2)] p-3"
        >
          <input type="hidden" name="goalId" value={goalId} />
          <input type="hidden" name="startMonth" value={monthRefToParam(currentMonthRef())} />
          <div className="min-w-28 flex-1">
            <Field label="Valor">
              <Input name="amount" inputMode="decimal" placeholder="0,00" required />
            </Field>
          </div>
          <div className="w-24">
            <Field label="Dia do mês">
              <Input name="dayOfMonth" type="number" min={1} max={31} defaultValue={5} required />
            </Field>
          </div>
          <SubmitButton size="sm" pendingLabel="Criando...">
            Guardar
          </SubmitButton>
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          {state.error ? (
            <p className="w-full text-[0.75rem] text-rose-600 dark:text-rose-400">{state.error}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
