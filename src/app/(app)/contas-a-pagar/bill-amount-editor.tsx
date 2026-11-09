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
  dueDay,
  participants,
  onDone,
}: {
  billId: string;
  totalCents: number;
  dueDay?: number | null;
  participants: EditorParticipant[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(updateBillAmount, initial);
  const [total, setTotal] = useState(totalCents ? formatCentsPlain(totalCents) : "");
  const [dueDayVal, setDueDayVal] = useState(dueDay != null ? String(dueDay) : "");
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
    <form action={formAction} className="space-y-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <input type="hidden" name="billId" value={billId} />
      <input type="hidden" name="mode" value={mode} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Valor total">
          <Input className="min-h-12 min-w-0 max-w-full text-base!"
            name="total"
            inputMode="decimal"
            placeholder="0,00"
            required
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </Field>

        <Field label="Dia de vencimento" hint="Opcional (1 a 31).">
          <Input className="min-h-12 min-w-0 max-w-full text-base!"
            name="dueDay"
            type="number"
            min={1}
            max={31}
            placeholder="Ex.: 10"
            value={dueDayVal}
            onChange={(e) => setDueDayVal(e.target.value)}
          />
        </Field>
      </div>

      {participants.length ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("EQUAL")}
              className={["min-h-11 min-w-11", `flex-1 rounded-[var(--radius-button)] border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                mode === "EQUAL" ? "border-[var(--text-brand)] bg-[var(--color-save-soft)] text-[var(--text-brand)]" : "border-[var(--border)] text-[var(--text-muted)]"
              }`].filter(Boolean).join(" ")}
            >
              Dividir igualmente
            </button>
            <button
              type="button"
              onClick={() => setMode("MANUAL")}
              className={["min-h-11 min-w-11", `flex-1 rounded-[var(--radius-button)] border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                mode === "MANUAL" ? "border-[var(--text-brand)] bg-[var(--color-save-soft)] text-[var(--text-brand)]" : "border-[var(--border)] text-[var(--text-muted)]"
              }`].filter(Boolean).join(" ")}
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
                    aria-label={`Valor de ${p.name}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="min-h-12 min-w-0 max-w-full text-base! w-28"
                    value={amounts[p.id] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [p.id]: e.target.value }))}
                  />
                </div>
              ))}
              {manualCheck ? (
                <p
                  className={`text-[0.8125rem] font-medium ${
                    manualCheck.ok
                      ? "text-[var(--text-in)]"
                      : "text-[var(--text-out)]"
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

      {state.error ? <p className="text-[0.8125rem] text-[var(--text-out)]">{state.error}</p> : null}

      <div className="flex gap-2">
        <SubmitButton className="min-h-11 min-w-11" size="sm" pendingLabel="Salvando...">
          Salvar
        </SubmitButton>
        <Button className="min-h-11 min-w-11" type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
