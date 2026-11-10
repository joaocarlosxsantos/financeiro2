import { z } from "zod";

/** Strict civil month at the action boundary; no Date normalization of invalid months. */
export const billMonthSchema = z.string()
  .regex(/^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])$/, "Informe um mês entre 2000-01 e 2100-12 no formato YYYY-MM.")
  .transform((value) => ({ year: Number(value.slice(0, 4)), month: Number(value.slice(5)) }));
