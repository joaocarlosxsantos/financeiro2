"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { MAX_CENTS, parseMoneyToCents } from "@/lib/money";
import { todayRef } from "@/lib/dates";
import { createTransfer } from "@/server/actions/transactions";
import { cn } from "@/lib/cn";
import type { PlainAccount } from "./types";

export function TransferDialog({
  isOpen,
  onClose,
  accounts,
  userId,
}: {
  isOpen: boolean;
  onClose: () => void;
  accounts: PlainAccount[];
  userId: string;
}) {
  if (!isOpen) return null;
  return (
    <TransferDialogContent
      onClose={onClose}
      accounts={accounts}
      userId={userId}
    />
  );
}

function TransferDialogContent({
  onClose,
  accounts,
  userId,
}: {
  onClose: () => void;
  accounts: PlainAccount[];
  userId: string;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();

  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(
    accounts.length > 1 ? accounts[1].id : accounts[0]?.id ?? "",
  );
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayRef());
  const [note, setNote] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  // Foco inicial e trap de foco acessível
  useEffect(() => {
    const panel = panelRef.current;
    panel?.querySelector<HTMLSelectElement>("select[data-autofocus]")?.focus();

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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setClientError(null);

    if (!fromAccountId || !toAccountId) {
      setClientError("Selecione as contas de origem e destino.");
      return;
    }

    if (fromAccountId === toAccountId) {
      setClientError("As contas de origem e destino devem ser diferentes.");
      return;
    }

    const amountCents = parseMoneyToCents(amount);
    if (!amountCents || amountCents <= 0) {
      setClientError("Informe um valor maior que zero.");
      return;
    }

    if (amountCents > MAX_CENTS) {
      setClientError("O valor ultrapassa o limite permitido.");
      return;
    }

    startTransition(async () => {
      const res = await createTransfer(
        userId,
        fromAccountId,
        toAccountId,
        amountCents,
        date,
        note.trim() || null,
      );

      if (res?.error) {
        setClientError(res.error);
        return;
      }

      onClose();
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Janela Modal — padrão 360px e tokens semânticos */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={cn(
          "relative z-10 w-full max-w-[360px] overflow-hidden rounded-[var(--radius-card)]",
          "border border-[var(--border)] bg-[var(--surface)] p-0 shadow-lg text-[var(--text)]",
        )}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 bg-[var(--surface-2)]/60">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-[var(--radius-xs)] bg-[var(--color-save-soft)] text-[var(--text-brand)]">
              <ArrowLeftRight className="size-4" />
            </span>
            <h2 id={titleId} className="text-sm font-semibold tracking-tight">
              Nova transferência
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="cursor-pointer rounded-[var(--radius-xs)] p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-3.5 p-4">
          <p id={descId} className="sr-only">
            Transfere valores entre contas do usuário mantendo os saldos ajustados.
          </p>

          <Field label="Conta de origem">
            <Select
              data-autofocus
              value={fromAccountId}
              onChange={(e) => {
                setFromAccountId(e.target.value);
                setClientError(null);
              }}
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Conta de destino">
            <Select
              value={toAccountId}
              onChange={(e) => {
                setToAccountId(e.target.value);
                setClientError(null);
              }}
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Valor (R$)">
              <Input
                name="amount"
                inputMode="decimal"
                required
                placeholder="0,00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setClientError(null);
                }}
              />
            </Field>

            <Field label="Data">
              <Input
                name="date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Observação (opcional)">
            <Input
              name="note"
              placeholder="Ex.: Reserva de emergência"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          {/* Erro inline acessível */}
          {clientError ? (
            <div
              role="alert"
              className="rounded-[var(--radius-input)] bg-[var(--color-money-out-soft)] px-3 py-2 text-xs font-medium text-[var(--text-out)] leading-snug"
            >
              {clientError}
            </div>
          ) : null}

          {/* Rodapé de Ações */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
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
              type="submit"
              size="sm"
              disabled={pending}
              className="cursor-pointer"
            >
              {pending ? "Transferindo..." : "Transferir"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
