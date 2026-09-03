"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import {
  commitImport,
  listCardInvoiceOptions,
  previewImport,
  type ImportKind,
  type InvoiceOption,
  type PreviewRow,
} from "@/server/actions/import";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Hint } from "@/components/ui/hint";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Account = { id: string; name: string; type: string };
type Category = { id: string; name: string; kind: "INCOME" | "EXPENSE"; nature: "FIXED" | "VARIABLE"; color: string };

const STATUS: Record<InvoiceOption["status"], { label: string; dot: string; badge: string }> = {
  aberta: {
    label: "aberta — ainda não fechou",
    dot: "#0ea5e9",
    badge: "bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-300",
  },
  fechada: {
    label: "fechada, não paga",
    dot: "#d97706",
    badge: "bg-amber-50 text-amber-800 dark:bg-amber-400/12 dark:text-amber-200",
  },
  vencida: {
    label: "vencida",
    dot: "#e11d48",
    badge: "bg-rose-50 text-rose-700 dark:bg-rose-500/12 dark:text-rose-300",
  },
  paga: {
    label: "paga",
    dot: "#059669",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300",
  },
  "sem-registro": {
    label: "sem registro de pagamento",
    dot: "#94a3b8",
    badge: "bg-[var(--surface-2)] text-[var(--text-muted)]",
  },
};

