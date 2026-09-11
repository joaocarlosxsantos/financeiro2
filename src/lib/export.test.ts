import { test } from "vitest";
import assert from "node:assert/strict";
import { buildExportRows, rowsToCsv } from "./export";

const base = {
  date: new Date("2026-09-05T12:00:00Z"),
  description: "Mercado do mês",
  categoryName: "Mercado",
  kind: "EXPENSE" as const,
  nature: "VARIABLE" as const,
  accountName: "Conta corrente",
  amountCents: 12345,
  isTransfer: false,
  installmentNumber: null,
  installmentTotal: null,
  recurringRuleId: null,
  notes: null,
};

test("despesa vira valor negativo, entrada vira valor positivo", () => {
  const rows = buildExportRows([base, { ...base, kind: "INCOME", amountCents: 500000, description: "Salário" }]);
  assert.equal(rows[0]["Valor (R$)"], -123.45);
  assert.equal(rows[1]["Valor (R$)"], 5000);
});

test("sem categoria vira texto explícito, não fica em branco", () => {
  const rows = buildExportRows([{ ...base, categoryName: null }]);
  assert.equal(rows[0].Categoria, "Sem categoria");
});

test("parcela só aparece quando os dois campos existem", () => {
  const rows = buildExportRows([
    { ...base, installmentNumber: 2, installmentTotal: 12 },
    { ...base, installmentNumber: null, installmentTotal: null },
  ]);
  assert.equal(rows[0].Parcela, "2/12");
  assert.equal(rows[1].Parcela, "");
});

test("csv usa ; como separador e escapa vírgula/aspas no valor", () => {
  const rows = buildExportRows([{ ...base, description: 'Loja "Boa, Rápida"' }]);
  const csv = rowsToCsv(rows);
  const lines = csv.replace(/^﻿/, "").split("\r\n");
  assert.equal(lines[0].split(";")[0], "Data");
  assert.match(lines[1], /"Loja ""Boa, Rápida"""/);
});

test("texto começando com =, +, -, @ vira neutralizado no CSV (evita fórmula ao abrir no Excel/Sheets)", () => {
  const rows = buildExportRows([
    { ...base, description: "=SOMA(1;2)" },
    { ...base, notes: "+cmd|' /c calc'!A1" },
    { ...base, categoryName: "@SUM(A1)" },
  ]);
  const csv = rowsToCsv(rows);
  const lines = csv.replace(/^﻿/, "").split("\r\n").slice(1);
  assert.match(lines[0], /"'=SOMA\(1;2\)"/);
  assert.match(lines[1], /'\+cmd/);
  assert.match(lines[2], /'@SUM\(A1\)/);
});

test("valor negativo continua número puro no CSV, sem virar texto neutralizado", () => {
  const rows = buildExportRows([base]); // despesa -> "Valor (R$)" negativo
  const csv = rowsToCsv(rows);
  const cols = csv.replace(/^﻿/, "").split("\r\n")[1].split(";");
  assert.equal(cols[6], "-123.45");
});
