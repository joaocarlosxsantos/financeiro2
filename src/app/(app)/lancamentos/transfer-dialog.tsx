"use client";

import { useId, useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { MAX_CENTS, parseMoneyToCents } from "@/lib/money";
import { todayRef } from "@/lib/dates";
import { createTransfer } from "@/server/actions/transactions";
import type { PlainAccount } from "./types";

export function TransferDialog({
  isOpen,
  onClose,
  accounts,
}: {
  isOpen: boolean;
  onClose: () => void;
  accounts: PlainAccount[];
}) {
  if (!isOpen) return null;
  return (
    <TransferDialogContent
      onClose={onClose}
      accounts={accounts}
    />
  );
}

function TransferDialogContent({
  onClose,
  accounts,
}: {
  onClose: () => void;
  accounts: PlainAccount[];
}) {
  const descId = useId();
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

  return (
    <Sheet title="Nova transferência" onClose={onClose} describedBy={descId}>
        <form onSubmit={handleSubmit} className="space-y-3.5 p-4">
          <p id={descId} className="sr-only">
            Transfere valores entre contas do usuário mantendo os saldos ajustados.
          </p>

          <Field label="Conta de origem">
            <Select className="min-h-12 min-w-0 max-w-full text-base!"
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
            <Select className="min-h-12 min-w-0 max-w-full text-base!"
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

          <div className="grid min-w-0 grid-cols-1 items-start gap-2.5 min-[480px]:grid-cols-2">
            <Field label="Valor (R$)">
              <Input className="min-h-12 min-w-0 max-w-full text-base!"
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
              <Input className="min-h-12 min-w-0 max-w-full text-base!"
                name="date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Observação (opcional)">
            <Input className="min-h-12 min-w-0 max-w-full text-base!"
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
              className="min-h-11 min-w-11 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending}
              className="min-h-11 min-w-11 cursor-pointer"
            >
              {pending ? "Transferindo..." : "Transferir"}
            </Button>
          </div>
        </form>
    </Sheet>
  );
}
