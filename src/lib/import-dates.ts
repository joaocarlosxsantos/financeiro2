/**
 * Em que data um lançamento importado deveria realmente cair — regra pura,
 * sem banco, para poder ser testada isolada (e reaproveitada pela ação de
 * importação em src/server/actions/import.ts).
 *
 * Para cartão de crédito, a importação é por fatura: o usuário escolhe o mês
 * de referência daquela fatura, e é esse mês que decide onde cada linha cai
 * — nunca a data impressa no arquivo (que normalmente é a data da compra
 * original, não o mês da parcela atual; tentar calcular isso por aritmética
 * a partir do texto "N/T" já se mostrou frágil demais, porque o arquivo não
 * diz o suficiente pra saber com certeza). O dia do mês é preservado da linha
 * original só por estética (agrupamento na lista); o mês e o ano vêm sempre
 * do que o usuário escolheu. Vale para toda linha da fatura, parcelada ou
 * não — é o mesmo período de cobrança.
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

  if (opts.isCard && opts.invoiceRef) {
    const date = dateForMonth(opts.invoiceRef, printedDate.getUTCDate());
    return { date, adjusted: date.getTime() !== printedDate.getTime(), marker };
  }

  return { date: printedDate, adjusted: false, marker };
}
