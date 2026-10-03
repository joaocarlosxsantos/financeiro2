import { z } from "zod";

// Validação pura (sem banco) para poder ser testada; usada em server/actions/settings.ts
const daySchema = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : NaN;
}, z.number({ message: "Dia deve ser um número entre 1 e 31." }).int("Dia deve ser um número inteiro.").min(1, "Dia deve ser entre 1 e 31.").max(31, "Dia deve ser entre 1 e 31.").nullable().optional().transform((v) => v ?? null));

export const accountSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome para a conta."),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH", "INVESTMENT"]),
  institution: z.string().optional(),
  color: z.string().optional(),
  closingDay: daySchema,
  dueDay: daySchema,
});
