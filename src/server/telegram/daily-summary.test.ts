import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

import {
  dailySummaryWindow,
  formatDailySummary,
  selectDailyInsights,
  runDailySummaryBatch,
  type DailySummaryData,
  type DailySummaryDependencies,
} from "./daily-summary";
import type { InsightData, Preferences } from "./insights";

describe("Daily Summary - formatDailySummary", () => {
  const sampleData: DailySummaryData = {
    dayLabel: "11/11",
    accounts: {
      totalAvailableCents: 345020,
    },
    yesterdayMovements: {
      incomeCents: 50000,
      expenseCents: 12050,
      hasMovements: true,
    },
    cards: [
      {
        id: "c1",
        name: "Nubank Final 1234",
        invoiceCents: 85000,
        availableLimitCents: 385000,
        totalLimitCents: 500000,
        dueDay: 25,
        recentPurchases: [],
      },
      {
        id: "c2",
        name: "Itaú",
        invoiceCents: 42000,
        availableLimitCents: 158000,
        dueDay: 10,
        recentPurchases: [],
      },
    ],
    insights: [
      "Conta a vencer hoje: Internet Fibra (R$ 99,90)",
      "Orçamento de Alimentação atingiu 85% (R$ 850,00 de R$ 1.000,00)",
      "Cota de hoje: você pode gastar até R$ 85,00 para fechar o mês no azul",
    ],
  };

  it("formata a mensagem com as 3 seções completas (CONTA, CARTÃO, INSIGHTS)", () => {
    const text = formatDailySummary(sampleData);

    expect(text).toContain("Mutano Contas — Resumo do Dia (11/11)");
    // Seção CONTA
    expect(text).toContain("💰 *CONTA*");
    expect(text).toContain("Saldo total disponível: R$ 3.450,20");
    expect(text).toContain("Ontem: entradas R$ 500,00 · saídas R$ 120,50");

    // Seção CARTÃO
    expect(text).toContain("💳 *CARTÃO*");
    expect(text).toContain("Nubank Final 1234");
    expect(text).toContain("Fatura R$ 850,00");
    expect(text).toContain("Limite: R$ 1.150,00 usado / R$ 3.850,00 disponível");
    expect(text).toContain("Vence dia 25");

    expect(text).toContain("Itaú");
    expect(text).toContain("Fatura R$ 420,00");
    expect(text).toContain("Limite disponível: R$ 1.580,00");
    expect(text).toContain("Vence dia 10");

    // Seção INSIGHTS
    expect(text).toContain("💡 *INSIGHTS DO DIA*");
    expect(text).toContain("Conta a vencer hoje: Internet Fibra (R$ 99,90)");
    expect(text).toContain("Orçamento de Alimentação atingiu 85%");
    expect(text).toContain("Cota de hoje: você pode gastar até R$ 85,00");

    // Rodapé
    expect(text).toContain("/pausar");
  });

  it("trata ausência de movimentações no dia anterior", () => {
    const dataWithoutMovements: DailySummaryData = {
      ...sampleData,
      yesterdayMovements: {
        incomeCents: 0,
        expenseCents: 0,
        hasMovements: false,
      },
    };
    const text = formatDailySummary(dataWithoutMovements);
    expect(text).toContain("Ontem: sem movimentações registradas");
  });

  it("indica saldo parcial quando uma integração externa estiver pendente", () => {
    const dataIncomplete: DailySummaryData = {
      ...sampleData,
      accounts: {
        totalAvailableCents: 150000,
        incomplete: true,
      },
    };
    const text = formatDailySummary(dataIncomplete);
    expect(text).toContain("Saldo total disponível: R$ 1.500,00 (parcial)");
  });

  it("trata usuário sem cartões de crédito cadastrados", () => {
    const dataNoCards: DailySummaryData = {
      ...sampleData,
      cards: [],
    };
    const text = formatDailySummary(dataNoCards);
    expect(text).toContain("• Nenhum cartão de crédito cadastrado");
  });

  it("trata ausência de insights exibindo mensagem amigável", () => {
    const dataNoInsights: DailySummaryData = {
      ...sampleData,
      insights: [],
    };
    const text = formatDailySummary(dataNoInsights);
    expect(text).toContain("Suas contas e limites estão em dia para hoje.");
  });

  it("sanitiza caracteres de controle e limita tamanho", () => {
    const maliciousData: DailySummaryData = {
      ...sampleData,
      cards: [
        {
          id: "c-bad",
          name: "Cartão\nCom\rQuebra\t1234567890123456",
          invoiceCents: 1000,
          recentPurchases: [],
        },
      ],
      insights: ["Aviso\n\rcom quebras de linha estranhas"],
    };
    const text = formatDailySummary(maliciousData);
    expect(text).not.toContain("1234567890123456");
    expect(text).toContain("Final 3456");
    expect(text.length).toBeLessThan(3800);
  });
});

