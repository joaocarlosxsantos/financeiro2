"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Users, X } from "lucide-react";
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
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    const panel = panelRef.current;
    panel?.querySelector<HTMLInputElement>("input[data-autofocus]")?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

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
          phone?: string | null;
          amount?: number;
          percent?: number;
        } = {
          name: p.name.trim(),
          phone: p.phone.trim() || null,
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Painel do Modal */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)] shadow-[var(--shadow-overlay)]"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--color-save-soft)] text-[var(--text-brand)]">
              <Users className="size-4" />
            </span>
            <div>
              <h2 id={titleId} className="text-sm font-semibold text-[var(--text)]">
                Dividir despesa
              </h2>
              <p className="muted mt-0.5 truncate text-xs" title={transaction.description}>
                {transaction.description} ·{" "}
                <span className="tnum font-mono font-medium text-[var(--text)]">
                  {formatCents(transaction.amountCents)}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="muted cursor-pointer rounded-[var(--radius-xs)] p-1.5 transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Corpo com scroll */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Modo de divisão */}
          <div>
            <label className="muted mb-1.5 block text-xs font-semibold uppercase tracking-wider">
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
                  className={cn(
                    "cursor-pointer rounded-[var(--radius-xs)] py-1.5 font-medium transition-colors",
                    mode === m.key
                      ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Eu participo */}
          <label className="flex cursor-pointer select-none items-center gap-2.5 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs text-[var(--text)]">
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
              <label className="muted text-xs font-semibold uppercase tracking-wider">
                Outras pessoas ({people.length})
              </label>
              {people.length < 20 ? (
                <button
                  type="button"
                  onClick={addPerson}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--text-brand)] hover:underline"
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
                        <label className="muted mb-1 block text-[0.6875rem]">Nome</label>
                        <input
                          type="text"
                          required
                          data-autofocus={idx === 0 ? "" : undefined}
                          value={p.name}
                          onChange={(e) => updatePerson(idx, { name: e.target.value })}
                          placeholder="Ex.: Mariana"
                          className="input-base h-8 py-0 text-xs"
                        />
                      </div>
                      <div>
                        <label className="muted mb-1 block text-[0.6875rem]">
                          Telefone / WhatsApp (opcional)
                        </label>
                        <input
                          type="tel"
                          value={p.phone}
                          onChange={(e) => updatePerson(idx, { phone: e.target.value })}
                          placeholder="(11) 99999-9999"
                          className="input-base h-8 py-0 text-xs"
                        />
                      </div>
                    </div>

                    {mode === "VALUE" ? (
                      <div>
                        <label className="muted mb-1 block text-[0.6875rem]">Valor (R$)</label>
                        <div className="relative">
                          <span className="muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs">
                            R$
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={p.amount}
                            onChange={(e) => updatePerson(idx, { amount: e.target.value })}
                            placeholder="0,00"
                            className="input-base tnum font-mono h-8 py-0 pl-8 text-xs"
                          />
                        </div>
                      </div>
                    ) : null}

                    {mode === "PERCENT" ? (
                      <div>
                        <label className="muted mb-1 block text-[0.6875rem]">Porcentagem (%)</label>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={p.percent}
                            onChange={(e) => updatePerson(idx, { percent: e.target.value })}
                            placeholder="Ex.: 50"
                            className="input-base tnum font-mono h-8 py-0 pr-7 text-xs"
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
                      className="muted mt-5 cursor-pointer rounded-[var(--radius-xs)] p-1.5 transition-colors hover:bg-[var(--color-money-out-soft)] hover:text-[var(--text-out)]"
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--surface-2)]/50 px-5 py-3">
          <div>
            {hasExistingSplits ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={handleClear}
                className="cursor-pointer text-[var(--text-out)] hover:bg-[var(--color-money-out-soft)] hover:text-[var(--text-out)]"
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
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending || !isFormValid}
              onClick={handleSave}
              className="cursor-pointer"
            >
              {pending ? "Salvando..." : "Salvar divisão"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
