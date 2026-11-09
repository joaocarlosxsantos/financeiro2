import { z } from "zod";
import { MAX_CENTS } from "@/lib/money";

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_CONTENT_BYTES = 3 * 1024 * 1024;
export const MAX_IMPORT_FILE_NAME_LENGTH = 255;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}, "Data inválida.");

const fileNameSchema = z.string().trim().min(1).max(MAX_IMPORT_FILE_NAME_LENGTH);
const accountIdSchema = z.string().min(1).max(64);
const invoiceMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional();

export const previewImportInputSchema = z.object({
  fileName: fileNameSchema,
  content: z.string().max(MAX_IMPORT_CONTENT_BYTES).refine((value) => new TextEncoder().encode(value).byteLength <= MAX_IMPORT_CONTENT_BYTES, "Arquivo muito grande."),
  accountId: accountIdSchema,
  invertSign: z.boolean().optional(),
  invoiceMonth: invoiceMonthSchema,
}).strict();

export const previewImportRowSchema = z.object({
  date: dateSchema,
  originalDate: dateSchema.optional(),
  description: z.string().trim().min(1).max(500),
  amountCents: z.number().int().min(1).max(MAX_CENTS),
  kind: z.enum(["INCOME", "EXPENSE"]),
  categoryId: z.string().max(64).nullable(),
  nature: z.enum(["FIXED", "VARIABLE"]),
  isTransfer: z.boolean(),
  duplicate: z.boolean(),
  possibleDuplicate: z.boolean(),
  fingerprint: z.string().min(1).max(256),
  installmentNumber: z.number().int().min(1).max(60).nullable(),
  installmentTotal: z.number().int().min(1).max(60).nullable(),
  dateAdjusted: z.boolean(),
}).strict();

export const commitImportInputSchema = z.object({
  fileName: fileNameSchema,
  accountId: accountIdSchema,
  source: z.enum(["CSV", "OFX"]),
  rows: z.array(previewImportRowSchema).min(1).max(MAX_IMPORT_ROWS),
  invoiceMonth: invoiceMonthSchema,
  replacePeriod: z.boolean().optional(),
}).strict();

