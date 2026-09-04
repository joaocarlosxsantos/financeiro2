/**
 * Em que data um lançamento importado deveria realmente cair — regra pura,
 * sem banco, para poder ser testada isolada (e reaproveitada pela ação de
 * importação em src/server/actions/import.ts).
 *
 * O motivo de isso existir: a data de um lançamento não é só "quando
 * aconteceu" — é o que decide em qual mês ele aparece nos relatórios. Uma
 * compra parcelada tem N linhas no arquivo do banco, mas só a primeira
 * parcela realmente pertence ao mês da compra; as outras têm que "acontecer"
 * um mês depois de cada vez — é assim que o parcelamento manual dentro do
 * app já funciona (veja src/server/installments.ts). Importar sem corrigir
 * isso empilha as N parcelas todas no mesmo mês.
 */
import { addMonthsKeepingDay, parseInstallmentMarker, type InstallmentMarker } from "./installments";

export type ResolvedImportDate = {
  date: Date;
  adjusted: boolean;
  marker: InstallmentMarker | null;
};

export function resolveImportDate(
  printedDate: Date,
  description: string,
  opts: { isCard: boolean },
): ResolvedImportDate {
  const marker = parseInstallmentMarker(description);

  if (marker && marker.number > 1 && opts.isCard) {
    // Só dá para saber o mês certo da parcela N pela aritmética
    // (mês da compra + N-1), porque o arquivo não diz mais nada além disso.
    return {
      date: addMonthsKeepingDay(printedDate, marker.number - 1),
      adjusted: true,
      marker,
    };
  }

  return { date: printedDate, adjusted: false, marker };
}
