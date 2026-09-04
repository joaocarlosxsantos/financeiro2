import { formatDate } from "./dates";

export type ExportTransactionInput = {
  date: Date;
  description: string;
  categoryName: string | null;
  kind: "INCOME" | "EXPENSE";
  nature: "FIXED" | "VARIABLE";
  accountName: string;
  amountCents: number;
  isTransfer: boolean;
  installmentNumber: number | null;
  installmentTotal: number | null;
  recurringRuleId: string | null;
  notes: string | null;
};

export type ExportRow = {
  Data: string;
  Descrição: string;
  Categoria: string;
  Tipo: string;
  Natureza: string;
  Conta: string;
  "Valor (R$)": number;
  Parcela: string;
  Recorrente: string;
  Transferência: string;
  Observação: string;
};

/**
 * Uma linha por lançamento, pronta para virar CSV, XLSX ou qualquer outra
 * tabela — nada aqui sabe o formato final, só a forma dos dados. O valor sai
 * como número (reais, não centavos) com sinal — positivo entrada, negativo
 * saída — porque é isso que faz uma planilha somar direto, sem gambiarra.
 */
export function buildExportRows(transactions: ExportTransactionInput[]): ExportRow[] {
  return transactions.map((t) => ({
    Data: formatDate(t.date),
    Descrição: t.description,
    Categoria: t.categoryName ?? "Sem categoria",
    Tipo: t.kind === "INCOME" ? "Entrada" : "Saída",
    Natureza: t.nature === "FIXED" ? "Fixo" : "Variável",
    Conta: t.accountName,
    "Valor (R$)": Number(((t.kind === "INCOME" ? t.amountCents : -t.amountCents) / 100).toFixed(2)),
    Parcela: t.installmentNumber && t.installmentTotal ? `${t.installmentNumber}/${t.installmentTotal}` : "",
    Recorrente: t.recurringRuleId ? "Sim" : "Não",
    Transferência: t.isTransfer ? "Sim" : "Não",
    Observação: t.notes ?? "",
  }));
}

const CSV_HEADERS: (keyof ExportRow)[] = [
  "Data",
  "Descrição",
  "Categoria",
  "Tipo",
  "Natureza",
  "Conta",
  "Valor (R$)",
  "Parcela",
  "Recorrente",
  "Transferência",
  "Observação",
];

/** Escapa um campo para CSV: aspas duplas quando tem vírgula, aspas ou quebra de linha. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV com separador ";" — é o que o Excel em português abre corretamente
 * sem passar por um assistente de importação (o separador "," entra tudo
 * numa coluna só quando o Windows está configurado em pt-BR).
 */
export function rowsToCsv(rows: ExportRow[]): string {
  const lines = [CSV_HEADERS.join(";")];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((h) => csvField(row[h])).join(";"));
  }
  // BOM UTF-8 — sem isso o Excel no Windows abre acento como caractere quebrado.
  return "﻿" + lines.join("\r\n");
}
