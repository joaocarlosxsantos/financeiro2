import { describe, expect, it } from "vitest";
import { MAX_CENTS } from "@/lib/money";
import { commitImportInputSchema, MAX_IMPORT_CONTENT_BYTES, MAX_IMPORT_ROWS, previewImportInputSchema } from "./validation";

const validRow = () => ({
  date: "2026-11-01", description: "Mercado", amountCents: 1000, kind: "EXPENSE" as const,
  categoryId: null, nature: "VARIABLE" as const, isTransfer: false, duplicate: false,
  possibleDuplicate: false, fingerprint: "safe-fingerprint", installmentNumber: null,
  installmentTotal: null, dateAdjusted: false,
});

describe("import server input validation", () => {
  it("rejects extra keys, oversized filenames, and content over the UTF-8 byte cap", () => {
    const base = { fileName: "statement.csv", content: "date,description,amount", accountId: "account-id" };
    expect(previewImportInputSchema.safeParse({ ...base, unexpected: true }).success).toBe(false);
    expect(previewImportInputSchema.safeParse({ ...base, fileName: "x".repeat(256) }).success).toBe(false);
    const multibyteContent = "é".repeat(Math.floor(MAX_IMPORT_CONTENT_BYTES / 2) + 1);
    expect(multibyteContent.length).toBeLessThan(MAX_IMPORT_CONTENT_BYTES);
    expect(previewImportInputSchema.safeParse({ ...base, content: multibyteContent }).success).toBe(false);
  });

  it("rejects malformed dates, invalid enums, descriptions, and non-integer or out-of-range amounts", () => {
    const base = { fileName: "statement.csv", accountId: "account-id", source: "CSV", rows: [validRow()] };
    expect(commitImportInputSchema.safeParse({ ...base, extra: "no" }).success).toBe(false);
    expect(commitImportInputSchema.safeParse({ ...base, rows: [{ ...validRow(), date: "2026-02-30" }] }).success).toBe(false);
    expect(commitImportInputSchema.safeParse({ ...base, rows: [{ ...validRow(), kind: "TRANSFER" }] }).success).toBe(false);
    expect(commitImportInputSchema.safeParse({ ...base, rows: [{ ...validRow(), description: "x".repeat(501) }] }).success).toBe(false);
    expect(commitImportInputSchema.safeParse({ ...base, rows: [{ ...validRow(), amountCents: 1.5 }] }).success).toBe(false);
    expect(commitImportInputSchema.safeParse({ ...base, rows: [{ ...validRow(), amountCents: MAX_CENTS + 1 }] }).success).toBe(false);
  });

  it("caps committed row count", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, validRow);
    expect(commitImportInputSchema.safeParse({ fileName: "statement.csv", accountId: "account-id", source: "CSV", rows }).success).toBe(false);
  });
});
