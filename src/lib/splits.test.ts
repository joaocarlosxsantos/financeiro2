import { describe, expect, it } from "vitest";
import { computeSplit } from "./splits";

describe("computeSplit", () => {
  describe("EQUAL mode", () => {
    it("divide centavos exatos (100,00 / 3) com dono incluído", () => {
      // R$ 100,00 entre Ana, Beto e Você (3 pessoas)
      const res = computeSplit(
        10000,
        "EQUAL",
        [{ name: "Ana" }, { name: "Beto" }],
        true,
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.amounts).toHaveLength(2);
      expect(res.amounts[0]).toEqual({ name: "Ana", phone: null, amountCents: 3334 });
      expect(res.amounts[1]).toEqual({ name: "Beto", phone: null, amountCents: 3333 });
      expect(res.myShareCents).toBe(3333);

      // Soma exata dos centavos
      const total = res.amounts.reduce((acc, a) => acc + a.amountCents, 0) + res.myShareCents;
      expect(total).toBe(10000);
    });

    it("divide centavos exatos (100,00 / 3) sem dono incluído", () => {
      // R$ 100,00 entre Ana, Beto e Caio (3 pessoas, dono não participa)
      const res = computeSplit(
        10000,
        "EQUAL",
        [{ name: "Ana" }, { name: "Beto" }, { name: "Caio" }],
        false,
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.amounts).toHaveLength(3);
      expect(res.amounts[0]).toEqual({ name: "Ana", phone: null, amountCents: 3334 });
      expect(res.amounts[1]).toEqual({ name: "Beto", phone: null, amountCents: 3333 });
      expect(res.amounts[2]).toEqual({ name: "Caio", phone: null, amountCents: 3333 });
      expect(res.myShareCents).toBe(0);

      const total = res.amounts.reduce((acc, a) => acc + a.amountCents, 0) + res.myShareCents;
      expect(total).toBe(10000);
    });

    it("preserva telefones informados", () => {
      const res = computeSplit(
        5000,
        "EQUAL",
        [{ name: "Ana", phone: "11999999999" }],
        true,
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.amounts[0].phone).toBe("11999999999");
    });

    it("divide R$ 0,02 em EQUAL entre 5 pessoas sem dono (myIncluded = false)", () => {
      // Esperado: 2 partes de 1 centavo, 3 de zero, soma = 2
      const res = computeSplit(
        2,
        "EQUAL",
        [
          { name: "Pessoa 1" },
          { name: "Pessoa 2" },
          { name: "Pessoa 3" },
          { name: "Pessoa 4" },
          { name: "Pessoa 5" },
        ],
        false,
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.amounts).toHaveLength(5);
      expect(res.amounts[0].amountCents).toBe(1);
      expect(res.amounts[1].amountCents).toBe(1);
      expect(res.amounts[2].amountCents).toBe(0);
      expect(res.amounts[3].amountCents).toBe(0);
      expect(res.amounts[4].amountCents).toBe(0);
      expect(res.myShareCents).toBe(0);

      const total = res.amounts.reduce((acc, a) => acc + a.amountCents, 0);
      expect(total).toBe(2);
    });
  });

  describe("PERCENT mode", () => {
    it("calcula percentuais 33/33/34 sem dono com resto nas maiores", () => {
      // R$ 100,00 dividido em 33%, 33%, 34%
      const res = computeSplit(
        10000,
        "PERCENT",
        [
          { name: "Ana", amount: 33 },
          { name: "Beto", amount: 33 },
          { name: "Caio", amount: 34 },
        ],
        false,
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.amounts[0].amountCents).toBe(3300);
      expect(res.amounts[1].amountCents).toBe(3300);
      expect(res.amounts[2].amountCents).toBe(3400);
      expect(res.myShareCents).toBe(0);
    });

    it("aplica resto na maior porcentagem quando sobram centavos", () => {
      // R$ 1,01 dividido em 33%, 33%, 34%
      // 101 * 33% = 33,33 (base 33)
      // 101 * 33% = 33,33 (base 33)
      // 101 * 34% = 34,34 (base 34)
      // Base total = 100, resto = 1 centavo -> vai para Caio (maior porcentagem)
      const res = computeSplit(
        101,
        "PERCENT",
        [
          { name: "Ana", amount: 33 },
          { name: "Beto", amount: 33 },
          { name: "Caio", amount: 34 },
        ],
        false,
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.amounts[0].amountCents).toBe(33);
      expect(res.amounts[1].amountCents).toBe(33);
      expect(res.amounts[2].amountCents).toBe(35); // recebeu o resto de 1 centavo
      expect(res.amounts.reduce((acc, a) => acc + a.amountCents, 0)).toBe(101);
    });

    it("funciona com basis points (3300, 3300, 3400)", () => {
      const res = computeSplit(
        10000,
        "PERCENT",
        [
          { name: "Ana", basisPoints: 3300 },
          { name: "Beto", basisPoints: 3300 },
          { name: "Caio", basisPoints: 3400 },
        ],
        false,
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.amounts[2].amountCents).toBe(3400);
    });

    it("percentuais decimais 33,33 / 33,33 / 33,34 usando basis points 3333 / 3333 / 3334 (soma = 10000 exatamente) sem perder 1bp por float", () => {
      const res = computeSplit(
        10000,
        "PERCENT",
        [
          { name: "Ana", basisPoints: 3333 },
          { name: "Beto", basisPoints: 3333 },
          { name: "Caio", basisPoints: 3334 },
        ],
        false,
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.amounts[0].amountCents).toBe(3333);
      expect(res.amounts[1].amountCents).toBe(3333);
      expect(res.amounts[2].amountCents).toBe(3334);
      expect(res.myShareCents).toBe(0);

      const total = res.amounts.reduce((acc, a) => acc + a.amountCents, 0);
      expect(total).toBe(10000);
    });

    it("calcula com dono incluído e resto de porcentagem para o dono", () => {
      // Outros somam 66% (33% + 33%), dono fica com 34%
      const res = computeSplit(
        10000,
        "PERCENT",
        [
          { name: "Ana", amount: 33 },
          { name: "Beto", amount: 33 },
        ],
        true,
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.amounts[0].amountCents).toBe(3300);
      expect(res.amounts[1].amountCents).toBe(3300);
      expect(res.myShareCents).toBe(3400);
    });

    it("rejeita soma de porcentagens diferente de 100% quando dono não participa", () => {
      const res = computeSplit(
        10000,
        "PERCENT",
        [
          { name: "Ana", amount: 30 },
          { name: "Beto", amount: 30 },
        ],
        false,
      );
      expect(res.ok).toBe(false);
    });

    it("rejeita soma de porcentagens maior que 100% com dono incluído", () => {
      const res = computeSplit(
        10000,
        "PERCENT",
        [
          { name: "Ana", amount: 60 },
          { name: "Beto", amount: 50 },
        ],
        true,
      );
      expect(res.ok).toBe(false);
    });
  });

  describe("VALUE mode", () => {
    it("divide valores manuais válidos com dono incluído", () => {
      const res = computeSplit(
        10000,
        "VALUE",
        [
          { name: "Ana", amount: 4000 },
          { name: "Beto", amount: 3500 },
        ],
        true,
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.amounts[0].amountCents).toBe(4000);
      expect(res.amounts[1].amountCents).toBe(3500);
      expect(res.myShareCents).toBe(2500); // 10000 - 7500
    });

    it("rejeita manual acima do total", () => {
      const res = computeSplit(
        10000,
        "VALUE",
        [
          { name: "Ana", amount: 6000 },
          { name: "Beto", amount: 5000 },
        ],
        true,
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/ultrapassar o valor total/i);
      }
    });

    it("rejeita soma manual diferente do total quando dono não incluído", () => {
      const res = computeSplit(
        10000,
        "VALUE",
        [
          { name: "Ana", amount: 4000 },
          { name: "Beto", amount: 4000 },
        ],
        false,
      );

      expect(res.ok).toBe(false);
    });
  });

  describe("validações gerais (vazio e duplicado)", () => {
    it("rejeita total zero ou negativo", () => {
      const resZero = computeSplit(0, "EQUAL", [{ name: "Ana" }], true);
      expect(resZero.ok).toBe(false);

      const resNeg = computeSplit(-500, "EQUAL", [{ name: "Ana" }], true);
      expect(resNeg.ok).toBe(false);
    });

    it("rejeita lista de pessoas vazia", () => {
      const res = computeSplit(10000, "EQUAL", [], true);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/ao menos uma pessoa/i);
      }
    });

    it("rejeita pessoa com nome vazio ou só espaços", () => {
      const resEmpty = computeSplit(10000, "EQUAL", [{ name: "" }], true);
      expect(resEmpty.ok).toBe(false);

      const resSpaces = computeSplit(10000, "EQUAL", [{ name: "   " }], true);
      expect(resSpaces.ok).toBe(false);
    });

    it("rejeita nomes duplicados case-insensitive", () => {
      const res = computeSplit(
        10000,
        "EQUAL",
        [{ name: "João Carlos" }, { name: "joão carlos" }],
        true,
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/duplicado/i);
      }
    });

    it("rejeita mais de 20 pessoas", () => {
      const many = Array.from({ length: 21 }, (_, i) => ({ name: `Pessoa ${i + 1}` }));
      const res = computeSplit(10000, "EQUAL", many, true);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/20 pessoas/i);
      }
    });
  });
});