describe("Daily Summary - selectDailyInsights", () => {
  it("seleciona até 3 insights priorizando contas, faturas e orçamentos", () => {
    const rawData: InsightData = {
      summaryDay: "11/11/2026",
      incomeCents: 100000,
      expenseCents: 50000,
      categories: [],
      due: [
        { name: "Energia Elétrica", totalCents: 18500, date: "11/11/2026", diffDays: 0 },
        { name: "Internet", totalCents: 9990, date: "12/11/2026", diffDays: 1 },
      ],
      cardInvoices: [
        { id: "ci1", cardName: "Nubank", invoiceCents: 85000, dueDate: "14/11", diffDays: 3 },
      ],
      budgets: [
        { name: "Alimentação", spentCents: 95000, limitCents: 100000, pct: 95 },
      ],
    };

    const insights = selectDailyInsights(rawData, 5000);
    expect(insights).toHaveLength(3);
    expect(insights[0]).toContain("Conta a vencer hoje: Energia Elétrica (R$ 185,00)");
    expect(insights[1]).toContain("Conta a vencer amanhã: Internet (R$ 99,90)");
    expect(insights[2]).toContain("Fatura do Nubank vence em 3 dias (R$ 850,00)");
  });

  it("inclui aviso de saldo previsto negativo quando presente", () => {
    const rawData: InsightData = {
      summaryDay: "11/11/2026",
      incomeCents: 100000,
      expenseCents: 150000,
      categories: [],
      due: [],
      budgets: [],
      forecast: {
        balanceCents: -50000,
      },
    };

    const insights = selectDailyInsights(rawData);
    expect(insights.some((i) => i.includes("Previsão de saldo negativo para o fim do mês:") && i.includes("500,00"))).toBe(true);
  });

  it("adiciona cota diária se houver menos de 3 insights", () => {
    const rawData: InsightData = {
      summaryDay: "11/11/2026",
      incomeCents: 100000,
      expenseCents: 10000,
      categories: [],
      due: [
        { name: "Aluguel", totalCents: 150000, date: "11/11/2026", diffDays: 0 },
      ],
      budgets: [],
    };

    const insights = selectDailyInsights(rawData, 7500);
    expect(insights).toHaveLength(2);
    expect(insights[0]).toContain("Conta a vencer hoje: Aluguel");
    expect(insights[1]).toContain("Cota de hoje: você pode gastar até R$ 75,00");
  });
});

describe("Daily Summary - dailySummaryWindow", () => {
  it("gera chave com no máximo 13 caracteres para compatibilidade com o schema varchar(13)", () => {
    const now = new Date("2026-11-11T11:00:00Z"); // 08:00 em SP
    const window = dailySummaryWindow(now);
    expect(window).not.toBeNull();
    expect(window?.key).toBe("2026-11-11:ds");
    expect(window?.key.length).toBeLessThanOrEqual(13);
  });

  it("retorna null se executado fora da janela comercial (de madrugada)", () => {
    const earlyMorning = new Date("2026-11-11T05:00:00Z"); // 02:00 em SP
    expect(dailySummaryWindow(earlyMorning)).toBeNull();
  });
});

