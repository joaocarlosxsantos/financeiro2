"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { payInvoice, unpayInvoice } from "@/server/actions/invoices";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { formatCents, formatCentsPlain } from "@/lib/money";
import { formatDate, formatDayMonth } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Item = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  categoryName: string | null;
  categoryColor: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
};

type Invoice = {
  label: string;
  dueYear: number;
  dueMonth: number;
  periodStart: string;
  closingDate: string;
  dueDate: string;
  totalCents: number;
  status: "aberta" | "fechada" | "paga" | "vencida" | "sem-registro";
  paidAmountCents: number | null;
  paidAt: string | null;
  items: Item[];
};

const STATUS: Record<Invoice["status"], { label: string; className: string }> = {
  aberta: {
    label: "aberta",
    className: "bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-300",
  },
  fechada: {
    label: "fechada — a pagar",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-400/12 dark:text-amber-200",
  },
  vencida: {
    label: "vencida",
    className: "bg-rose-50 text-rose-700 dark:bg-rose-500/12 dark:text-rose-300",
  },
  paga: {
    label: "paga",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300",
  },
  "sem-registro": {
    label: "sem registro de pagamento",
    className: "bg-[var(--surface-2)] text-[var(--text-muted)]",
  },
};

export function InvoiceCard({
  cardId,
  cardColor,
  invoice,
  sources,
  defaultOpen,
}: {
  cardId: string;
  cardColor: string;
  invoice: Invoice;
  sources: { id: string; name: string }[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [paying, setPaying] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const status = STATUS[invoice.status];
  const diff =
    invoice.paidAmountCents !== null ? invoice.paidAmountCents - invoice.totalCents : 0;

  return (
    <Card className={cn("p-0", pending && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: cardColor }} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[0.9375rem] font-semibold tracking-tight">
                Fatura {invoice.label}
              </h2>
              <span
                className={cn("rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium", status.className)}
              >
                {status.label}
              </span>
            </div>
            <p className="muted mt-1 text-xs">
              {formatDayMonth(invoice.periodStart)} a {formatDayMonth(invoice.closingDate)} · vence{" "}
              {formatDate(invoice.dueDate)} · {invoice.items.length} compra(s)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="tnum text-lg font-semibold">{formatCents(invoice.totalCents)}</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Recolher compras" : "Ver compras"}
            className="muted cursor-pointer rounded-lg p-1.5 hover:bg-[var(--surface-2)]"
          >
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      {invoice.status === "paga" && invoice.paidAt ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t bg-[var(--surface-2)] px-5 py-2.5 text-[0.8125rem]">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span>
            Paga em {formatDate(invoice.paidAt)} — {formatCents(invoice.paidAmountCents ?? 0)}
          </span>
          {diff !== 0 ? (
            <span className="muted text-xs">
              ({diff > 0 ? "pagou a mais " : "faltou "}
              {formatCents(Math.abs(diff))} em relação ao total)
            </span>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await unpayInvoice(cardId, invoice.dueYear, invoice.dueMonth);
              })
            }
            className="muted ml-auto cursor-pointer text-xs font-medium hover:underline"
          >
            desfazer
          </button>
        </div>
      ) : null}

      {open ? (
        <ul className="divide-y border-t">
          {invoice.items.length ? (
            invoice.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-2.5 text-[0.8125rem]">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: item.categoryColor ?? "#94a3b8" }}
                />
                <span className="muted tnum w-14 shrink-0 text-xs">
                  {formatDayMonth(item.date)}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.description}</span>
                {item.installmentNumber && item.installmentTotal ? (
                  <span className="muted shrink-0 rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.6875rem]">
                    {item.installmentNumber}/{item.installmentTotal}
                  </span>
                ) : null}
                <span className="muted hidden shrink-0 text-xs sm:block">
                  {item.categoryName ?? "sem categoria"}
                </span>
                <span className="tnum shrink-0 font-medium">{formatCents(item.amountCents)}</span>
              </li>
            ))
          ) : (
            <li className="muted px-5 py-6 text-center text-[0.8125rem]">
              Nenhuma compra neste ciclo.
            </li>
          )}
        </ul>
      ) : null}

      {invoice.status !== "paga" && invoice.totalCents > 0 ? (
        <div className="border-t px-5 py-4">
          {paying ? (
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              action={(formData) => {
                setError(null);
                start(async () => {
                  const result = await payInvoice({
                    accountId: cardId,
                    dueYear: invoice.dueYear,
                    dueMonth: invoice.dueMonth,
                    amount: String(formData.get("amount") ?? ""),
                    paidFromAccountId: String(formData.get("paidFromAccountId") ?? "") || null,
                    paidAt: String(formData.get("paidAt") ?? "") || null,
                  });
                  if (result.error) setError(result.error);
                  else setPaying(false);
                });
              }}
            >
              <Field label="Valor pago">
                <Input
                  name="amount"
                  inputMode="decimal"
                  required
                  defaultValue={formatCentsPlain(invoice.totalCents)}
                />
              </Field>
              <Field label="Pago em">
                <Input name="paidAt" type="date" defaultValue={invoice.dueDate.slice(0, 10)} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Salvando..." : "Confirmar"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setPaying(false)}>
                  Cancelar
                </Button>
              </div>

              {sources.length ? (
                <div className="sm:col-span-3">
                  <Field label="Saiu de qual conta (opcional)">
                    <Select name="paidFromAccountId" defaultValue="">
                      <option value="">Não informar</option>
                      {sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : null}

              {error ? (
                <p className="text-[0.8125rem] text-rose-600 sm:col-span-3">{error}</p>
              ) : null}

              <p className="muted text-xs leading-relaxed sm:col-span-3">
                Registrar o pagamento não cria um lançamento de despesa — as compras já entraram
                como gasto na data em que foram feitas.
              </p>
            </form>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setPaying(true)}>
              Registrar pagamento
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
