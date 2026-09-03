/**
 * Em que data um lançamento importado deveria realmente cair — regra pura,
 * sem banco, para poder ser testada isolada (e reaproveitada pela ação de
 * importação em src/server/actions/import.ts).
 *
 * O motivo de isso existir: a data de um lançamento não é só "quando
 * aconteceu" — é o que decide em qual fatura ele entra (invoiceForPurchase) E
 * em qual mês ele aparece nos relatórios. Uma compra parcelada tem N linhas
 * no arquivo do banco, mas só a primeira parcela realmente pertence ao mês da
 * compra; as outras têm que "acontecer" um mês depois de cada vez — é assim
 * que o parcelamento manual dentro do app já funciona (veja
 * src/server/installments.ts). Importar sem corrigir isso empilha as N
 * parcelas todas na mesma fatura, e as N-1 faturas seguintes ficam sem elas.
 */
import { addMonthsKeepingDay, parseInstallmentMarker, type InstallmentMarker } from "./installments";
import { dateWithinInvoice, type InvoiceRef } from "./invoices";

export type ImportKind = "GENERAL" | "CLOSED_INVOICE";

export type ResolvedImportDate = {
  date: Date;
  adjusted: boolean;
  matched: boolean;
  marker: InstallmentMarker | null;
};

export function resolveImportDate(
  printedDate: Date,
  description: string,
  opts: {
    importKind: ImportKind;
    invoiceRef?: InvoiceRef;
    isCard: boolean;
    closingDay: number;
    dueDay: number;
  },
): ResolvedImportDate {
  const marker = parseInstallmentMarker(description);

  if (opts.importKind === "CLOSED_INVOICE" && opts.invoiceRef) {
    // Toda linha desta fatura pertence a este mês — sem exceção, com ou sem parcela.
    const result = dateWithinInvoice(printedDate, opts.invoiceRef, opts.closingDay, opts.dueDay);
    return { date: result.date, adjusted: result.monthsShifted !== 0, matched: result.matched, marker };
  }

  if (marker && marker.number > 1 && opts.isCard) {
    // Lançamentos gerais: só dá para saber o mês certo da parcela N pela
    // aritmética (mês da compra + N-1), porque o arquivo não diz qual fatura.
    return {
      date: addMonthsKeepingDay(printedDate, marker.number - 1),
      adjusted: true,
      matched: true,
      marker,
    };
  }

  return { date: printedDate, adjusted: false, matched: true, marker };
}
