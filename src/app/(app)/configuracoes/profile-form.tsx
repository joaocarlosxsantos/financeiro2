"use client";

import { useActionState } from "react";
import { saveProfile, type ActionState } from "@/server/actions/settings";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

const initial: ActionState = {};

export function ProfileForm({
  defaults,
}: {
  defaults: { name: string; income: number; emergencyMonths: number; savingsTargetPct: number };
}) {
  const [state, formAction] = useActionState(saveProfile, initial);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Nome">
        <Input name="name" defaultValue={defaults.name} required />
      </Field>

      <Field label="Renda mensal líquida" hint="O que cai na conta, já com descontos.">
        <Input
          name="income"
          inputMode="decimal"
          defaultValue={(defaults.income / 100).toFixed(2).replace(".", ",")}
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Meses de reserva">
          <Select name="emergencyMonths" defaultValue={String(defaults.emergencyMonths)}>
            {[3, 6, 9, 12, 18, 24].map((m) => (
              <option key={m} value={m}>
                {m} meses
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Meta de economia">
          <Select name="savingsTargetPct" defaultValue={String(defaults.savingsTargetPct)}>
            {[5, 10, 15, 20, 25, 30, 40, 50].map((p) => (
              <option key={p} value={p}>
                {p}% da renda
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {state.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[0.8125rem] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[0.8125rem] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Perfil atualizado.
        </p>
      ) : null}

      <SubmitButton>Salvar perfil</SubmitButton>
    </form>
  );
}
