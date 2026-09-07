"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { updateBillAmount, type ActionState } from "@/server/actions/bills";
import { Field, Input } from "@/components/ui/field";
import { Button, SubmitButton } from "@/components/ui/button";
import { formatCents, formatCentsPlain, parseMoneyToCents } from "@/lib/money";
import { checkManualSplit } from "@/lib/bills";

const initial: ActionState = {};

export type EditorParticipant = { id: string; name: string; amountCents: number };

/**
 * Define o valor total da conta do mês e, para conta em grupo, a divisão
 * entre as pessoas — igualmente (recalcula sozinho) ou manualmente (cada
 * campo é um valor, e a soma precisa bater exatamente com o total: o
 * indicador abaixo mostra ao vivo quanto falta ou quanto passou, antes mesmo
 * de tentar salvar).
 */
export function BillAmountEditor({
  billId,
  totalCents,
  participants,
  onDone,
}: {
  billId: string;
  totalCents: number;
  participants: EditorParticipant[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(updateBillAmount, initial);
  const [total, setTotal] = useState(totalCents ? formatCentsPlain(totalCents) : "");
  const [mode, setMode] = useState<"EQUAL" | "MANUAL">("EQUAL");
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(participants.map((p) => [p.id, p.amountCents ? formatCentsPlain(p.amountCents) : ""])),
  );

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const totalCentsPreview = parseMoneyToCents(total);
  const manualCheck = useMemo(() => {
    if (mode !== "MANUAL" || !participants.length) return null;
    const values = participants.map((p) => parseMoneyToCents(amounts[p.id] ?? ""));
    return checkManualSplit(totalCentsPreview, values);
  }, [mode, participants, amounts, totalCentsPreview]);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-[var(--surface-2)] p-3">
      <input type="hidden" name="billId" value={billId} />
      <input type="hidden" name="mode" value={mode} />

      <Field label="Valor total">
        <Input
          name="total"
          inputMode="decimal"
          placeholder="0,00"
          required
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </Field>

      {participants.length ? (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("EQUAL")}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium ${
                mode === "EQUAL" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-300" : ""
              }`}
            >
              Dividir igualmente
            </button>
            <button
              type="button"
              onClick={() => setMode("MANUAL")}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium ${
                mode === "MANUAL" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-300" : ""
              }`}
            >
              Dividir manualmente
            </button>
          </div>

          {mode === "MANUAL" ? (
            <div className="space-y-2">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{p.name}</span>
                  <Input
                    name={`amount_${p.id}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="w-28"
                    value={amounts[p.id] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [p.id]: e.target.value }))}
                  />
                </div>
              ))}
              {manualCheck ? (
                <p
                  className={`text-[0.8125rem] font-medium ${
                    manualCheck.ok
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {manualCheck.ok
                    ? "A divisão bate certinho com o total."
                    : manualCheck.remainingCents > 0
                      ? `Falta dividir ${formatCents(manualCheck.remainingCents)}.`
                      : `Passou do total em ${formatCents(-manualCheck.remainingCents)}.`}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {state.error ? <p className="text-[0.8125rem] text-rose-600 dark:text-rose-400">{state.error}</p> : null}

      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel="Salvando...">
          Salvar
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
