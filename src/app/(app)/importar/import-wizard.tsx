"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowLeftRight, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { commitImport, previewImport, type PreviewRow } from "@/server/actions/import";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Hint } from "@/components/ui/hint";
import { formatCents } from "@/lib/money";
import { formatDate, monthLabel, monthRefFromParam } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Account = { id: string; name: string; type: string };
type Category = { id: string; name: string; kind: "INCOME" | "EXPENSE"; nature: "FIXED" | "VARIABLE"; color: string };

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ImportWizard({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [invertSign, setInvertSign] = useState(false);
  const [invoiceMonth, setInvoiceMonth] = useState(currentMonthValue);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<string, string> | undefined>();
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
  const [existingInPeriod, setExistingInPeriod] = useState(0);
  const [replacePeriod, setReplacePeriod] = useState(true);
  const [suggestInvertSign, setSuggestInvertSign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [replacedCount, setReplacedCount] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const isCard = accounts.find((a) => a.id === accountId)?.type === "CREDIT_CARD";

  async function runPreview(name: string, content: string, nextInvertSign: boolean) {
    setError(null);
    setSavedCount(null);
    setReplacedCount(null);
    setFileName(name);
    setFileContent(content);

    start(async () => {
      const result = await previewImport({
        fileName: name,
        content,
        accountId,
        invertSign: nextInvertSign,
        invoiceMonth: isCard ? invoiceMonth : undefined,
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
      setSuggestInvertSign(result.suggestInvertSign ?? false);
    });
  }

  async function handleFile(file: File) {
    if (!accountId) {
      setError("Cadastre uma conta em Configurações antes de importar um extrato.");
      return;
    }
    if (isCard && !invoiceMonth) {
      setError("Escolha o mês de referência da fatura antes de importar.");
      return;
    }
    const content = await file.text();
    await runPreview(file.name, content, invertSign);
  }

  /** Aplica a sugestão de "inverter sinal" e atualiza a prévia com o mesmo arquivo, sem pedir pra escolher de novo. */
  function acceptInvertSignSuggestion() {
    if (!fileName || !fileContent) return;
    setInvertSign(true);
    void runPreview(fileName, fileContent, true);
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
        invoiceMonth: isCard ? invoiceMonth : undefined,
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
      setFileContent(null);
      setPeriod(null);
      setExistingInPeriod(0);
      setSuggestInvertSign(false);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  const selected = rows?.filter((r) => !r.duplicate).length ?? 0;
  const ignored = (rows?.length ?? 0) - selected;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="1. Escolha a conta e o arquivo" />

        <div className={cn("grid grid-cols-1 gap-4", isCard ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <Field label="Conta que vai receber os lançamentos">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          {isCard ? (
            <Field
              label="Mês de referência da fatura"
              hint="Parcela vai para esse mês (dia original preservado). Compra à vista mantém a data real de compra do arquivo."
            >
              <input
                type="month"
                value={invoiceMonth}
                onChange={(e) => setInvoiceMonth(e.target.value)}
                className="input-base h-[42px]"
              />
            </Field>
          ) : null}

          <Field label="Ajuste de sinal" hint="Use quando a prévia mostrar gastos como entradas.">
            <label className="flex h-[42px] cursor-pointer items-center gap-2.5 rounded-xl border bg-[var(--surface-2)] px-3.5">
              <input
                type="checkbox"
                checked={invertSign}
                onChange={(e) => {
                  const next = e.target.checked;
                  setInvertSign(next);
                  // Já tem arquivo carregado: atualiza a prévia na hora em
                  // vez de deixar os valores errados até escolher de novo.
                  if (fileName && fileContent) void runPreview(fileName, fileContent, next);
                }}
                className="size-4 accent-[var(--color-brand-600)]"
              />
              <span className="text-[0.8125rem]">Inverter sinal dos valores</span>
            </label>
          </Field>
        </div>

        <label
          className={cn(
            "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors hover:bg-[var(--surface-2)]",
            (pending || !accountId || (isCard && !invoiceMonth)) && "pointer-events-none opacity-60",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.ofx,.txt,text/csv"
            className="sr-only"
            disabled={!accountId || (isCard && !invoiceMonth)}
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
          <p className="muted mt-1 text-[0.8125rem]">
            {isCard
              ? `Parcela (ex.: "2/12") vai para ${monthLabel(monthRefFromParam(invoiceMonth))}, dia original preservado. Compra à vista entra com a data real de compra do arquivo, mesmo fora desse mês.`
              : "Aceita CSV e OFX de extrato bancário — cada linha entra com a própria data do arquivo."}
          </p>
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
            title="2. Confira antes de gravar"
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

          {suggestInvertSign ? (
            <Hint tone="tip" title="Os valores parecem estar ao contrário" className="mb-3">
              <p className="mb-2">
                A maioria das linhas dessa fatura virou entrada — é bem comum o cartão exportar os
                gastos como valor positivo. Marcar &quot;inverter sinal&quot; deve corrigir.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={acceptInvertSignSuggestion}>
                Marcar &quot;inverter sinal&quot; e atualizar prévia
              </Button>
            </Hint>
          ) : null}

          {warnings.map((w) => (
            <Hint
              key={w}
              tone={
                w.includes("já existir") || w.includes("já cobrem esse período") || w.includes("já fazem parte dessa fatura")
                  ? "warn"
                  : "info"
              }
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
                  {isCard
                    ? `Substituir os ${existingInPeriod} lançamento(s) já importado(s) antes para essa fatura (${monthLabel(monthRefFromParam(invoiceMonth))})`
                    : `Substituir os ${existingInPeriod} lançamento(s) já importado(s) entre ${formatDate(period.start)} e ${formatDate(period.end)}`}
                </span>
                <span className="muted mt-0.5 block">
                  {replacePeriod
                    ? "Marcado: eles serão apagados e trocados pelos desta importação — o jeito certo de reimportar o mesmo extrato."
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
                          className="mt-0.5 flex items-center gap-1 text-[0.6875rem] font-medium text-amber-700 dark:text-amber-300"
                          title={`Compra realizada em ${formatDate(row.originalDate!)} — gravada na fatura do mês escolhido`}
                        >
                          compra realizada em {formatDate(row.originalDate!)}
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
