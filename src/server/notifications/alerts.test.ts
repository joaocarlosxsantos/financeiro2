import { describe, expect, it } from "vitest";
import { buildAlertEvents, type AlertFacts } from "./alerts-build";
import { DEFAULT_NOTIFICATION_PREFERENCES, pushPayload } from "./policy";

const day = "2026-11-12";
const empty: AlertFacts = { bills: [], cardsDue: [], cardsClosing: [], budgets: [], goals: [], syncProblem: false };
const facts = (patch: Partial<AlertFacts>): AlertFacts => ({ ...empty, ...patch });
const types = (events: ReturnType<typeof buildAlertEvents>) => events.map((event) => event.type);

describe("deterministic notification alerts", () => {
  it("contas: avisa D-3, D-0 e D+1, ignora o resto e usa o deep link de contas a pagar", () => {
    const events = buildAlertEvents("owner", facts({ bills: [
      { id: "b1", name: "Aluguel", totalCents: 150000, dueDate: "2026-11-12", diffDays: 0 },
      { id: "b2", name: "Luz", totalCents: 9500, dueDate: "2026-11-15", diffDays: 3 },
      { id: "b3", name: "Internet", totalCents: 12000, dueDate: "2026-11-11", diffDays: -1 },
      { id: "b4", name: "Fora da janela", totalCents: 100, dueDate: "2026-11-13", diffDays: 1 },
      { id: "b5", name: "Muito atrasada", totalCents: 100, dueDate: "2026-11-09", diffDays: -3 },
    ] }), day);

    expect(types(events)).toEqual(["BILL_OVERDUE_D1", "DUE_BILL_TODAY", "DUE_BILL_D3"]);
    expect(events.every((event) => event.category === "dueBills" && event.actionUrl === "/contas-a-pagar")).toBe(true);
    expect(events[1].body).toContain("Aluguel");
    expect(events[1].body).toContain("R$ 1.500,00");
    expect(events[2].body).toContain("3 dias");
  });

  it("orçamento: 80% alerta, 100% estoura e cada categoria só dispara uma vez por mês", () => {
    const events = buildAlertEvents("owner", facts({ budgets: [
      { id: "budget-a", name: "Lazer", spentCents: 62000, limitCents: 50000 },
      { id: "budget-b", name: "Transporte", spentCents: 42000, limitCents: 50000 },
      { id: "budget-c", name: "Saúde", spentCents: 10000, limitCents: 50000 },
    ] }), day);

    expect(types(events)).toEqual(["BUDGET_EXCEEDED", "BUDGET_WARNING_80"]);
    expect(events[0].body).toContain("Lazer, 124%");
    expect(events[1].body).toContain("Transporte, 84%");
    expect(events[0].dedupeKey).toBe("budget:budget-a:100:2026-11");
    expect(events[1].dedupeKey).toBe("budget:budget-b:80:2026-11");
    expect(buildAlertEvents("owner", facts({ budgets: [] }), day)).toEqual([]);
  });

  it("faturas: fechamento e vencimento com tipos e datas de dedupe distintas", () => {
    const events = buildAlertEvents("owner", facts({
      cardsDue: [
        { id: "card", cardName: "Nubank", invoiceCents: 85000, date: "2026-11-12", diffDays: 0 },
        { id: "card", cardName: "Nubank", invoiceCents: 85000, date: "2026-11-13", diffDays: 1 },
        { id: "card", cardName: "Nubank", invoiceCents: 85000, date: "2026-11-15", diffDays: 3 },
      ],
      cardsClosing: [
        { id: "card", cardName: "Nubank", date: "2026-11-12", diffDays: 0 },
        { id: "card", cardName: "Nubank", date: "2026-11-13", diffDays: 1 },
      ],
    }), day);

    expect(types(events).filter((type) => type === "CARD_INVOICE_DUE")).toHaveLength(3);
    expect(types(events).filter((type) => type === "CARD_INVOICE_CLOSING")).toHaveLength(2);
    expect(events.every((event) => event.actionUrl === "/contas")).toBe(true);
    expect(new Set(events.map((event) => event.dedupeKey)).size).toBe(events.length);
  });

  it("metas: avisa quando atinge o alvo e quando o prazo passou sem concluir", () => {
    const events = buildAlertEvents("owner", facts({ goals: [
      { id: "g1", name: "Reserva", savedCents: 500000, targetCents: 500000, targetDate: "2027-01-01" },
      { id: "g2", name: "Viagem", savedCents: 200000, targetCents: 800000, targetDate: "2026-11-01" },
      { id: "g3", name: "Notebook", savedCents: 100000, targetCents: 400000, targetDate: "2027-06-01" },
    ] }), day);

    expect(types(events)).toEqual(["GOAL_LATE", "GOAL_REACHED"]);
    expect(events[0].body).toContain("Viagem");
    expect(events[0].body).toContain("01/11");
    expect(events[1].body).toContain("Reserva");
    expect(events.every((event) => event.actionUrl === "/metas" && event.category === "goals")).toBe(true);
  });

  it("sync Pluggy é genérico, diário e leva às conexões", () => {
    const events = buildAlertEvents("owner", facts({ syncProblem: true }), day);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: "syncAlerts", type: "SYNC_PROBLEM", actionUrl: "/configuracoes/integracao", dedupeKey: `sync:${day}` });
    expect(events[0].body).not.toMatch(/token|senha|conta|agência|banco do/i);
  });

  it("nome hostil/ longo é limpo e não vaza link no texto", () => {
    const events = buildAlertEvents("owner", facts({ bills: [
      { id: "b1", name: "Conta\nhttps://evil.test/segredo", totalCents: 1000, dueDate: day, diffDays: 0 },
    ] }), day);
    expect(events[0].body).not.toContain("http");
    expect(events[0].body).not.toContain("\n");
    expect(events[0].body).not.toContain("segredo");
  });

  it("preserva todas as contas no app e mantém as dedupeKeys únicas", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ id: `b${index}`, name: `Conta ${index}`, totalCents: 1000, dueDate: day, diffDays: 0 }));
    const events = buildAlertEvents("owner", facts({ bills: many }), day);
    expect(events).toHaveLength(12);
    expect(new Set(events.map((event) => event.dedupeKey)).size).toBe(12);
    expect(events.every(e => e.critical)).toBe(true);
  });

  it("push usa o título fixo e o modo discreto esconde valores financeiros", () => {
    const [event] = buildAlertEvents("owner", facts({ bills: [{ id: "b1", name: "Aluguel", totalCents: 150000, dueDate: day, diffDays: 0 }] }), day);
    expect(pushPayload(event, DEFAULT_NOTIFICATION_PREFERENCES, "id").title).toBe("Mutano Contas");
    expect(pushPayload(event, { ...DEFAULT_NOTIFICATION_PREFERENCES, discretePushMode: true }, "id").body).not.toContain("1.500");
  });
});
