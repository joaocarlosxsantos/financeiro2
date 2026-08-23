"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { commitImport, previewImport, type PreviewRow } from "@/server/actions/import";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Hint } from "@/components/ui/hint";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Account = { id: string; name: string; type: string };
type Category = { id: string; name: string; kind: "INCOME" | "EXPENSE"; nature: "FIXED" | "VARIABLE"; color: string };

export function ImportWizard({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [invertSign, setInvertSign] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<string, string> | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setSavedCount(null);
    const content = await file.text();
    setFileName(file.name);

    start(async () => {
      const result = await previewImport({ fileName: file.name, content, accountId, invertSign });
      if (result.error) {
        setError(result.error);
        setRows(null);
        return;
      }
      setRows(result.rows ?? []);
      setWarnings(result.warnings ?? []);
      setColumns(result.detectedColumns);
    });
  }

  function toggleRow(index: number) {
    setRows((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, duplicate: !r.duplicate } : r)) : prev,
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
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedCount(result.saved ?? 0);
      setRows(null);
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  const selected = rows?.filter((r) => !r.duplicate).length ?? 0;
  const ignored = (rows?.length ?? 0) - selected;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="1. Escolha a conta e o arquivo" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conta que vai receber os lançamentos">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
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
            pending && "pointer-events-none opacity-60",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.ofx,.txt,text/csv"
            className="sr-only"
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

          {warnings.map((w) => (
            <Hint key={w} tone="info" className="mb-3">
              {w}
            </Hint>
          ))}

          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[0.8125rem]">
              <thead>
                <tr className="muted border-b text-left text-xs">
                  <th className="px-5 py-2 font-medium">Importar</th>
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Descrição</th>
                  <th className="py-2 font-medium">Categoria</th>
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
                    <td className="tnum py-2.5 whitespace-nowrap">{formatDate(row.date)}</td>
                    <td className="max-w-64 truncate py-2.5">{row.description}</td>
                    <td className="py-2.5">
                      <select
                        value={row.categoryId ?? ""}
                        onChange={(e) => changeCategory(i, e.target.value)}
                        className="cursor-pointer rounded-md border bg-[var(--surface-2)] px-1.5 py-1 text-xs"
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
                    <td
                      className={cn(
                        "tnum px-5 py-2.5 text-right font-medium whitespace-nowrap",
                        row.kind === "INCOME"
                          ? "text-[var(--color-money-in)]"
                          : "text-[var(--color-money-out)]",
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
