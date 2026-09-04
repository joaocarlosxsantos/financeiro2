/**
 * Dinheiro no sistema inteiro é Int em CENTAVOS.
 * Nunca use float para somar dinheiro.
 */

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const BRL_COMPACT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * `Intl.NumberFormat` mostra sinal de menos em `-0` ("-R$ 0,00") mesmo sendo
 * zero de verdade — acontece sempre que alguém inverte um valor pra exibir
 * (`-saldoDevedor`, por exemplo) e o saldo por trás é zero. `-0 || 0` troca
 * o `-0` pelo `0` positivo sem afetar nenhum outro valor.
 */
function noNegativeZero(v: number): number {
  return v || 0;
}

export function formatCents(cents: number): string {
  return BRL.format(noNegativeZero((cents ?? 0) / 100));
}

export function formatCentsCompact(cents: number): string {
  const v = noNegativeZero((cents ?? 0) / 100);
  return Math.abs(v) >= 10000 ? BRL_COMPACT.format(v) : BRL.format(v);
}

/** Rótulo curto para eixos de gráfico: "R$ 8 mil", "R$ 1,2 mi". */
export function formatAxisCents(cents: number): string {
  const v = noNegativeZero((cents ?? 0) / 100);
  return Math.abs(v) >= 1000 ? BRL_COMPACT.format(v) : BRL.format(v);
}

export function formatCentsPlain(cents: number): string {
  return ((cents ?? 0) / 100).toFixed(2).replace(".", ",");
}

/**
 * Converte texto digitado pelo usuário em centavos.
 * Aceita "1.234,56", "1234.56", "1234", "R$ 1.234,56", "-45,90".
 */
export function parseMoneyToCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number") return Math.round(input * 100);

  let s = input.trim().replace(/[^\d,.\-]/g, "");
  if (!s) return 0;

  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // O separador decimal é o que aparece por último.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "1234,56" -> decimal;  "1,234" com 3 dígitos -> milhar
    s = s.length - lastComma - 1 === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot > -1) {
    s = s.length - lastDot - 1 === 3 ? s.replace(/\./g, "") : s;
  }

  const value = Number.parseFloat(s);
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100) * (negative ? -1 : 1);
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
