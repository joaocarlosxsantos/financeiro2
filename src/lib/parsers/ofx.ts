import { parseFlexibleDate } from "../dates";
import type { ParseResult, ParsedRow } from "./types";

const TX_BLOCK = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : null;
}

/**
 * Lê OFX (padrão de extrato dos bancos brasileiros), tanto SGML quanto XML.
 * Só precisamos de DTPOSTED, TRNAMT e MEMO/NAME.
 */
export function parseOfx(content: string, opts?: { invertSign?: boolean }): ParseResult {
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  let skipped = 0;

  const blocks = content.matchAll(TX_BLOCK);
  for (const [, block] of blocks) {
    const dtRaw = tag(block, "DTPOSTED");
    const amtRaw = tag(block, "TRNAMT");
    const memo = tag(block, "MEMO") ?? tag(block, "NAME") ?? "Lançamento importado";

    if (!dtRaw || !amtRaw) {
      skipped++;
      continue;
    }

    const date = parseFlexibleDate(dtRaw.slice(0, 8));
    const value = Number.parseFloat(amtRaw.replace(",", "."));
    if (!date || Number.isNaN(value) || value === 0) {
      skipped++;
      continue;
    }

    let cents = Math.round(value * 100);
    if (opts?.invertSign) cents = -cents;

    rows.push({
      date: date.toISOString().slice(0, 10),
      description: memo.slice(0, 180),
      amountCents: cents,
    });
  }

  if (!rows.length) {
    warnings.push("Nenhuma transação <STMTTRN> encontrada. Confirme que o arquivo é um OFX de extrato.");
  } else if (skipped > 0) {
    warnings.push(`${skipped} transação(ões) ignorada(s) por falta de data ou valor.`);
  }

  return { rows, warnings };
}
