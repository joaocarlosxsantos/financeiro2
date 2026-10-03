/**
 * Regras puras de fatura de cartão de crédito e ciclo de faturamento.
 *
 * CONVENÇÃO ADOTADA:
 * - `ref` = mês do VENCIMENTO da fatura no formato "YYYY-MM" (convenção bancária padrão).
 * - Uma compra realizada em dia <= fechamento efetivo entra na fatura que fecha naquele mesmo mês.
 *   Se dia > fechamento efetivo, entra na fatura que fecha no mês seguinte.
 * - Fechamento efetivo = min(closingDay, últimoDiaDoMês).
 * - Vencimento: se dueDay > closingDay, vence no mesmo mês do fechamento;
 *   senão (dueDay <= closingDay), vence no mês seguinte ao fechamento.
 *   Em ambos os casos, limitado ao último dia do respectivo mês de vencimento.
 * - Todas as datas civis são ancoradas em UTC 12:00Z para evitar desvios por fuso horário.
 *
 * Sem acesso a banco de dados — pode ser importado por componentes de cliente e servidor.
 */

import { formatDate, todayRef } from "./dates";
import { formatCents } from "./money";
import type { Alert } from "./alerts";

export type InvoiceCycle = {
  /** Identificador da fatura: mês do vencimento ("YYYY-MM") */
  ref: string;
  /** Início do período da fatura (dia seguinte ao fechamento anterior, 12:00Z) */
  periodStart: Date;
  /** Data em que a fatura fecha (12:00Z) */
  closesOn: Date;
  /** Data de vencimento da fatura (12:00Z) */
  dueOn: Date;
};

export type Invoice = {
  ref: string;
  dueOn: Date;
  balanceCents: number;
  accountId?: string;
  accountName?: string;
};

export type InvoiceAlert = Alert & {
  ref: string;
  dueOn: Date;
  balanceCents: number;
  status: "overdue" | "due_soon";
  diffDays: number;
};

/**
 * Retorna o último dia do mês (28..31) para o ano e mês especificados (mês 0-indexed: 0-11).
 */
function getLastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Cria uma data civil ancorada ao meio-dia UTC (12:00Z).
 */
function createUtcCivilDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

/**
 * Normaliza qualquer Date para a data civil correspondente em UTC 12:00Z.
 */
function toCivilUtcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

/**
 * Retorna a data civil atual de 'hoje' em America/Sao_Paulo como Date em UTC 12:00Z.
 */
export function getCivilToday(now: Date = new Date()): Date {
  const [year, month, day] = todayRef(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/**
 * Calcula o ciclo de fatura para uma compra em determinada data civil.
 *
 * @param date Data da compra (lida em UTC 12:00Z)
 * @param closingDay Dia do fechamento configurado (1 a 31)
 * @param dueDay Dia do vencimento configurado (1 a 31)
 */
export function invoiceCycle(date: Date, closingDay: number, dueDay: number): InvoiceCycle {
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
    throw new RangeError(`closingDay deve estar entre 1 e 31, recebido: ${closingDay}`);
  }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new RangeError(`dueDay deve estar entre 1 e 31, recebido: ${dueDay}`);
  }

  const purchaseYear = date.getUTCFullYear();
  const purchaseMonth = date.getUTCMonth(); // 0 a 11
  const purchaseDay = date.getUTCDate();

  // Fechamento efetivo no mês da compra = min(closingDay, ultimoDia(purchaseMonth))
  const lastDayPurchaseMonth = getLastDayOfMonth(purchaseYear, purchaseMonth);
  const effectiveClosingDay = Math.min(closingDay, lastDayPurchaseMonth);

  // Compra com dia <= fechamento efetivo cai na fatura que fecha em M; senão, em M+1
  const closesInSameMonth = purchaseDay <= effectiveClosingDay;
  const closeMonthBase = new Date(Date.UTC(purchaseYear, closesInSameMonth ? purchaseMonth : purchaseMonth + 1, 1));
  const closeYear = closeMonthBase.getUTCFullYear();
  const closeMonth = closeMonthBase.getUTCMonth();

  const lastDayCloseMonth = getLastDayOfMonth(closeYear, closeMonth);
  const actualCloseDay = Math.min(closingDay, lastDayCloseMonth);
  const closesOn = createUtcCivilDate(closeYear, closeMonth, actualCloseDay);

  // Ciclo anterior fechou em closeMonth - 1
  const prevCloseMonthBase = new Date(Date.UTC(closeYear, closeMonth - 1, 1));
  const prevCloseYear = prevCloseMonthBase.getUTCFullYear();
  const prevCloseMonth = prevCloseMonthBase.getUTCMonth();
  const lastDayPrevCloseMonth = getLastDayOfMonth(prevCloseYear, prevCloseMonth);
  const prevActualCloseDay = Math.min(closingDay, lastDayPrevCloseMonth);
  // O período se inicia no dia seguinte ao fechamento anterior
  const periodStart = createUtcCivilDate(prevCloseYear, prevCloseMonth, prevActualCloseDay + 1);

  // Vencimento: se dueDay > closingDay, mesmo mês do fechamento; senão, mês seguinte.
  const dueInSameMonthAsClose = dueDay > closingDay;
  const dueMonthBase = new Date(Date.UTC(closeYear, dueInSameMonthAsClose ? closeMonth : closeMonth + 1, 1));
  const dueYear = dueMonthBase.getUTCFullYear();
  const dueMonth = dueMonthBase.getUTCMonth();

  // Limitado ao último dia do mês de vencimento
  const lastDayDueMonth = getLastDayOfMonth(dueYear, dueMonth);
  const actualDueDay = Math.min(dueDay, lastDayDueMonth);
  const dueOn = createUtcCivilDate(dueYear, dueMonth, actualDueDay);

  const ref = `${dueYear}-${String(dueMonth + 1).padStart(2, "0")}`;

  return {
    ref,
    periodStart,
    closesOn,
    dueOn,
  };
}

