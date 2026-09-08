import { formatCents } from "./money";

/**
 * Telefone livre (o que a pessoa digitou em "Contas a pagar", sem máscara
 * nem validação) -> número que o link `wa.me` aceita: só dígitos, com código
 * do país. Assume Brasil quando o número parece local (DDD + número, sem
 * código de país) — é o caso comum de quem preenche esse campo aqui.
 */
export function normalizePhoneForWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null; // curto demais pra ser um telefone de verdade
  if (digits.length === 10 || digits.length === 11) return `55${digits}`; // DDD + número, sem código de país
  return digits;
}

/** Link `https://wa.me/...` pronto pra abrir a conversa já com a mensagem preenchida. `null` quando o telefone não é utilizável. */
export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export type BillShareEntry = { billName: string; amountCents: number };

/**
 * Mensagem da parte de uma pessoa numa conta em grupo. Quando a conta está
 * dentro de um agrupamento e existem outras contas em grupo desse mesmo
 * agrupamento onde essa pessoa também participa, `entries` já vem com todas
 * elas juntas (ver `bill-item.tsx`) — a mensagem então soma tudo num só
 * texto, em vez de mandar uma mensagem por conta.
 */
export function buildBillShareMessage(opts: {
  participantName: string;
  monthLabel: string;
  groupingName: string | null;
  entries: BillShareEntry[];
}): string {
  const { participantName, monthLabel, groupingName, entries } = opts;
  if (entries.length <= 1) {
    const entry = entries[0];
    return `Oi ${participantName}! Sua parte na conta *${entry?.billName ?? ""}* de ${monthLabel} é *${formatCents(entry?.amountCents ?? 0)}*.`;
  }

  const totalCents = entries.reduce((acc, e) => acc + e.amountCents, 0);
  const lines = entries.map((e) => `- ${e.billName}: ${formatCents(e.amountCents)}`).join("\n");
  const header = groupingName
    ? `Oi ${participantName}! Sua parte nas contas de *${groupingName}* em ${monthLabel}:`
    : `Oi ${participantName}! Sua parte nas contas em ${monthLabel}:`;
  return `${header}\n${lines}\nTotal: *${formatCents(totalCents)}*`;
}