describe("Daily Summary - runDailySummaryBatch", () => {
  const basePrefs: Preferences = {
    enabled: true,
    hours: [8, 14, 20],
    summary: true,
    spending: true,
    dueBills: true,
    budget: true,
    cardInvoice: true,
    negativeForecast: true,
  };

  it("respeita opt-out e não envia para usuários com enabled: false ou summary: false", async () => {
    const candidates = vi.fn().mockResolvedValue([
      { userId: "u1", chatId: "c1", prefs: { ...basePrefs, enabled: false } },
      { userId: "u2", chatId: "c2", prefs: { ...basePrefs, summary: false } },
    ]);
    const send = vi.fn();
    const claim = vi.fn();
    const finish = vi.fn();
    const render = vi.fn();

    const deps: DailySummaryDependencies = { candidates, send, claim, finish, render };
    const res = await runDailySummaryBatch({ key: "2026-11-11:ds", day: "2026-11-11" }, deps);

    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(2);
    expect(claim).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("envia com sucesso para usuários elegíveis e registra status SENT", async () => {
    const candidates = vi.fn()
      .mockResolvedValueOnce([
        { userId: "u1", chatId: "c1", prefs: basePrefs },
      ])
      .mockResolvedValueOnce([]);

    const claim = vi.fn().mockResolvedValue(true);
    const render = vi.fn().mockResolvedValue("Resumo renderizado para u1");
    const send = vi.fn().mockResolvedValue(undefined);
    const finish = vi.fn().mockResolvedValue(undefined);

    const deps: DailySummaryDependencies = { candidates, send, claim, finish, render };
    const res = await runDailySummaryBatch({ key: "2026-11-11:ds", day: "2026-11-11" }, deps);

    expect(res.sent).toBe(1);
    expect(res.failed).toBe(0);
    expect(claim).toHaveBeenCalledWith("u1", "2026-11-11:ds");
    expect(send).toHaveBeenCalledWith("c1", "Resumo renderizado para u1");
    expect(finish).toHaveBeenCalledWith("u1", "2026-11-11:ds", "SENT");
  });

  it("isola falhas: erro de envio em um usuário não impede envio para os demais", async () => {
    const candidates = vi.fn()
      .mockResolvedValueOnce([
        { userId: "u1", chatId: "c1-fail", prefs: basePrefs },
        { userId: "u2", chatId: "c2-ok", prefs: basePrefs },
      ])
      .mockResolvedValueOnce([]);

    const claim = vi.fn().mockResolvedValue(true);
    const render = vi.fn().mockResolvedValue("Resumo OK");
    const send = vi.fn().mockImplementation(async (chatId: string) => {
      if (chatId === "c1-fail") throw new Error("Telegram API error 403 Forbidden");
    });
    const finish = vi.fn().mockResolvedValue(undefined);

    const deps: DailySummaryDependencies = { candidates, send, claim, finish, render };
    const res = await runDailySummaryBatch({ key: "2026-11-11:ds", day: "2026-11-11" }, deps);

    expect(res.sent).toBe(1);
    expect(res.failed).toBe(1);
    expect(finish).toHaveBeenCalledWith("u1", "2026-11-11:ds", "FAILED");
    expect(finish).toHaveBeenCalledWith("u2", "2026-11-11:ds", "SENT");
  });

  it("respeita idempotência atômica: se claim retornar false, pula o envio", async () => {
    const candidates = vi.fn()
      .mockResolvedValueOnce([
        { userId: "u1", chatId: "c1", prefs: basePrefs },
      ])
      .mockResolvedValueOnce([]);

    const claim = vi.fn().mockResolvedValue(false); // Já foi claimed por outro processo
    const send = vi.fn();
    const render = vi.fn();
    const finish = vi.fn();

    const deps: DailySummaryDependencies = { candidates, send, claim, finish, render };
    const res = await runDailySummaryBatch({ key: "2026-11-11:ds", day: "2026-11-11" }, deps);

    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("Daily Summary - Route Handler GET /api/cron/daily-summary", () => {
  const originalEnv = { ...process.env };

  it("retorna 503 se CRON_SECRET não estiver configurado no servidor", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/daily-summary/route");
    const req = new Request("https://app.test/api/cron/daily-summary", {
      headers: { Authorization: "Bearer any-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "unavailable" });
  });

  it("retorna 401 se a autorização estiver ausente ou incorreta", async () => {
    process.env.CRON_SECRET = "super-secret-token";
    const { GET } = await import("@/app/api/cron/daily-summary/route");

    // Sem header
    const reqNoAuth = new Request("https://app.test/api/cron/daily-summary");
    const resNoAuth = await GET(reqNoAuth);
    expect(resNoAuth.status).toBe(401);

    // Header errado
    const reqBadAuth = new Request("https://app.test/api/cron/daily-summary", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    const resBadAuth = await GET(reqBadAuth);
    expect(resBadAuth.status).toBe(401);

    process.env = { ...originalEnv };
  });
});

