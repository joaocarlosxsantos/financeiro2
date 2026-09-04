import { NextRequest } from "next/server";
import PDFDocument from "pdfkit";
import { requireUserId } from "@/lib/auth";
import {
  getAvgMonthlyCostCents,
  getBudgetOverview,
  getCategoryBreakdown,
  getDebtOverview,
  getEmergencyFundSavedCents,
  getMonthSummary,
  getUser,
} from "@/server/queries";
import { monthRefFromParam, monthRefToParam, monthLabel } from "@/lib/dates";
import { formatCents, pct } from "@/lib/money";
import { balanceCents, emergencyTargetCents, monthsOfRunway, savingsRate } from "@/lib/finance";

export const runtime = "nodejs";

const PAGE_MARGIN = 50;
const COL_X = [PAGE_MARGIN, 300, 400, 480];

/** Relatório mensal em PDF — o retrato do mês pra imprimir, guardar ou mandar pra quem precisar. */
export async function GET(request: NextRequest) {
  const userId = await requireUserId();
  const ref = monthRefFromParam(request.nextUrl.searchParams.get("m"));

  const [user, summary, breakdown, avgCost, budget, emergencySaved, debts] = await Promise.all([
    getUser(userId),
    getMonthSummary(userId, ref, { cardMode: "cash" }),
    getCategoryBreakdown(userId, ref, { cardMode: "cash" }),
    getAvgMonthlyCostCents(userId, 3),
    getBudgetOverview(userId, ref),
    getEmergencyFundSavedCents(userId),
    getDebtOverview(userId),
  ]);

  const sobrou = balanceCents(summary);
  const rate = savingsRate(summary);
  const costBase = avgCost > 0 ? avgCost : Math.round(user.monthlyIncomeCents * 0.7);
  const emergencyTarget = emergencyTargetCents(costBase, user.emergencyMonths);
  const runway = monthsOfRunway(emergencySaved, costBase);

  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  doc.fontSize(18).font("Helvetica-Bold").text("Financeiro 2.0 — Relatório mensal");
  doc
    .fontSize(11)
    .font("Helvetica")
    .fillColor("#555")
    .text(`${capitalize(monthLabel(ref))} · ${user.name}`);
  doc.moveDown(1.2);

  section(doc, "Resumo do mês");
  const summaryRows: [string, string][] = [
    ["Entrou", formatCents(summary.incomeCents)],
    ["Saiu", formatCents(summary.expenseCents)],
    ["  · fixo", formatCents(summary.fixedCents)],
    ["  · variável", formatCents(summary.variableCents)],
    ["Sobrou", formatCents(sobrou)],
    ["Taxa de economia", `${rate}%`],
  ];
  for (const [label, value] of summaryRows) {
    row(doc, label, value);
  }
  doc.moveDown(1);

  section(doc, "Para onde foi o dinheiro");
  if (breakdown.length) {
    tableHeader(doc, ["Categoria", "Valor", "% do total"]);
    const total = breakdown.reduce((acc, b) => acc + b.totalCents, 0) || 1;
    for (const b of breakdown) {
      tableRow(doc, [b.name, formatCents(b.totalCents), `${pct(b.totalCents, total)}%`]);
    }
  } else {
    doc.fontSize(10).font("Helvetica").fillColor("#555").text("Sem despesas registradas neste mês.");
  }
  doc.moveDown(1);

  section(doc, "Orçamento");
  const withLimit = budget.rows.filter((r) => r.limitCents !== null);
  if (withLimit.length) {
    tableHeader(doc, ["Categoria", "Gasto", "Limite", "Status"]);
    for (const r of withLimit) {
      tableRow(doc, [
        r.name,
        formatCents(r.spentCents),
        formatCents(r.limitCents ?? 0),
        STATUS_LABEL[r.status] ?? r.status,
      ]);
    }
  } else {
    doc.fontSize(10).font("Helvetica").fillColor("#555").text("Nenhum limite de orçamento definido neste mês.");
  }
  doc.moveDown(1);

  section(doc, "Reserva de emergência");
  row(doc, "Guardado", formatCents(emergencySaved));
  row(doc, "Meta", `${formatCents(emergencyTarget)} (${user.emergencyMonths} meses de custo de vida)`);
  row(doc, "Meses cobertos hoje", `${runway} de ${user.emergencyMonths}`);
  doc.moveDown(1);

  if (debts.debts.length) {
    section(doc, "Dívidas em aberto");
    row(doc, "Saldo total devedor", formatCents(debts.totalBalanceCents));
    row(doc, "Juros estimado no mês", formatCents(debts.totalMonthlyInterestCents));
  }

  doc
    .moveDown(2)
    .fontSize(8)
    .fillColor("#999")
    .text(`Gerado em ${new Date().toLocaleDateString("pt-BR")} pelo Financeiro 2.0.`);

  doc.end();
  const buffer = await done;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-${monthRefToParam(ref)}.pdf"`,
    },
  });
}

const STATUS_LABEL: Record<string, string> = {
  "sem-limite": "Sem limite",
  ok: "Ok",
  atencao: "Atenção",
  estourou: "Estourou",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function section(doc: PDFKit.PDFDocument, title: string) {
  doc.fontSize(13).font("Helvetica-Bold").fillColor("#111").text(title);
  doc.moveDown(0.4);
}

function row(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.fontSize(10).font("Helvetica").fillColor("#333").text(`${label}: `, { continued: true }).font("Helvetica-Bold").text(value);
}

function tableHeader(doc: PDFKit.PDFDocument, cols: string[]) {
  const y = doc.y;
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#111");
  cols.forEach((c, i) => doc.text(c, COL_X[i], y, { width: (COL_X[i + 1] ?? 560) - COL_X[i] - 8 }));
  doc.moveDown(0.6);
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(560, doc.y)
    .strokeColor("#ddd")
    .stroke();
  doc.moveDown(0.3);
}

function tableRow(doc: PDFKit.PDFDocument, cols: string[]) {
  const y = doc.y;
  doc.fontSize(9).font("Helvetica").fillColor("#333");
  cols.forEach((c, i) => doc.text(c, COL_X[i], y, { width: (COL_X[i + 1] ?? 560) - COL_X[i] - 8 }));
  doc.moveDown(0.6);
}
