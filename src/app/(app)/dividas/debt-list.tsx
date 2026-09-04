"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteDebt, registerDebtPayment, updateDebtField } from "@/server/actions/debts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { formatCents, formatCentsPlain } from "@/lib/money";
import { DEBT_KIND_LABEL, annualRateFromMonthly, formatRate } from "@/lib/debts";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Debt = {
  id: string;
  name: string;
  creditor: string | null;
  kind: string;
  balanceCents: number;
  monthlyRateBps: number;
  minimumPaymentCents: number;
  dueDay: number;
  monthlyInterestCents: number;
  paidSoFarCents: number;
};

export function DebtList({ debts }: { debts: Debt[] }) {
  return (
    <ul className="divide-y">
      {debts.map((debt) => (
        <Row key={debt.id} debt={debt} />
      ))}
    </ul>
  );
}

function Row({ debt }: { debt: Debt }) {
  const [pending, start] = useTransition();
  const [paying, setPaying] = useState(false);
  const confirm = useConfirm();

  return (
    <li className={cn("px-5 py-4 transition-opacity", pending && "opacity-50")}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[0.9375rem] font-semibold">{debt.name}</h3>
            {DEBT_KIND_LABEL[debt.kind] &&
            DEBT_KIND_LABEL[debt.kind].toLowerCase() !== debt.name.trim().toLowerCase() ? (
              <span className="muted rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.6875rem] font-medium ring-1 ring-[var(--border)] ring-inset">
                {DEBT_KIND_LABEL[debt.kind]}
              </span>
            ) : null}
          </div>
          <p className="muted mt-1 text-xs">
            {debt.creditor ? `${debt.creditor} · ` : ""}vence todo dia {debt.dueDay}
            {debt.paidSoFarCents > 0 ? ` · já abatido ${formatCents(debt.paidSoFarCents)}` : ""}
          </p>
        </div>

        <button
          type="button"
          aria-label={`Excluir ${debt.name}`}
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: `Excluir a dívida "${debt.name}"?`,
              confirmLabel: "Excluir",
              tone: "danger",
            });
            if (!ok) return;
            start(async () => void (await deleteDebt(debt.id)));
          }}
          className="muted shrink-0 cursor-pointer rounded-lg p-2.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <EditableField
          label="Saldo devedor"
          value={formatCentsPlain(debt.balanceCents)}
          prefix="R$"
          onSave={(value) => updateDebtField({ id: debt.id, field: "balance", value })}
        />
        <EditableField
          label="Juros ao mês"
          value={(debt.monthlyRateBps / 100).toFixed(2).replace(".", ",")}
          suffix="%"
          onSave={(value) => updateDebtField({ id: debt.id, field: "rate", value })}
        />
        <EditableField
          label="Parcela mínima"
          value={formatCentsPlain(debt.minimumPaymentCents)}
          prefix="R$"
          onSave={(value) => updateDebtField({ id: debt.id, field: "minimum", value })}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {debt.monthlyRateBps > 0 ? (
          <>
            <span className="font-medium text-[var(--text-out)]">
              Custa {formatCents(debt.monthlyInterestCents)} por mês só de juros
            </span>
            <span className="muted">
              {formatRate(debt.monthlyRateBps)} ≈ {annualRateFromMonthly(debt.monthlyRateBps)}% ao
              ano
            </span>
          </>
        ) : (
          <span className="muted">Sem juros informados</span>
        )}
        <button
          type="button"
          onClick={() => setPaying((v) => !v)}
          className="ml-auto cursor-pointer font-medium text-brand-600 hover:underline dark:text-brand-300"
        >
          {paying ? "Fechar" : "Registrar pagamento"}
        </button>
      </div>

      {paying ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border bg-[var(--surface-2)] p-3"
          action={async (formData) => {
            await registerDebtPayment(debt.id, formData);
            setPaying(false);
          }}
        >
          <div className="min-w-36 flex-1">
            <label className="mb-1.5 block text-xs font-medium">Valor pago</label>
            <Input name="amount" inputMode="decimal" placeholder="0,00" required />
          </div>
          <Button type="submit" size="sm">
            Abater do saldo
          </Button>
        </form>
      ) : null}
    </li>
  );
}

function EditableField({
  label,
  value,
  prefix,
  suffix,
  onSave,
}: {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  onSave: (value: string) => Promise<unknown>;
}) {
  const [current, setCurrent] = useState(value);
  const [synced, setSynced] = useState(value);
  const [pending, start] = useTransition();

  if (value !== synced) {
    setSynced(value);
    setCurrent(value);
  }

  return (
    <label className="block">
      <span className="muted mb-1 block text-xs">{label}</span>
      <span className="relative block">
        {prefix ? (
          <span className="muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs">
            {prefix}
          </span>
        ) : null}
        <input
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          onBlur={() => {
            if (current.trim() === value.trim()) return;
            start(async () => void (await onSave(current)));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          inputMode="decimal"
          disabled={pending}
          className={cn("input-base tnum h-9 py-0 text-right text-[0.8125rem]", prefix && "pl-8", suffix && "pr-7")}
        />
        {suffix ? (
          <span className="muted pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}
