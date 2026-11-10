import { describe, expect, it } from "vitest";
import {
  safeDescriptionSchema,
  safeNameSchema,
  safeNotesSchema,
  safeOptionalTextSchema,
  sanitizeFreeText,
} from "./sanitization";

describe("sanitization helper", () => {
  it("remove bytes nulos e caracteres de controle em texto de uma linha", () => {
    const raw = "Supermercado\x00 \x07Bom\x1B Preço\t\nCentral";
    const cleaned = sanitizeFreeText(raw, false);
    expect(cleaned).toBe("Supermercado Bom Preço Central");
  });

  it("preserva quebras de linha legítimas quando allowNewlines é true", () => {
    const raw = "Linha 1\x00\nLinha 2\x07\r\nLinha 3";
    const cleaned = sanitizeFreeText(raw, true);
    expect(cleaned).toBe("Linha 1\nLinha 2\r\nLinha 3");
  });

  it("safeNameSchema remove controles, aplica trim e respeita limites", () => {
    const schema = safeNameSchema(2, 50);

    // Validação de mínimo
    const tooShort = schema.safeParse(" A ");
    expect(tooShort.success).toBe(false);

    // Validação de controle e sucesso
    const valid = schema.safeParse("  Conta\x00 Corrente \x1B ");
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data).toBe("Conta Corrente");
    }

    // Validação de máximo
    const tooLong = schema.safeParse("a".repeat(51));
    expect(tooLong.success).toBe(false);
  });

  it("safeDescriptionSchema valida descrições e bloqueia textos com mais de 255 caracteres", () => {
    const schema = safeDescriptionSchema(2, 255);
    const valid = schema.safeParse("Almoço de domingo");
    expect(valid.success).toBe(true);

    const tooLong = schema.safeParse("A".repeat(256));
    expect(tooLong.success).toBe(false);
  });

  it("safeOptionalTextSchema limpa strings vazias para undefined e limita tamanho", () => {
    const schema = safeOptionalTextSchema(50);
    expect(schema.parse("")).toBeUndefined();
    expect(schema.parse("   ")).toBeUndefined();
    expect(schema.parse("Nubank\x00")).toBe("Nubank");

    const tooLong = schema.safeParse("X".repeat(51));
    expect(tooLong.success).toBe(false);
  });

  it("safeNotesSchema permite quebras de linha e limita tamanho máximo", () => {
    const schema = safeNotesSchema(100);
    const multiline = "Nota com\nquebra de linha\ne detalhes";
    const parsed = schema.safeParse(multiline);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toContain("\n");
    }

    const tooLong = schema.safeParse("N".repeat(101));
    expect(tooLong.success).toBe(false);
  });
});
