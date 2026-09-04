"use client";

import { useActionState, useMemo, useState } from "react";
import { completeOnboarding, type ActionState } from "@/server/actions/settings";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { formatCents, parseMoneyToCents } from "@/lib/money";
import { fiftyThirtyTwenty } from "@/lib/finance";

const initial: ActionState = {};

export function OnboardingForm({
  defaults,
}: {
  defaults: { income: number; emergencyMonths: number; savingsTargetPct: number };
}) {
  const [state, formAction] = useActionState(completeOnboarding, initial);
  const [income, setIncome] = useState(defaults.income ? (defaults.income / 100).toFixed(2).replace(".", ",") : "");
  const [months, setMonths] = useState(String(defaults.emergencyMonths || 6));
  const [savePct, setSavePct] = useState(String(defaults.savingsTargetPct || 20));

  const cents = parseMoneyToCents(income);
  const split = useMemo(() => fiftyThirtyTwenty(cents), [cents]);
  const emergencyEstimate = Math.round(cents * 0.7) * Number(months || 0);
  const monthlySave = Math.round((cents * Number(savePct || 0)) / 100);

  return (
    <form action={formAction} className="space-y-6">
      <div className="card space-y-5 p-6">
        <Field
          label="Renda mensal líquida"
          hint="O que efetivamente cai na sua conta por mês, já com descontos. Se varia, use uma média conservadora."
        >
          <Input
            name="income"
            inputMode="decimal"
            required
            placeholder="Ex.: 5.400,00"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Meses de reserva de emergência"
            hint="CLT estável: 6 meses. Autônomo ou renda variável: 9 a 12."
          >
            <Select name="emergencyMonths" value={months} onChange={(e) => setMonths(e.target.value)}>
              {[3, 6, 9, 12].map((m) => (
                <option key={m} value={m}>
                  {m} meses
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Quanto quero guardar por mês" hint="A referência clássica é 20% da renda.">
            <Select name="savingsTargetPct" value={savePct} onChange={(e) => setSavePct(e.target.value)}>
              {[5, 10, 15, 20, 25, 30, 40].map((p) => (
                <option key={p} value={p}>
                  {p}% da renda
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {cents > 0 ? (
        <div className="card space-y-4 p-6">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">
            Com essa renda, aqui está o seu ponto de partida
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SplitCard label="Essenciais (50%)" value={split.necessitiesCents} color="#6366f1" desc="Moradia, contas, mercado, transporte" />
            <SplitCard label="Estilo de vida (30%)" value={split.wantsCents} color="#f59e0b" desc="Lazer, assinaturas, extras" />
            <SplitCard label="Futuro (20%)" value={split.futureCents} color="#059669" desc="Reserva, investimentos, quitar dívida" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-4">
              <p className="muted text-xs">Meta de reserva estimada</p>
              <p className="tnum mt-1 text-xl font-semibold">{formatCents(emergencyEstimate)}</p>
              <p className="muted mt-1 text-xs leading-snug">
                Estimativa com custo de vida em 70% da renda. Assim que você lançar gastos, o cálculo passa a
                usar o seu custo real.
              </p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="muted text-xs">Guardando {savePct}% ao mês</p>
              <p className="tnum mt-1 text-xl font-semibold">{formatCents(monthlySave)}</p>
              <p className="muted mt-1 text-xs leading-snug">
                Nesse ritmo, a reserva completa fica pronta em cerca de{" "}
                {monthlySave > 0 ? Math.ceil(emergencyEstimate / monthlySave) : "—"} meses.
              </p>
            </div>
          </div>

          <Hint tone="tip" title="Por que a reserva vem antes de investir">
            Sem reserva, qualquer imprevisto vira dívida de cartão — e o juro do rotativo come qualquer
            rendimento. Primeiro o colchão, depois o crescimento.
          </Hint>
        </div>
      ) : null}

      {state.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[0.8125rem] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="w-full sm:w-auto" pendingLabel="Preparando seu painel...">
        Ir para o painel
      </SubmitButton>
    </form>
  );
}

function SplitCard({
  label,
  value,
  color,
  desc,
}: {
  label: string;
  value: number;
  color: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: color }} />
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className="tnum text-lg font-semibold">{formatCents(value)}</p>
      <p className="muted mt-1 text-xs leading-snug">{desc}</p>
    </div>
  );
}