export function ImportWizard({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const [importKind, setImportKind] = useState<ImportKind>("GENERAL");
  const cardAccounts = useMemo(() => accounts.filter((a) => a.type === "CREDIT_CARD"), [accounts]);
  const accountsForKind = importKind === "CLOSED_INVOICE" ? cardAccounts : accounts;

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [invertSign, setInvertSign] = useState(false);
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [invoiceIndex, setInvoiceIndex] = useState<number | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceListError, setInvoiceListError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<string, string> | undefined>();
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
  const [existingInPeriod, setExistingInPeriod] = useState(0);
  const [replacePeriod, setReplacePeriod] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [replacedCount, setReplacedCount] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function selectKind(kind: ImportKind) {
    setImportKind(kind);
    setError(null);
    const pool = kind === "CLOSED_INVOICE" ? cardAccounts : accounts;
    if (!pool.some((a) => a.id === accountId)) setAccountId(pool[0]?.id ?? "");
  }

  // Carrega as faturas reais do cartão escolhido (com fechamento e vencimento)
  // em vez de deixar o usuário digitar um mês solto — evita confundir "a
  // fatura de setembro" (o mês que fecha) com o mês de vencimento que o
  // sistema usa internamente para identificar a fatura.
  useEffect(() => {
    if (importKind !== "CLOSED_INVOICE" || !accountId) {
      setInvoiceOptions([]);
      setInvoiceIndex(null);
      setInvoiceListError(null);
      return;
    }
    let cancelled = false;
    setLoadingInvoices(true);
    setInvoiceListError(null);
    listCardInvoiceOptions(accountId).then((result) => {
      if (cancelled) return;
      setLoadingInvoices(false);
      if ("error" in result) {
        setInvoiceListError(result.error);
        setInvoiceOptions([]);
        setInvoiceIndex(null);
        return;
      }
      setInvoiceOptions(result);
      // Prioriza a fatura mais recente já fechada e ainda não paga — é o
      // caso mais comum de quem está importando uma fatura para conferir. Se
      // não houver nenhuma fechada, cai para a mais antiga "aberta" (o ciclo
      // atual, o mais próximo de fechar) em vez da fatura mais distante no
      // futuro — as futuras existem pra quem quer escolhê-las, não pra virar
      // o padrão.
      const statuses = result.map((o) => o.status);
      const preferred: { status: InvoiceOption["status"]; fromEnd: boolean }[] = [
        { status: "fechada", fromEnd: true },
        { status: "vencida", fromEnd: true },
        { status: "sem-registro", fromEnd: true },
        { status: "aberta", fromEnd: false },
        { status: "paga", fromEnd: true },
      ];
      let bestIndex = result.length - 1;
      for (const { status, fromEnd } of preferred) {
        const idx = fromEnd ? statuses.lastIndexOf(status) : statuses.indexOf(status);
        if (idx !== -1) {
          bestIndex = idx;
          break;
        }
      }
      setInvoiceIndex(result.length ? bestIndex : null);
    });
    return () => {
      cancelled = true;
    };
  }, [importKind, accountId]);

  const selectedInvoice = invoiceIndex !== null ? (invoiceOptions[invoiceIndex] ?? null) : null;

  async function handleFile(file: File) {
    setError(null);
    setSavedCount(null);
    setReplacedCount(null);
    if (!accountId) {
      setError("Cadastre um cartão de crédito em Configurações antes de importar uma fatura.");
      return;
    }
    if (importKind === "CLOSED_INVOICE" && !selectedInvoice) {
      setError("Escolha a qual fatura este arquivo pertence.");
      return;
    }
    const content = await file.text();
    setFileName(file.name);

    start(async () => {
      const result = await previewImport({
        fileName: file.name,
        content,
        accountId,
        invertSign,
        importKind,
        invoiceRef: importKind === "CLOSED_INVOICE" ? selectedInvoice!.ref : undefined,
      });
      if (result.error) {
        setError(result.error);
        setRows(null);
        return;
      }
      setRows(result.rows ?? []);
      setWarnings(result.warnings ?? []);
      setColumns(result.detectedColumns);
      setPeriod(result.period ?? null);
      setExistingInPeriod(result.existingInPeriod ?? 0);
      setReplacePeriod(true);
    });
  }

  function toggleRow(index: number) {
    setRows((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, duplicate: !r.duplicate } : r)) : prev,
    );
  }

  function toggleTransfer(index: number) {
    setRows((prev) =>
      prev
        ? prev.map((r, i) =>
            i === index ? { ...r, isTransfer: !r.isTransfer, categoryId: r.isTransfer ? r.categoryId : null } : r,
          )
        : prev,
    );
  }

  function changeCategory(index: number, categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    setRows((prev) =>
      prev
        ? prev.map((r, i) =>
            i === index ? { ...r, categoryId: categoryId || null, nature: cat?.nature ?? r.nature } : r,
          )
        : prev,
    );
  }

  function confirm() {
    if (!rows || !fileName) return;
    start(async () => {
      const result = await commitImport({
        fileName,
        accountId,
        source: fileName.toLowerCase().endsWith(".ofx") ? "OFX" : "CSV",
        rows,
        importKind,
        invoiceRef: importKind === "CLOSED_INVOICE" ? selectedInvoice!.ref : undefined,
        replacePeriod: existingInPeriod > 0 ? replacePeriod : false,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedCount(result.saved ?? 0);
      setReplacedCount(result.replaced ?? 0);
      setRows(null);
      setFileName(null);
      setPeriod(null);
      setExistingInPeriod(0);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  const selected = rows?.filter((r) => !r.duplicate).length ?? 0;
  const ignored = (rows?.length ?? 0) - selected;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="1. Que tipo de arquivo é este?" />
        <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de importação">
          <KindOption
            active={importKind === "GENERAL"}
            onClick={() => selectKind("GENERAL")}
            title="Lançamentos gerais"
            description="Extrato ou export com um período de movimentações — de conta corrente ou de cartão. Cada linha tem a data real do movimento; parcela de cartão é detectada pelo texto (ex.: “2/12”) e reposicionada automaticamente para o mês certo."
          />
          <KindOption
            active={importKind === "CLOSED_INVOICE"}
            onClick={() => selectKind("CLOSED_INVOICE")}
            title="Fatura de mês fechado"
            description="O arquivo de UMA fatura específica do cartão (ex.: a de setembro). Toda linha pertence a essa fatura — mesmo quando a data impressa é a da compra original, meses atrás, no caso de parcelas."
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="2. Escolha a conta e o arquivo" />

        {importKind === "CLOSED_INVOICE" && !cardAccounts.length ? (
          <Hint tone="warn" className="mb-4">
            Você ainda não tem uma conta do tipo cartão de crédito cadastrada. Crie uma em
            Configurações para importar uma fatura fechada.
          </Hint>
        ) : null}

        <div className={cn("grid gap-4", importKind === "CLOSED_INVOICE" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <Field label={importKind === "CLOSED_INVOICE" ? "Cartão" : "Conta que vai receber os lançamentos"}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accountsForKind.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          {importKind === "CLOSED_INVOICE" ? (
            <Field
              label="Qual fatura"
              hint={
                !loadingInvoices && !invoiceListError && invoiceOptions.length
                  ? "Inclui as próximas faturas ainda em aberto — dá pra importar uma fatura futura, antes dela fechar."
                  : "Escolha pelo fechamento e vencimento, não só pelo nome do mês."
              }
            >
              {loadingInvoices ? (
                <div className="input-base flex h-[42px] items-center gap-2 text-[0.8125rem] opacity-60">
                  <Loader2 className="size-3.5 animate-spin" /> Carregando faturas...
                </div>
              ) : invoiceListError ? (
                <p className="text-[0.8125rem] text-rose-600">{invoiceListError}</p>
              ) : (
                <>
                  <Select
                    value={invoiceIndex ?? ""}
                    onChange={(e) => setInvoiceIndex(e.target.value === "" ? null : Number(e.target.value))}
                    disabled={!invoiceOptions.length}
                  >
                    {!invoiceOptions.length ? <option value="">Nenhuma fatura encontrada</option> : null}
                    {invoiceOptions.map((opt, i) => (
                      <option key={`${opt.ref.year}-${opt.ref.month}`} value={i} style={{ color: STATUS[opt.status].dot }}>
                        ● {STATUS[opt.status].label} — {opt.label} (fecha {formatDate(opt.closingDate)}, vence{" "}
                        {formatDate(opt.dueDate)})
                      </option>
                    ))}
                  </Select>
                  {selectedInvoice ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem]">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium",
                          STATUS[selectedInvoice.status].badge,
                        )}
                      >
                        {STATUS[selectedInvoice.status].label}
                      </span>
                      <span className="muted">
                        Fatura {selectedInvoice.label} · fecha {formatDate(selectedInvoice.closingDate)} · vence{" "}
                        {formatDate(selectedInvoice.dueDate)}
                      </span>
                    </div>
                  ) : null}
                </>
              )}
            </Field>
          ) : null}

          <Field label="Ajuste de sinal" hint="Use quando a prévia mostrar gastos como entradas.">
            <label className="flex h-[42px] cursor-pointer items-center gap-2.5 rounded-xl border bg-[var(--surface-2)] px-3.5">
              <input
                type="checkbox"
                checked={invertSign}
                onChange={(e) => setInvertSign(e.target.checked)}
                className="size-4 accent-[var(--color-brand-600)]"
              />
              <span className="text-[0.8125rem]">Inverter sinal dos valores</span>
            </label>
          </Field>
        </div>

        <label
          className={cn(
            "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors hover:bg-[var(--surface-2)]",
            (pending || !accountId || (importKind === "CLOSED_INVOICE" && !selectedInvoice)) &&
              "pointer-events-none opacity-60",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.ofx,.txt,text/csv"
            className="sr-only"
            disabled={!accountId || (importKind === "CLOSED_INVOICE" && !selectedInvoice)}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          {pending ? (
            <Loader2 className="mb-3 size-6 animate-spin opacity-60" />
          ) : (
            <FileUp className="mb-3 size-6 opacity-60" />
          )}
          <p className="text-[0.9375rem] font-medium">
            {fileName ?? "Clique para escolher o arquivo"}
          </p>
          <p className="muted mt-1 text-[0.8125rem]">Aceita CSV e OFX de extrato ou fatura</p>
        </label>
      </Card>

      {error ? <Hint tone="warn">{error}</Hint> : null}

      {savedCount !== null ? (
        <Card>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-6 text-emerald-600" />
            <div>
              <p className="text-[0.9375rem] font-semibold">
                {savedCount} lançamento(s) importado(s) com sucesso
              </p>
              <p className="muted text-[0.8125rem]">
                {replacedCount ? (
                  <>
                    {replacedCount} lançamento(s) de uma importação anterior desse período foram substituídos.{" "}
                  </>
                ) : null}
                Confira em Lançamentos — as categorias sugeridas podem ser trocadas a qualquer momento.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {rows ? (
        <Card>
          <CardHeader
            title="3. Confira antes de gravar"
            subtitle={`${selected} linha(s) serão importadas · ${ignored} ignorada(s). Desmarque o que não quiser trazer.`}
            action={
              <Button onClick={confirm} disabled={pending || selected === 0}>
                {pending ? "Importando..." : `Importar ${selected}`}
              </Button>
            }
          />

          {columns ? (
            <p className="muted mb-3 text-xs">
              Colunas detectadas — data: <strong>{columns.data}</strong> · descrição:{" "}
              <strong>{columns.descricao}</strong> · valor: <strong>{columns.valor}</strong>
            </p>
          ) : null}

          {warnings.map((w) => (
            <Hint
              key={w}
              tone={w.includes("não encaixaram") || w.includes("já existir") || w.includes("já cobrem esse período") ? "warn" : "info"}
              className="mb-3"
            >
              {w}
            </Hint>
          ))}

          {existingInPeriod > 0 && period ? (
            <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-xl border bg-[var(--surface-2)] px-3.5 py-3 text-[0.8125rem]">
              <input
                type="checkbox"
                checked={replacePeriod}
                onChange={(e) => setReplacePeriod(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-brand-600)]"
              />
              <span>
                <span className="block font-medium">
                  Substituir os {existingInPeriod} lançamento(s) já importado(s) entre {formatDate(period.start)} e{" "}
                  {formatDate(period.end)}
                </span>
                <span className="muted mt-0.5 block">
                  {replacePeriod
                    ? "Marcado: eles serão apagados e trocados pelos desta importação — o jeito certo de reimportar a mesma fatura ou o mesmo extrato."
                    : "Desmarcado: os antigos ficam como estão, e só o que for novo entra (nada de outra importação é tocado; lançamentos digitados à mão nunca são apagados de qualquer forma)."}
                </span>
              </span>
            </label>
          ) : null}

          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[800px] text-[0.8125rem]">
              <thead>
                <tr className="muted border-b text-left text-xs">
                  <th className="px-5 py-2 font-medium">Importar</th>
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Descrição</th>
                  <th className="py-2 font-medium">Categoria</th>
                  <th className="py-2 text-center font-medium">Transferência</th>
                  <th className="px-5 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, i) => (
                  <tr key={`${row.fingerprint}-${i}`} className={cn(row.duplicate && "opacity-45")}>
                    <td className="px-5 py-2.5">
                      <input
                        type="checkbox"
                        checked={!row.duplicate}
                        onChange={() => toggleRow(i)}
                        aria-label={`Importar ${row.description}`}
                        className="size-4 accent-[var(--color-brand-600)]"
                      />
                    </td>
                    <td className="tnum py-2.5 whitespace-nowrap">
                      {formatDate(row.date)}
                      {row.dateAdjusted ? (
                        <span
                          className={cn(
                            "mt-0.5 flex items-center gap-1 text-[0.6875rem] font-medium",
                            row.dateMatched
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-rose-700 dark:text-rose-300",
                          )}
                          title={
                            row.dateMatched
                              ? `Compra original em ${formatDate(row.originalDate!)} — reposicionada`
                              : `Não encaixou automaticamente na fatura escolhida — confira a data`
                          }
                        >
                          {!row.dateMatched ? <AlertTriangle className="size-3" /> : null}
                          era {formatDate(row.originalDate!)}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-64 py-2.5">
                      <span className="block truncate">{row.description}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {row.possibleDuplicate ? (
                          <span className="inline-block rounded-md bg-amber-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-amber-700 dark:bg-amber-500/12 dark:text-amber-300">
                            possível duplicata
                          </span>
                        ) : null}
                        {row.installmentNumber && row.installmentTotal ? (
                          <span className="inline-block rounded-md bg-brand-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-brand-700 dark:bg-brand-500/12 dark:text-brand-300">
                            parcela {row.installmentNumber}/{row.installmentTotal}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <select
                        disabled={row.isTransfer}
                        value={row.categoryId ?? ""}
                        onChange={(e) => changeCategory(i, e.target.value)}
                        className="cursor-pointer rounded-md border bg-[var(--surface-2)] px-1.5 py-1 text-xs disabled:opacity-50"
                      >
                        <option value="">Sem categoria</option>
                        {categories
                          .filter((c) => c.kind === row.kind)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleTransfer(i)}
                        title={
                          row.isTransfer
                            ? "É transferência (pagamento de fatura, entre contas suas etc.) — fora dos relatórios de receita/despesa, mas conta no saldo. Clique para desmarcar."
                            : "Marcar como transferência entre contas suas (ex.: pagamento de fatura) — fora dos relatórios, mas conta no saldo"
                        }
                        aria-pressed={row.isTransfer}
                        aria-label={`Marcar ${row.description} como transferência`}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[0.6875rem] font-medium transition-colors",
                          row.isTransfer
                            ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/12 dark:text-cyan-300"
                            : "muted hover:bg-[var(--surface-2)]",
                        )}
                      >
                        <ArrowLeftRight className="size-3.5" />
                      </button>
                    </td>
                    <td
                      className={cn(
                        "tnum px-5 py-2.5 text-right font-medium whitespace-nowrap",
                        row.kind === "INCOME"
                          ? "text-[var(--text-in)]"
                          : "text-[var(--text-out)]",
                      )}
                    >
                      {row.kind === "INCOME" ? "+" : "−"} {formatCents(row.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function KindOption({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-xl border p-3.5 text-left transition-colors",
        active
          ? "border-brand-500 bg-brand-50 dark:bg-brand-500/12"
          : "hover:bg-[var(--surface-2)]",
      )}
    >
      <p className={cn("text-[0.875rem] font-semibold", active && "text-brand-700 dark:text-brand-300")}>
        {title}
      </p>
      <p className="muted mt-1 text-[0.75rem] leading-relaxed">{description}</p>
    </button>
  );
}
