import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { insert: vi.fn() } }));

import { alertDedupeKey, claimAlertDedupe, filterProactiveAlerts } from "./alerts";
import type { InsightData, InsightWindow } from "./insights";

describe("Alertas proativos e deduplicação (F15)", () => {
  it("alertDedupeKey gera chave <= 13 caracteres determinista", () => {
    const k1 = alertDedupeKey("inv:card-1:3:2026-11-14");
    const k2 = alertDedupeKey("inv:card-1:3:2026-11-14");
    const k3 = alertDedupeKey("inv:card-2:3:2026-11-14");

    expect(k1).toHaveLength(13);
    expect(k1.startsWith("a")).toBe(true);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it("claimAlertDedupe registra primeira tentativa e ignora duplicatas", async () => {
    const registered = new Set<string>();
    const fakeInsert = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((val: { userId: string; windowKey: string }) => ({
        onConflictDoNothing: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockImplementation(() => {
            const composite = `${val.userId}:${val.windowKey}`;
            if (registered.has(composite)) return [];
            registered.add(composite);
            return [{ id: "delivery-id" }];
          }),
        })),
      })),
    }));

    const mockDb = { insert: fakeInsert } as unknown as Parameters<typeof claimAlertDedupe>[2];

    const first = await claimAlertDedupe("user-1", "bill:aluguel:1:2026-11-12", mockDb);
    expect(first).toBe(true);

    // Segunda tentativa na mesma chave para o mesmo usuário deve retornar false (idempotência)
    const second = await claimAlertDedupe("user-1", "bill:aluguel:1:2026-11-12", mockDb);
    expect(second).toBe(false);

    // Outro usuário com a mesma chave deve ser permitido (isolamento)
    const otherUser = await claimAlertDedupe("user-2", "bill:aluguel:1:2026-11-12", mockDb);
    expect(otherUser).toBe(true);
  });

  it("filterProactiveAlerts remove itens já enviados anteriormente", async () => {
    const sentKeys = new Set<string>();
    const fakeInsert = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((val: { userId: string; windowKey: string }) => ({
        onConflictDoNothing: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockImplementation(() => {
            if (sentKeys.has(val.windowKey)) return [];
            sentKeys.add(val.windowKey);
            return [{ id: "del-id" }];
          }),
        })),
      })),
    }));
    const mockDb = { insert: fakeInsert } as unknown as Parameters<typeof claimAlertDedupe>[2];

    const window: InsightWindow = { key: "2026-11-10:08", day: "2026-11-10", hour: 8 };
    const rawData: InsightData = {
      summaryDay: "2026-11-10",
      incomeCents: 100000,
      expenseCents: 50000,
      categories: [],
      due: [
        { name: "Internet", date: "2026-11-10", totalCents: 12000, diffDays: 0 },
        { name: "Aluguel", date: "2026-11-11", totalCents: 150000, diffDays: 1 },
      ],
      budgets: [
        { id: "cat-1", name: "Alimentação", limitCents: 100000, spentCents: 85000, pct: 85 },
        { id: "cat-2", name: "Lazer", limitCents: 50000, spentCents: 55000, pct: 110 },
      ],
      cardInvoices: [
        { id: "card-1", cardName: "Nubank", invoiceCents: 120000, dueDate: "13/11", diffDays: 3 },
      ],
      forecast: {
        balanceCents: -35000,
        projectedExpenseCents: 135000,
        recommendedDailyCents: 0,
        status: "DEFICIT",
      },
    };

    // 1ª execução: todos os alertas são novos e passam
    const pass1 = await filterProactiveAlerts("user-1", rawData, window, mockDb);
    expect(pass1.due).toHaveLength(2);
    expect(pass1.budgets).toHaveLength(2);
    expect(pass1.cardInvoices).toHaveLength(1);
    expect(pass1.forecast).toBeDefined();

    // 2ª execução com os mesmos dados na mesma janela ou janela seguinte do mesmo dia:
    // os alertas deduplicados devem ser filtrados!
    const pass2 = await filterProactiveAlerts("user-1", rawData, window, mockDb);
    expect(pass2.due).toHaveLength(0);
    expect(pass2.budgets).toHaveLength(0);
    expect(pass2.cardInvoices).toHaveLength(0);
    expect(pass2.forecast).toBeUndefined();
  });
});
