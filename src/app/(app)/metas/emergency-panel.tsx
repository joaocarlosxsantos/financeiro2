"use client";

import { useTransition } from "react";
import { LifeBuoy } from "lucide-react";
import { upsertEmergencyGoal, contributeToGoal } from "@/server/actions/goals";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Input } from "@/components/ui/field";
import { formatCents } from "@/lib/money";
import { monthsToTarget, monthsOfRunway } from "@/lib/finance";
import { GoalRecurringControl, type PlainGoalRecurringRule } from "./goal-recurring-control";

export function EmergencyPanel({
  target,
  saved,
  months,
  costBase,
  usingRealCost,
  goalId,
  monthlyCapacity,
  recurringRule,
}: {
  target: number;
  saved: number;
  months: number;
  costBase: number;
  usingRealCost: boolean;
  goalId: string | null;
  monthlyCapacity: number;
  recurringRule?: PlainGoalRecurringRule | null;
}) {
  const [pending, start] = useTransition();
  const missing = Math.max(0, target - saved);
  const runway = monthsOfRunway(saved, costBase);
  const eta = monthsToTarget(saved, monthlyCapacity, 0, target);
  const done = target > 0 && saved >= target;

  return (
    <Card>
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-500/12 dark:text-cyan-300">
          <LifeBuoy className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">Reserva de emergência</h2>
          <p className="muted mt-0.5 text-[0.8125rem] leading-snug">
            {months} meses de custo de vida ({formatCents(costBase)}/mês
            {usingRealCost ? ", média real dos seus gastos" : ", estimado a partir da renda"}).
          </p>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="tnum text-3xl font-semibold tracking-tight">{formatCents(saved)}</span>
        <span className="muted tnum text-[0.875rem]">meta: {formatCents(target)}</span>
      </div>
      <Progress
        label="Progresso da reserva de emergência"
        value={target ? (saved / target) * 100 : 0}
        color="var(--color-save)"
        height={12}
      />

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Falta guardar" value={formatCents(missing)} />
        <Metric label="Meses cobertos hoje" value={`${runway} de ${months}`} />
        <Metric
          label="Previsão no ritmo atual"
          value={done ? "Concluída" : eta === null ? "—" : `${eta} ${eta === 1 ? "mês" : "meses"}`}
        />
      </div>

      {goalId ? (
        <form
          className="mt-5 flex flex-wrap items-end gap-2"
          action={async (formData) => {
            await contributeToGoal(goalId, formData);
          }}
        >
          <div className="min-w-40 flex-1">
            <label className="mb-1.5 block text-[0.8125rem] font-medium">Registrar aporte</label>
            <Input name="amount" inputMode="decimal" placeholder="0,00" required />
          </div>
          <input type="hidden" name="mode" value="add" />
          <Button type="submit">Guardar</Button>
          <Button
            type="submit"
            name="mode"
            value="withdraw"
            variant="outline"
            formNoValidate={false}
            title="Registrar um resgate da reserva"
          >
            Resgatar
          </Button>
        </form>
      ) : (
        <div className="mt-5">
          <Button
            disabled={pending || target <= 0}
            onClick={() => start(async () => void (await upsertEmergencyGoal(target)))}
          >
            {pending ? "Criando..." : "Criar minha reserva de emergência"}
          </Button>
          {target <= 0 ? (
            <p className="muted mt-2 text-xs">
              Informe sua renda em Configurações para o sistema calcular a meta.
            </p>
          ) : null}
        </div>
      )}

      {goalId ? <GoalRecurringControl goalId={goalId} rule={recurringRule ?? null} /> : null}

      <div className="mt-5">
        <Hint tone={done ? "good" : "tip"}>
          {done ? (
            <>
              Reserva completa. Mantenha o dinheiro em algo com <strong>liquidez diária</strong> e
              direcione os próximos aportes para objetivos de prazo maior.
            </>
          ) : (
            <>
              Reserva de emergência não é investimento: o objetivo é estar disponível{" "}
              <strong>no dia em que der problema</strong>. Prefira Tesouro Selic ou CDB de liquidez
              diária — nunca ações ou fundos com carência.
            </>
          )}
        </Hint>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3.5">
      <p className="muted text-xs">{label}</p>
      <p className="tnum mt-0.5 text-[0.9375rem] font-semibold">{value}</p>
    </div>
  );
}
