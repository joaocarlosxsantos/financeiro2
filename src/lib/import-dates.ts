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
 * - **Parcela N/T**: a primeira preserva a data da compra impressa. Para as
 *   demais, a fatura selecionada determina o ciclo; sem fechamento e
 *   vencimento configurados, usa-se o mês selecionado e o dia impresso.
 *
 * Conta que não é cartão nunca tem a data mexida: extrato bancário tem data
 * real de cada movimento, e essa data importa.
 */
import { addMonthsKeepingDay, dateForMonth, parseInstallmentMarker, type InstallmentMarker } from "./installments";
import { monthRefToParam, shiftMonth, type MonthRef } from "./dates";
import { invoiceCycle, invoiceRefForInstallment } from "./invoices";

export type ResolvedImportDate = {
  date: Date;
  fingerprintDate: Date;
  adjusted: boolean;
  marker: InstallmentMarker | null;
};

export function resolveImportDate(
  printedDate: Date,
  description: string,
  opts: { isCard: boolean; invoiceRef?: MonthRef; closingDay?: number | null; dueDay?: number | null },
): ResolvedImportDate {
  const marker = parseInstallmentMarker(description);

  if (!opts.isCard || !opts.invoiceRef || !marker) {
    return { date: printedDate, fingerprintDate: printedDate, adjusted: false, marker };
  }

  const { invoiceRef, closingDay, dueDay } = opts;
  const day = printedDate.getUTCDate();
  // Preserva a chave de deduplicação de arquivos que já foram importados.
  const fingerprintDate = dateForMonth(invoiceRef, day);
  let date = marker.number === 1 ? printedDate : fingerprintDate;
  if (marker.number > 1 && closingDay && dueDay && closingDay <= 31 && dueDay <= 31 && closingDay > 0 && dueDay > 0) {
    const selectedRef = monthRefToParam(invoiceRef);
    const firstRef = invoiceCycle(printedDate, closingDay, dueDay).ref;
    if (invoiceRefForInstallment(firstRef, marker.number) === selectedRef) {
      date = addMonthsKeepingDay(printedDate, marker.number - 1);
    } else {
      // Um ciclo pode começar até dois meses antes do vencimento.
      const months = [invoiceRef, shiftMonth(invoiceRef, -1), shiftMonth(invoiceRef, -2)];
      date = months.map((month) => dateForMonth(month, day))
        .find((candidate) => invoiceCycle(candidate, closingDay, dueDay).ref === selectedRef) ?? fingerprintDate;
    }
  }
  return { date, fingerprintDate, adjusted: date.getTime() !== printedDate.getTime(), marker };
}
