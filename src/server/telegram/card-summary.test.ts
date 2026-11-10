import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: () => {
      throw new Error("Must provide connection in tests");
    },
  },
}));

import {
  formatCardSummary,
  loadCardSummary,
  sanitizeCardName,
  sanitizePurchaseDescription,
  type CardSummaryData,
} from "./card-summary";

describe("card-summary (TDD para /cartao)", () => {
  it("sem cartão cadastrado retorna mensagem amigável", () => {
    const text = formatCardSummary([]);
    expect(text).toContain("Nenhum cartão de crédito cadastrado");
    expect(text).toContain("Contas");
  });

  it("formata bloco de cartão com fatura atual, limite disponível e últimas 5 compras", () => {
    const cards: CardSummaryData[] = [
      {
        id: "card-1",
        name: "Nubank Roxinho",
        invoiceCents: 45050, // R$ 450,50
        invoiceRef: "2026-11",
        dueDay: 10,
        availableLimitCents: 250000, // R$ 2.500,00
        totalLimitCents: 500000,
        recentPurchases: [
          { description: "Supermercado Extra", amountCents: 15000, date: new Date("2026-11-08T12:00Z") },
          { description: "Farmácia Droga Raia", amountCents: 4590, date: new Date("2026-11-07T12:00Z") },
          { description: "Posto Shell Combustível", amountCents: 20000, date: new Date("2026-11-05T12:00Z") },
          { description: "iFood Restaurante", amountCents: 3500, date: new Date("2026-11-04T12:00Z") },
          { description: "Cafeteria Grão", amountCents: 1960, date: new Date("2026-11-02T12:00Z") },
        ],
      },
    ];

    const reply = formatCardSummary(cards);
    expect(reply).toContain("Nubank Roxinho");
    expect(reply).toContain("Fatura atual: R$ 450,50");
    expect(reply).toContain("Limite disponível: R$ 2.500,00");
    expect(reply).toContain("Últimas compras:");
    expect(reply).toContain("Supermercado Extra");
    expect(reply).toContain("R$ 150,00");
    expect(reply).toContain("Cafeteria Grão");
  });

  it("limita a 5 cartões na resposta e exibe blocos separados", () => {
    const cards: CardSummaryData[] = Array.from({ length: 7 }, (_, i) => ({
      id: `card-${i}`,
      name: `Cartão Banco ${i + 1}`,
      invoiceCents: (i + 1) * 10000,
      recentPurchases: [],
    }));

    const reply = formatCardSummary(cards);
    expect(reply).toContain("Cartão Banco 1");
    expect(reply).toContain("Cartão Banco 5");
    expect(reply).not.toContain("Cartão Banco 6"); // limite de 5 cartões
  });

  it("sanitiza nome do cartão e máscara números longos além de 4 dígitos", () => {
    expect(sanitizeCardName("Cartão 1234 5678 9876 5432")).toBe("Cartão Final 5432");
    expect(sanitizeCardName("Nubank Final 4321")).toBe("Nubank Final 4321");
    expect(sanitizeCardName("Itaú Click\n\tMalicioso")).toBe("Itaú Click Malicioso");
  });

  it("escapa caracteres de controle e quebras de linha em descrições de compras", () => {
    const clean = sanitizePurchaseDescription("Mercado Livre\n\r/start token=xyz\tTentativa");
    expect(clean).not.toContain("\n");
    expect(clean).not.toContain("\r");
    expect(clean).not.toContain("\t");
    expect(clean).toContain("Mercado Livre");
  });

  it("trata cartão sem compras recentes e sem limite configurado de forma amigável", () => {
    const cards: CardSummaryData[] = [
      {
        id: "card-empty",
        name: "Cartão Inter",
        invoiceCents: 0,
        recentPurchases: [],
      },
    ];

    const reply = formatCardSummary(cards);
    expect(reply).toContain("Cartão Inter");
    expect(reply).toContain("Fatura atual: R$ 0,00");
    expect(reply).toContain("Limite disponível: não informado");
    expect(reply).toContain("Nenhuma compra recente registrada");
  });

  describe("loadCardSummary (queries com mock de conexão e escopo)", () => {
    it("sem cartões retorna mensagem amigável", async () => {
      const mockConn = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };

      const result = await loadCardSummary(
        "user-test-1",
        mockConn as unknown as Parameters<typeof loadCardSummary>[1],
      );
      expect(result).toContain("Nenhum cartão de crédito cadastrado");
      expect(mockConn.select).toHaveBeenCalledTimes(1);
    });

    it("carrega dados do cartão, fatura, limite disponível e últimas 5 compras com escopo do usuário", async () => {
      const capturedWheres: unknown[] = [];
      let selectCallCount = 0;

      const mockConn = {
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const currentCall = selectCallCount;

          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation((whereClause) => {
                capturedWheres.push(whereClause);

                return {
                  limit: vi.fn().mockImplementation(() => {
                    if (currentCall === 1) {
                      // Busca cartões
                      return Promise.resolve([
                        {
                          id: "card-99",
                          name: "Mastercard Platinum 1234 5678 9012 3456",
                          closingDay: 20,
                          dueDay: 28,
                          creditLimitCents: 500000,
                          availableCreditCents: null,
                        },
                      ]);
                    }
                    if (currentCall === 2) {
                      // Busca fatura Open Finance (não encontra)
                      return Promise.resolve([]);
                    }
                    return Promise.resolve([]);
                  }),
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockImplementation(() => {
                      // Call 4: últimas compras
                      return Promise.resolve([
                        { description: "Posto Ipiranga", amountCents: 12000, date: new Date("2026-11-09T10:00Z") },
                        { description: "Padaria Pão Quente\n", amountCents: 2500, date: new Date("2026-11-08T09:00Z") },
                      ]);
                    }),
                  }),
                  then: vi.fn().mockImplementation((resolve) => {
                    // Call 3: soma das transações da fatura
                    return Promise.resolve([{ total: 14500 }]).then(resolve);
                  }),
                };
              }),
            }),
          };
        }),
      };

      const result = await loadCardSummary(
        "user-owner-123",
        mockConn as unknown as Parameters<typeof loadCardSummary>[1],
        new Date("2026-11-10T12:00Z"),
      );

      expect(result).toContain("Mastercard Platinum Final 3456");
      expect(result).toContain("Fatura atual: R$ 145,00");
      // Limite total 500000 - 14500 = 485500 (R$ 4.855,00)
      expect(result).toContain("Limite disponível: R$ 4.855,00");
      expect(result).toContain("Posto Ipiranga");
      expect(result).toContain("Padaria Pão Quente");
      expect(result).not.toContain("\nPadaria");

      expect(capturedWheres.length).toBeGreaterThanOrEqual(1);
    });
  });
});
