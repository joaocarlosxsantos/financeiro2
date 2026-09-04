/**
 * Em que data um lançamento importado deveria realmente cair — regra pura,
 * sem banco, para poder ser testada isolada (e reaproveitada pela ação de
 * importação em src/server/actions/import.ts).
 *
 * Para cartão de crédito, a importação é por fatura, mas as duas linhas que
 * aparecem lá se comportam de jeitos opostos (mudança de 04/09/2026, depois
 * de descobrir que a versão anterior estava errada para compra à vista):
 *
 * - **Compra à vista** (sem parcela): o arquivo já traz a data real da
 *   compra — usa ela direto, mesmo caindo num mês diferente do mês da
 *   fatura escolhida (uma compra do fim de julho aparecer na fatura de
 *   setembro é normal, e é assim que deve continuar aparecendo: 16/08, não
 *   forçado para setembro).
 * - **Parcela N/T**: o arquivo só traz a data da compra original (a da
 *   primeira parcela), não a da parcela atual — não dá para calcular isso
 *   com segurança só pelo texto "N/T" (já tentamos, é frágil demais). Por
 *   isso quem decide o mês/ano é o mês de referência que o usuário escolheu
 *   para aquela fatura; só o dia do mês é preservado da linha original.
 *
 * Conta que não é cartão nunca tem a data mexida: extrato bancário tem data
 * real de cada movimento, e essa data importa.
 */
import { dateForMonth, parseInstallmentMarker, type InstallmentMarker } from "./installments";
import type { MonthRef } from "./dates";

export type ResolvedImportDate = {
  date: Date;
  adjusted: boolean;
  marker: InstallmentMarker | null;
};

export function resolveImportDate(
  printedDate: Date,
  description: string,
  opts: { isCard: boolean; invoiceRef?: MonthRef },
): ResolvedImportDate {
  const marker = parseInstallmentMarker(description);

  // Só parcela é reposicionada para o mês da fatura — compra à vista mantém
  // a data real impressa no arquivo (ver comentário do arquivo).
  if (opts.isCard && opts.invoiceRef && marker) {
    const date = dateForMonth(opts.invoiceRef, printedDate.getUTCDate());
    return { date, adjusted: date.getTime() !== printedDate.getTime(), marker };
  }

  return { date: printedDate, adjusted: false, marker };
}
