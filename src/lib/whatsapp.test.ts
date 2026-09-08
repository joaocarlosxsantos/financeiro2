import { test } from "vitest";
import assert from "node:assert/strict";
import { buildBillShareMessage, buildWhatsAppLink, normalizePhoneForWhatsApp } from "./whatsapp";
import { formatCents } from "./money";

test("normaliza telefone local (DDD + número) prefixando o código do Brasil", () => {
  assert.equal(normalizePhoneForWhatsApp("(31) 99999-8888"), "5531999998888");
  assert.equal(normalizePhoneForWhatsApp("31999998888"), "5531999998888");
});

test("normaliza telefone já com código do país sem duplicar", () => {
  assert.equal(normalizePhoneForWhatsApp("+55 31 99999-8888"), "5531999998888");
  assert.equal(normalizePhoneForWhatsApp("5531999998888"), "5531999998888");
});

test("telefone vazio, nulo ou curto demais não normaliza", () => {
  assert.equal(normalizePhoneForWhatsApp(null), null);
  assert.equal(normalizePhoneForWhatsApp(undefined), null);
  assert.equal(normalizePhoneForWhatsApp(""), null);
  assert.equal(normalizePhoneForWhatsApp("1234"), null);
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
