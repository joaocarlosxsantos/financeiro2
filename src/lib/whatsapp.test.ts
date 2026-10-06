import { test } from "vitest";
import assert from "node:assert/strict";
import { buildBillShareMessage, buildWhatsAppLink, normalizePhoneForWhatsApp } from "./whatsapp";
import { formatCents } from "./money";

test("normaliza telefone local (DDD + número de 10 ou 11 dígitos) prefixando 55", () => {
  assert.equal(normalizePhoneForWhatsApp("(31) 99999-8888"), "5531999998888");
  assert.equal(normalizePhoneForWhatsApp("31999998888"), "5531999998888");
  assert.equal(normalizePhoneForWhatsApp("(31) 3333-4444"), "553133334444");
  assert.equal(normalizePhoneForWhatsApp("3133334444"), "553133334444");
});

test("mantém telefone de 12 ou 13 dígitos que já começa com 55", () => {
  assert.equal(normalizePhoneForWhatsApp("+55 31 99999-8888"), "5531999998888");
  assert.equal(normalizePhoneForWhatsApp("5531999998888"), "5531999998888");
  assert.equal(normalizePhoneForWhatsApp("+55 (31) 3333-4444"), "553133334444");
  assert.equal(normalizePhoneForWhatsApp("553133334444"), "553133334444");
});

test("retorna null para 9 dígitos sem DDD ou menos de 10 dígitos", () => {
  assert.equal(normalizePhoneForWhatsApp("98888-7777"), null);
  assert.equal(normalizePhoneForWhatsApp("988887777"), null);
  assert.equal(normalizePhoneForWhatsApp("3333-4444"), null);
  assert.equal(normalizePhoneForWhatsApp("1234"), null);
  assert.equal(normalizePhoneForWhatsApp(""), null);
  assert.equal(normalizePhoneForWhatsApp(null), null);
  assert.equal(normalizePhoneForWhatsApp(undefined), null);
});

test("retorna null para formatos inválidos com 12+ dígitos sem 55 ou compridos demais", () => {
  assert.equal(normalizePhoneForWhatsApp("123456789012"), null); // 12 dígitos sem 55
  assert.equal(normalizePhoneForWhatsApp("1234567890123"), null); // 13 dígitos sem 55
  assert.equal(normalizePhoneForWhatsApp("553199999888899"), null); // 15 dígitos
});

test("link do WhatsApp só existe quando o telefone é utilizável", () => {
  const link = buildWhatsAppLink("(31) 99999-8888", "oi");
  assert.equal(link, "https://wa.me/5531999998888?text=oi");
  assert.equal(buildWhatsAppLink(null, "oi"), null);
  assert.equal(buildWhatsAppLink("123", "oi"), null);
});

test("mensagem de uma única conta", () => {
  const msg = buildBillShareMessage({
    participantName: "Pedro",
    monthLabel: "setembro de 2026",
    groupingName: null,
    entries: [{ billName: "Assinatura YouTube Premium", amountCents: 1800 }],
  });
  assert.equal(
    msg,
    `Oi Pedro! Sua parte na conta *Assinatura YouTube Premium* de setembro de 2026 é *${formatCents(1800)}*.`,
  );
});

test("mensagem consolidada de várias contas do mesmo agrupamento, com total", () => {
  const msg = buildBillShareMessage({
    participantName: "Pedro",
    monthLabel: "setembro de 2026",
    groupingName: "Casa",
    entries: [
      { billName: "Assinatura YouTube Premium", amountCents: 1800 },
      { billName: "Internet", amountCents: 4500 },
    ],
  });
  assert.equal(
    msg,
    "Oi Pedro! Sua parte nas contas de *Casa* em setembro de 2026:\n" +
      `- Assinatura YouTube Premium: ${formatCents(1800)}\n` +
      `- Internet: ${formatCents(4500)}\n` +
      `Total: *${formatCents(6300)}*`,
  );
});
