import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireUserId } from "@/lib/auth";
import { getTransactions } from "@/server/queries";
import { monthRefFromParam, monthRefToParam, currentMonthRef } from "@/lib/dates";
import { buildExportRows, rowsToCsv } from "@/lib/export";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Exporta os lançamentos como CSV ou XLSX, respeitando os mesmos filtros da
 * tela de Lançamentos (mês OU período customizado, categoria, tipo,
 * natureza, conta, busca) — o link "Exportar" manda exatamente a URL atual
 * da tela mais &format=..., então o que a pessoa está vendo é o que sai no
 * arquivo.
 */
export async function GET(request: NextRequest) {
  const userId = await requireUserId();
  const sp = request.nextUrl.searchParams;

  const format = sp.get("format") === "xlsx" ? "xlsx" : "csv";
  const ref = monthRefFromParam(sp.get("m"));
  const from = sp.get("from");
  const to = sp.get("to");
  const customRange =
    from && to && ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to ? { from, to } : null;

  const cat = sp.get("cat");
  const kind = sp.get("kind");
  const nature = sp.get("nature");
  const acc = sp.get("acc");
  const q = sp.get("q");

  const transactions = await getTransactions(
    userId,
    {
      ref: customRange ? undefined : ref,
      dateFrom: customRange?.from,
      dateTo: customRange?.to,
      categoryId: cat && cat !== "NONE" ? cat : undefined,
      uncategorized: cat === "NONE",
      accountKind: acc === "CARD" || acc === "OTHER" ? acc : undefined,
      kind: kind === "INCOME" || kind === "EXPENSE" ? kind : undefined,
      nature: nature === "FIXED" || nature === "VARIABLE" ? nature : undefined,
      search: q || undefined,
    },
    5000,
  );

  const rows = buildExportRows(
    transactions.map((t) => ({
      date: t.date,
      description: t.description,
      categoryName: t.categoryName,
      kind: t.kind as "INCOME" | "EXPENSE",
      nature: t.nature as "FIXED" | "VARIABLE",
      accountName: t.accountName,
      amountCents: t.amountCents,
      isTransfer: t.isTransfer,
      installmentNumber: t.installmentNumber,
      installmentTotal: t.installmentTotal,
      recurringRuleId: t.recurringRuleId,
      notes: t.notes,
    })),
  );

  const label = customRange ? `${customRange.from}_a_${customRange.to}` : monthRefToParam(ref || currentMonthRef());
  const filename = `lancamentos-${label}.${format}`;

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Lançamentos");
    if (rows.length) {
      sheet.columns = Object.keys(rows[0]).map((key) => ({
        header: key,
        key,
        width: key === "Descrição" ? 32 : key === "Observação" ? 28 : 16,
      }));
      sheet.addRows(rows);
      sheet.getColumn("Valor (R$)").numFmt = "#,##0.00";
      sheet.getRow(1).font = { bold: true };
    } else {
      sheet.addRow(["Nenhum lançamento neste período."]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return new Response(rowsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
