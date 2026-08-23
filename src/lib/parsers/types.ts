export type ParsedRow = {
  date: string; // ISO yyyy-MM-dd
  description: string;
  /** Positivo = entrada, negativo = saída. Em centavos. */
  amountCents: number;
};

export type ParseResult = {
  rows: ParsedRow[];
  warnings: string[];
  detectedColumns?: Record<string, string>;
};
