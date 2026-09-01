import { test } from "vitest";
import assert from "node:assert/strict";
import { parseStatement } from "./index";
import { parseCsv } from "./csv";
import { parseOfx } from "./ofx";

// --------------------------------------------------------------- CSV

test("CSV com ponto e vírgula e decimal com vírgula (padrão brasileiro)", () => {
  const { rows, warnings } = parseCsv(
    ["Data;Descricao;Valor", "05/08/2026;MERCADO SAO JOSE;-245,80", "10/08/2026;SALARIO;3200,00"].join(
      "\n",
    ),
  );

  assert.equal(warnings.length, 0);
  assert.deepEqual(rows, [
    { date: "2026-08-05", description: "MERCADO SAO JOSE", amountCents: -24580 },
    { date: "2026-08-10", description: "SALARIO", amountCents: 320000 },
  ]);
});

test("CSV com vírgula separando coluna E decimal, sem aspas", () => {
  // "01/08/2026,IFOOD,-64,90" vira 4 campos para 3 colunas: os centavos
  // precisam ser remontados, senão viram R$ 64,00.
  const { rows } = parseCsv(["Data,Descrição,Valor", "01/08/2026,IFOOD *IFOOD,-64,90"].join("\n"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountCents, -6490);
});

test("CSV com colunas de débito e crédito separadas", () => {
  const { rows } = parseCsv(
    ["Data;Historico;Debito;Credito", "03/08/2026;COMPRA;150,00;", "04/08/2026;DEPOSITO;;500,00"].join(
      "\n",
    ),
  );

  assert.equal(rows[0].amountCents, -15000);
  assert.equal(rows[1].amountCents, 50000);
});

test("CSV com coluna de tipo D/C", () => {
  const { rows } = parseCsv(
    ["Data;Descricao;Valor;Tipo", "05/08/2026;SAQUE;200,00;D", "06/08/2026;TED RECEBIDA;900,00;C"].join(
      "\n",
    ),
  );

  assert.equal(rows[0].amountCents, -20000);
  assert.equal(rows[1].amountCents, 90000);
});

test("CSV aceita cabeçalhos com acento, maiúscula e BOM", () => {
  const content = "﻿DATA;DESCRIÇÃO;VALOR\n07/08/2026;POSTO;-180,00";
  const { rows, detectedColumns } = parseCsv(content);
  assert.equal(rows.length, 1);
  assert.equal(detectedColumns?.data, "DATA");
  assert.equal(detectedColumns?.valor, "VALOR");
});

test("CSV ignora linhas sem data ou sem valor, e avisa", () => {
  const { rows, warnings } = parseCsv(
    ["Data;Descricao;Valor", "05/08/2026;OK;-100,00", ";SEM DATA;-50,00", "06/08/2026;VALOR ZERO;0"].join(
      "\n",
    ),
  );

  assert.equal(rows.length, 1);
  assert.ok(warnings.some((w) => w.includes("ignoradas")));
});

test("CSV sem coluna de valor não inventa nada", () => {
  const { rows, warnings } = parseCsv(["Data;Descricao", "05/08/2026;SEM VALOR"].join("\n"));
  assert.equal(rows.length, 0);
  assert.ok(warnings.some((w) => w.toLowerCase().includes("valor")));
});

test("inverter sinal serve para fatura que traz gasto como positivo", () => {
  const linha = ["Data;Descricao;Valor", "05/08/2026;COMPRA;120,00"].join("\n");
  assert.equal(parseCsv(linha).rows[0].amountCents, 12000);
  assert.equal(parseCsv(linha, { invertSign: true }).rows[0].amountCents, -12000);
});

test("CSV aceita data em formato ISO", () => {
  const { rows } = parseCsv(["Data;Descricao;Valor", "2026-08-15;COMPRA;-99,90"].join("\n"));
  assert.equal(rows[0].date, "2026-08-15");
});

// --------------------------------------------------------------- OFX

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260812<TRNAMT>-89.90<MEMO>PADARIA DO BAIRRO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260815<TRNAMT>1200.00<MEMO>FREELANCE PROJETO</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

test("OFX no formato SGML", () => {
  const { rows } = parseOfx(OFX_SGML);
  assert.deepEqual(rows, [
    { date: "2026-08-12", description: "PADARIA DO BAIRRO", amountCents: -8990 },
    { date: "2026-08-15", description: "FREELANCE PROJETO", amountCents: 120000 },
  ]);
});

test("OFX no formato XML, com NAME no lugar de MEMO", () => {
  const xml = `<?xml version="1.0"?>
<OFX><BANKTRANLIST>
  <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260901120000[-3:BRT]</DTPOSTED><TRNAMT>-45.50</TRNAMT><NAME>FARMACIA</NAME></STMTTRN>
</BANKTRANLIST></OFX>`;

  const { rows } = parseOfx(xml);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-09-01");
  assert.equal(rows[0].amountCents, -4550);
  assert.equal(rows[0].description, "FARMACIA");
});

test("OFX sem transação avisa em vez de falhar", () => {
  const { rows, warnings } = parseOfx("<OFX></OFX>");
  assert.equal(rows.length, 0);
  assert.ok(warnings.length > 0);
});

// --------------------------------------------------------------- roteamento

test("parseStatement escolhe o leitor pelo conteúdo, não só pela extensão", () => {
  // arquivo salvo como .txt mas que é OFX
  assert.equal(parseStatement("extrato.txt", OFX_SGML).rows.length, 2);
  assert.equal(
    parseStatement("extrato.csv", "Data;Descricao;Valor\n05/08/2026;X;-10,00").rows.length,
    1,
  );
});
