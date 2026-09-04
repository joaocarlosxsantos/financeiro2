/**
 * Linhas que aparecem na fatura de cartão mas não são gasto — são o próprio
 * banco confirmando que você pagou a fatura anterior. Regra pura, sem banco,
 * pra poder ser testada isolada e reaproveitada pela ação de importação em
 * src/server/actions/import.ts.
 *
 * Só faz sentido aplicar em conta de cartão: numa conta corrente, uma
 * descrição começando com "pagamento" pode ser um boleto de verdade que o
 * usuário quer ver na lista — quem decide isso ali é o usuário, marcando a
 * linha na prévia, do mesmo jeito que já faz com transferência.
 */
import { normalize } from "./categorize";

const PAYMENT_LINE_PREFIXES = [
  "pagamento on line",
  "pagamento online",
  "pagamento efetuado",
  "pagamento recebido",
  "pgto on line",
  "pgto online",
];

export function isInvoicePaymentLine(description: string): boolean {
  const n = normalize(description);
  return PAYMENT_LINE_PREFIXES.some((prefix) => n.startsWith(prefix));
}
