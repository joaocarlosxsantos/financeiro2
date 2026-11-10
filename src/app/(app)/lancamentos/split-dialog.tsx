"use client";

import { useMemo, useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCents, formatCentsPlain, parseMoneyToCents } from "@/lib/money";
import { computeSplit, type SplitMode, type SplitPersonInput } from "@/lib/splits";
import { clearTransactionSplit, setTransactionSplit } from "@/server/actions/splits";
import { cn } from "@/lib/cn";
import type { PlainSplit, PlainTransaction } from "./types";

type PersonFormState = {
  id: string;
  name: string;
  phone: string;
  amount: string; // valor em R$ (para modo VALUE)
  percent: string; // porcentagem (para modo PERCENT)
};

export function SplitDialog({
  isOpen,
  onClose,
  transaction,
  initialSplits,
}: {
  isOpen: boolean;
  onClose: () => void;
  transaction: PlainTransaction;
  initialSplits?: PlainSplit[];
}) {
  if (!isOpen) return null;
  return (
    <SplitDialogContent
      onClose={onClose}
      transaction={transaction}
      initialSplits={initialSplits}
    />
  );
}

function SplitDialogContent({
  onClose,
  transaction,
  initialSplits,
}: {
  onClose: () => void;
  transaction: PlainTransaction;
  initialSplits?: PlainSplit[];
}) {
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const hasExistingSplits = Boolean(initialSplits && initialSplits.length > 0);

  // Determina modo e pessoas iniciais
  const [mode, setMode] = useState<SplitMode>(() => {
    if (!initialSplits || initialSplits.length === 0) return "EQUAL";
    // Se todos tiverem valores iguais, podemos sugerir EQUAL, senão VALUE
    const firstAmount = initialSplits[0]?.amountCents;
    const allSame = initialSplits.every((s) => s.amountCents === firstAmount);
    return allSame ? "EQUAL" : "VALUE";
  });

  const [myIncluded, setMyIncluded] = useState<boolean>(() => {
    if (!initialSplits || initialSplits.length === 0) return true;
    const sumOthers = initialSplits.reduce((acc, s) => acc + s.amountCents, 0);
    return sumOthers < transaction.amountCents;
  });

  const [people, setPeople] = useState<PersonFormState[]>(() => {
    if (initialSplits && initialSplits.length > 0) {
      return initialSplits.map((s, idx) => ({
        id: s.id || `init-${idx}`,
        name: s.name,
        phone: s.phone ?? "",
        amount: formatCentsPlain(s.amountCents),
        percent: ((s.amountCents / transaction.amountCents) * 100).toFixed(0),
      }));
    }
    return [{ id: "p-1", name: "", phone: "", amount: "", percent: "" }];
  });

  // Foco inicial e trap de foco acessível


  // Manipulação de pessoas
  function addPerson() {
    if (people.length >= 20) return;
    setPeople((prev) => [
      ...prev,
      { id: `p-${Date.now()}-${prev.length}`, name: "", phone: "", amount: "", percent: "" },
    ]);
  }

  function removePerson(index: number) {
    if (people.length <= 1) return;
    setPeople((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePerson(index: number, patch: Partial<PersonFormState>) {
    setPeople((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  // Pré-visualização ao vivo usando computeSplit
  const preview = useMemo(() => {
    const othersForCompute: SplitPersonInput[] = people.map((p) => {
      const item: SplitPersonInput = {
        name: p.name.trim() || "Pessoa",
        phone: p.phone.trim() || null,
      };
      if (mode === "VALUE") {
        item.amount = parseMoneyToCents(p.amount);
      } else if (mode === "PERCENT") {
        item.percent = Number(p.percent.replace(",", ".")) || 0;
      }
      return item;
    });

    return computeSplit(transaction.amountCents, mode, othersForCompute, myIncluded);
  }, [people, mode, myIncluded, transaction.amountCents]);

  // Salvar divisão
  function handleSave() {
    setActionError(null);
    startTransition(async () => {
      const othersPayload = people.map((p) => {
        const item: {
          name: string;
          phone?: string;
          amount?: number;
          percent?: number;
        } = {
          name: p.name.trim(),
          phone: p.phone.trim() || undefined,
        };
        if (mode === "VALUE") {
          item.amount = parseMoneyToCents(p.amount);
        } else if (mode === "PERCENT") {
          item.percent = Number(p.percent.replace(",", ".")) || 0;
        }
        return item;
      });

      const res = await setTransactionSplit(transaction.id, {
        mode,
        myIncluded,
        others: othersPayload,
      });

      if (res.error) {
        setActionError(res.error);
      } else {
        onClose();
      }
    });
  }

  // Remover divisão
  function handleClear() {
    setActionError(null);
    startTransition(async () => {
      const res = await clearTransactionSplit(transaction.id);
      if (res.error) {
        setActionError(res.error);
      } else {
        onClose();
      }
    });
  }

  const isFormValid =
    people.length > 0 &&
    people.every((p) => p.name.trim().length > 0) &&
    preview.ok;

  return (
    <Sheet title="Dividir despesa" maxWidth="xl" onClose={onClose}>
      <p className="mb-3 break-words text-sm text-[var(--text-muted)]">{transaction.description} ? {formatCents(transaction.amountCents)}</p>
        <div className="space-y-4 py-4">
          {/* Modo de divisão */}
          <div>
            <label className="muted mb-1.5 block text-xs font-semibold tracking-normal">
              Modo de divisão
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--surface-2)] p-1 text-xs">
              {(
                [
                  { key: "EQUAL", label: "Igual" },
                  { key: "PERCENT", label: "Percentual" },
                  { key: "VALUE", label: "Valor" },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={["min-h-11 min-w-11", cn(
                    "cursor-pointer rounded-[var(--radius-xs)] py-1.5 font-medium transition-colors",
                    mode === m.key
                      ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]",
                  )].filter(Boolean).join(" ")}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Eu participo */}
          <label className="min-h-11 flex cursor-pointer select-none items-center gap-2.5 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs text-[var(--text)]">
            <input
              type="checkbox"
              checked={myIncluded}
              onChange={(e) => setMyIncluded(e.target.checked)}
              className="size-4 rounded-[var(--radius-xs)] accent-[var(--acento)] cursor-pointer"
            />
            <span className="font-medium">
              Eu participo da divisão (minha parte fica comigo)
            </span>
          </label>

          {/* Lista de pessoas */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="muted text-xs font-semibold tracking-normal">
                Outras pessoas ({people.length})
              </label>
              {people.length < 20 ? (
                <button
                  type="button"
                  onClick={addPerson}
                  className="min-h-11 min-w-11 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--text-brand)] hover:underline"
                >
                  <Plus className="size-3" />
                  Adicionar pessoa
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              {people.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-start gap-2 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--surface)] p-2.5"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="muted mb-1 block text-xs">Nome</label>
                        <input aria-label={`Nome da pessoa ${idx + 1}`}
                          type="text"
                          required
                          data-autofocus={idx === 0 ? "" : undefined}
                          value={p.name}
                          onChange={(e) => updatePerson(idx, { name: e.target.value })}
                          placeholder="Ex.: Mariana"
                          className="min-h-12 min-w-0 max-w-full text-base! input-base h-8 py-0 text-xs"
                        />
                      </div>
                      <div>
                        <label className="muted mb-1 block text-xs">
                          Telefone / WhatsApp (opcional)
                        </label>
                        <input aria-label={`Telefone da pessoa ${idx + 1}`}
                          type="tel"
                          value={p.phone}
                          onChange={(e) => updatePerson(idx, { phone: e.target.value })}
                          placeholder="(11) 99999-9999"
                          className="min-h-12 min-w-0 max-w-full text-base! input-base h-8 py-0 text-xs"
                        />
                      </div>
                    </div>

                    {mode === "VALUE" ? (
                      <div>
                        <label className="muted mb-1 block text-xs">Valor (R$)</label>
                        <div className="relative">
                          <span className="muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs">
                            R$
                          </span>
                          <input aria-label={`Valor da pessoa ${idx + 1}`}
                            type="text"
                            inputMode="decimal"
                            value={p.amount}
                            onChange={(e) => updatePerson(idx, { amount: e.target.value })}
                            placeholder="0,00"
                            className="min-h-12 min-w-0 max-w-full text-base! input-base tnum font-mono h-8 py-0 pl-8 text-xs"
                          />
                        </div>
                      </div>
                    ) : null}

                    {mode === "PERCENT" ? (
                      <div>
                        <label className="muted mb-1 block text-xs">Porcentagem (%)</label>
                        <div className="relative">
                          <input aria-label={`Percentual da pessoa ${idx + 1}`}
                            type="text"
                            inputMode="decimal"
                            value={p.percent}
                            onChange={(e) => updatePerson(idx, { percent: e.target.value })}
                            placeholder="Ex.: 50"
                            className="min-h-12 min-w-0 max-w-full text-base! input-base tnum font-mono h-8 py-0 pr-7 text-xs"
                          />
                          <span className="muted pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">
                            %
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {people.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remover pessoa ${idx + 1}`}
                      onClick={() => removePerson(idx)}
                      className="inline-flex items-center justify-center min-h-11 min-w-11 muted mt-5 cursor-pointer rounded-[var(--radius-xs)] p-1.5 transition-colors hover:bg-[var(--color-money-out-soft)] hover:text-[var(--text-out)]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Pré-visualização ao vivo */}
          <div className="rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
            <div className="mb-2 flex items-center justify-between border-b border-[var(--line)] pb-1.5">
              <span className="font-semibold text-[var(--text)]">Pré-visualização do rateio</span>
              <span className="tnum font-mono text-[var(--text-muted)]">
                Total: {formatCents(transaction.amountCents)}
              </span>
            </div>

            {preview.ok ? (
              <ul className="space-y-1.5">
                {myIncluded ? (
                  <li className="flex items-center justify-between py-0.5 font-medium text-[var(--text)]">
                    <span>Você (sua parte)</span>
                    <span className="tnum font-mono">{formatCents(preview.myShareCents)}</span>
                  </li>
                ) : null}
                {preview.amounts.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between py-0.5 text-[var(--text-muted)]"
                  >
                    <span className="truncate pr-2">
                      {item.name || `Pessoa ${i + 1}`}
                      {item.phone ? ` (${item.phone})` : ""}
                    </span>
                    <span className="tnum font-mono font-semibold text-[var(--text-in)]">
                      {formatCents(item.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--text-warn)] leading-relaxed">
                {preview.error}
              </p>
            )}
          </div>

          {actionError ? (
            <p className="rounded-[var(--radius-xs)] bg-[var(--color-money-out-soft)] px-3 py-2 text-xs text-[var(--text-out)]">
              {actionError}
            </p>
          ) : null}
        </div>

        {/* Rodapé com Ações */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--surface-2)] px-5 py-3">
          <div>
            {hasExistingSplits ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={handleClear}
                className="min-h-11 min-w-11 cursor-pointer text-[var(--text-out)] hover:bg-[var(--color-money-out-soft)] hover:text-[var(--text-out)]"
              >
                Remover divisão
              </Button>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onClose}
              className="min-h-11 min-w-11 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending || !isFormValid}
              onClick={handleSave}
              className="min-h-11 min-w-11 cursor-pointer"
            >
              {pending ? "Salvando..." : "Salvar divisão"}
            </Button>
          </div>
        </div>
    </Sheet>
  );
}