/**
 * Determina o mês de vencimento (ref) de uma parcela a partir da fatura da 1ª parcela.
 *
 * Para a parcela `k`, não recalcula o ciclo a partir de datas deslocadas.
 * Cada parcela avança (k - 1) meses a partir do ref da primeira (YYYY-MM).
 *
 * @param ref1 Mês da fatura da 1ª parcela ("YYYY-MM")
 * @param installmentIndex Número da parcela (k = 1, 2, ..., n)
 */
export function invoiceRefForInstallment(ref1: string, installmentIndex: number): string {
  if (!Number.isInteger(installmentIndex) || installmentIndex < 1) {
    throw new RangeError(`installmentIndex deve ser um inteiro >= 1, recebido: ${installmentIndex}`);
  }
  const match = /^(\d{4})-(\d{2})$/.exec(ref1.trim());
  if (!match) {
    throw new Error(`ref1 inválido, esperado formato YYYY-MM: "${ref1}"`);
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (month < 1 || month > 12) {
    throw new RangeError(`Mês em ref1 deve estar entre 01 e 12: "${ref1}"`);
  }

  // Desloca (k - 1) meses a partir de ref1
  const totalMonths = year * 12 + (month - 1) + (installmentIndex - 1);
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
}

/**
 * Gera alertas de faturas próximas do vencimento (<= 3 dias) ou vencidas.
 *
 * @param invoices Lista de faturas com { ref, dueOn, balanceCents }
 * @param today Data de referência (padrão: hoje em America/Sao_Paulo a 12:00Z)
 */
export function invoiceAlerts(invoices: Invoice[], today: Date = getCivilToday()): InvoiceAlert[] {
  const civilToday = toCivilUtcDate(today);
  const todayTime = civilToday.getTime();

  const alerts: InvoiceAlert[] = [];

  for (const inv of invoices) {
    // Fatura sem saldo devedor não gera alerta (paga ou com crédito)
    if (inv.balanceCents <= 0) continue;

    const dueCivil = toCivilUtcDate(inv.dueOn);
    const diffDays = Math.round((dueCivil.getTime() - todayTime) / (24 * 60 * 60 * 1000));

    // Alerta = vence em até 3 dias (0 <= diffDays <= 3) ou já vencida (diffDays < 0)
    if (diffDays <= 3) {
      const isOverdue = diffDays < 0;
      const status: "overdue" | "due_soon" = isOverdue ? "overdue" : "due_soon";
      const cardName = inv.accountName ? `do ${inv.accountName}` : inv.ref;

      let title: string;
      let description: string;

      if (isOverdue) {
        const daysPast = Math.abs(diffDays);
        title = `Fatura ${cardName} vencida`;
        description = `Venceu ${daysPast === 1 ? "ontem" : `há ${daysPast} dias`} (${formatDate(inv.dueOn)}) com saldo de ${formatCents(inv.balanceCents)}.`;
      } else if (diffDays === 0) {
        title = `Fatura ${cardName} vence hoje`;
        description = `Vence hoje (${formatDate(inv.dueOn)}) no valor de ${formatCents(inv.balanceCents)}.`;
      } else if (diffDays === 1) {
        title = `Fatura ${cardName} vence amanhã`;
        description = `Vence amanhã (${formatDate(inv.dueOn)}) no valor de ${formatCents(inv.balanceCents)}.`;
      } else {
        title = `Fatura ${cardName} vence em ${diffDays} dias`;
        description = `Vence dia ${formatDate(inv.dueOn)} no valor de ${formatCents(inv.balanceCents)}.`;
      }

      alerts.push({
        id: `invoice-${inv.accountId ?? inv.ref}-${inv.ref}`,
        tone: "warn",
        title,
        description,
        href: "/saldos",
        linkLabel: "Ver fatura",
        ref: inv.ref,
        dueOn: inv.dueOn,
        balanceCents: inv.balanceCents,
        status,
        diffDays,
      });
    }
  }

  // Ordena por vencimento mais urgente (as mais antigas/vencidas primeiro)
  return alerts.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());
}
