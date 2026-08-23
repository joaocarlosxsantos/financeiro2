import Papa from "papaparse";
import { parseMoneyToCents } from "../money";
import { parseFlexibleDate } from "../dates";
import { normalize } from "../categorize";
import type { ParseResult, ParsedRow } from "./types";

const DATE_HEADERS = ["data", "date", "data lancamento", "data da compra", "data movimento", "dt"];
const DESC_HEADERS = ["descricao", "description", "historico", "lancamento", "estabelecimento", "titulo", "memo", "detalhe", "movimentacao"];
const AMOUNT_HEADERS = ["valor", "amount", "montante", "valor r", "quantia", "valor brl"];
const DEBIT_HEADERS = ["debito", "saida", "despesa", "pagamento"];
const CREDIT_HEADERS = ["credito", "entrada", "receita", "deposito"];
const TYPE_HEADERS = ["tipo", "type", "d c", "natureza"];

/**
 * Alguns exports usam vírgula como separador de colunas E como separador
 * decimal, sem aspas: "01/08/2026,IFOOD,-64,90" vira 4 campos para 3 colunas.
 * Quando o valor é a última coluna e sobrou um pedaço de 1-2 dígitos,
 * remontamos os centavos em vez de perder R$ 0,90.
 */
function repairDecimals(
  raw: Record<string, string> & { __parsed_extra?: string[] },
  amountCol: string,
  headers: string[],
): string {
  const value = (raw[amountCol] ?? "").trim();
  const extra = raw.__parsed_extra;
  const isLastColumn = headers[headers.length - 1] === amountCol;

  if (!isLastColumn || !extra?.length) return value;
  if (/[.,]/.test(value)) return value;
  if (!/^-?\s*R?\$?\s*\d+$/.test(value)) return value;
  if (!/^\d{1,2}$/.test(extra[0]?.trim() ?? "")) return value;

  return `${value},${extra[0].trim()}`;
}

function findHeader(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map((h) => normalize(h));
  for (const c of candidates) {
    const i = normalized.findIndex((h) => h === c);
    if (i > -1) return headers[i];
  }
  for (const c of candidates) {
    const i = normalized.findIndex((h) => h.includes(c));
    if (i > -1) return headers[i];
  }
  return null;
}

/**
 * Lê CSV de extrato bancário ou fatura de cartão.
 * Detecta as colunas por nome — funciona com os exports mais comuns
 * (Nubank, Inter, Itaú, Bradesco, Santander, C6) sem configuração.
 */
export function parseCsv(content: string, opts?: { invertSign?: boolean }): ParseResult {
  const warnings: string[] = [];
  const cleaned = content.replace(/^\uFEFF/, "").trim();

  const parsed = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter: "",
    transformHeader: (h) => h.trim(),
  });

  if (!parsed.data.length) {
    return { rows: [], warnings: ["Não encontramos nenhuma linha de dados no arquivo."] };
  }

  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const dateCol = findHeader(headers, DATE_HEADERS);
  const descCol = findHeader(headers, DESC_HEADERS);
  const amountCol = findHeader(headers, AMOUNT_HEADERS);
  const debitCol = findHeader(headers, DEBIT_HEADERS);
  const creditCol = findHeader(headers, CREDIT_HEADERS);
  const typeCol = findHeader(headers, TYPE_HEADERS);

  if (!dateCol) warnings.push("Não identificamos a coluna de data. Renomeie a coluna para \"Data\".");
  if (!amountCol && !debitCol && !creditCol) {
    warnings.push("Não identificamos a coluna de valor. Renomeie a coluna para \"Valor\".");
  }
  if (!dateCol || (!amountCol && !debitCol && !creditCol)) {
    return { rows: [], warnings };
  }

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const raw of parsed.data) {
    const dateRaw = (raw[dateCol] ?? "").trim();
    const date = parseFlexibleDate(dateRaw);
    if (!date) {
      skipped++;
      continue;
    }

    let cents = 0;
    if (amountCol) {
      cents = parseMoneyToCents(repairDecimals(raw, amountCol, headers));
      if (typeCol) {
        const t = normalize(raw[typeCol] ?? "");
        if (t.startsWith("d") || t.includes("debito") || t.includes("saida")) cents = -Math.abs(cents);
        if (t.startsWith("c") || t.includes("credito") || t.includes("entrada")) cents = Math.abs(cents);
      }
    } else {
      const debit = debitCol ? Math.abs(parseMoneyToCents(raw[debitCol] ?? "")) : 0;
      const credit = creditCol ? Math.abs(parseMoneyToCents(raw[creditCol] ?? "")) : 0;
      cents = credit - debit;
    }

    if (cents === 0) {
      skipped++;
      continue;
    }
    if (opts?.invertSign) cents = -cents;

    const description =
      (descCol ? raw[descCol] : "")?.trim() ||
      headers
        .filter((h) => h !== dateCol && h !== amountCol)
        .map((h) => raw[h])
        .find((v) => v && v.trim().length > 2) ||
      "Lançamento importado";

    rows.push({
      date: date.toISOString().slice(0, 10),
      description: description.slice(0, 180),
      amountCents: cents,
    });
  }

  if (skipped > 0) {
    warnings.push(`${skipped} linha(s) foram ignoradas por não ter data ou valor válidos.`);
  }

  return {
    rows,
    warnings,
    detectedColumns: {
      data: dateCol ?? "—",
      descricao: descCol ?? "—",
      valor: amountCol ?? `${debitCol ?? "—"} / ${creditCol ?? "—"}`,
    },
  };
}
