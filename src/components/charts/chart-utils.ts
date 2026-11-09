/**
 * Utilitários para tratamento de dados zerados ou vazios em gráficos Recharts.
 * Evita o bug de eixos Y renderizarem frações de centavos (ex: R$ 0,01..0,04)
 * quando todos os valores da série são 0.
 */

import { formatCents } from "@/lib/money";

export const chartMoney = (value: number) => formatCents(value).replace("-", "−");

export type FlowPointLike = {
  entrou?: number;
  saiu?: number;
  sobrou?: number;
  fixo?: number;
  variavel?: number;
};

/**
 * Retorna true se todos os pontos de dados de fluxo financeiro forem zero ou se a lista estiver vazia.
 */
export function isSeriesDataEmpty(data?: FlowPointLike[] | null): boolean {
  if (!data || data.length === 0) return true;
  return data.every((d) => {
    const entrou = Number(d.entrou ?? 0);
    const saiu = Number(d.saiu ?? 0);
    const sobrou = Number(d.sobrou ?? 0);
    const fixo = Number(d.fixo ?? 0);
    const variavel = Number(d.variavel ?? 0);
    return entrou === 0 && saiu === 0 && sobrou === 0 && fixo === 0 && variavel === 0;
  });
}

/**
 * Retorna true se todas as séries de projeção forem zero ou se a lista estiver vazia.
 */
export function isProjectionDataEmpty(
  data?: Array<Record<string, unknown>> | null,
  seriesKeys?: string[] | null,
): boolean {
  if (!data || data.length === 0) return true;
  if (!seriesKeys || seriesKeys.length === 0) return true;

  return data.every((row) =>
    seriesKeys.every((key) => {
      const val = Number(row[key] ?? 0);
      return val === 0;
    }),
  );
}

/**
 * Retorna domínio seguro para Recharts:
 * Quando todos os valores forem zero, usa [0, 1000] centavos (R$ 0 a R$ 10,00)
 * para evitar divisão fracionária de centavos pelo algoritmo automático do Recharts.
 */
export function getZeroSafeDomain(allZero: boolean): [number, number] | ["auto", "auto"] {
  return allZero ? [0, 1000] : ["auto", "auto"];
}

/**
 * Retorna ticks discretos quando os dados forem todos zero, garantindo que não apareçam frações.
 */
export function getZeroSafeTicks(allZero: boolean): number[] | undefined {
  return allZero ? [0, 1000] : undefined;
}

/** Integer-cent scale with a zero baseline and at most four horizontal ticks. */
export function getMoneyScale(values: number[]): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter(Number.isFinite);
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  if (min === max) return { domain: [0, 1000], ticks: [0, 1000] };
  const raw = (max - min) / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  let step = Math.max(1, ([1, 2, 5, 10].find((factor) => factor * power >= raw) ?? 10) * power);
  let low = Math.floor(min / step) * step;
  let high = Math.ceil(max / step) * step;
  while (Math.round((high - low) / step) > 3) {
    step *= 2;
    low = Math.floor(min / step) * step;
    high = Math.ceil(max / step) * step;
  }
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => low + i * step);
  return { domain: [low || 0, high], ticks };
}
