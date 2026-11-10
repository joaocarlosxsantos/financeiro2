import { describe, expect, it } from "vitest";
import { allocateGroupExpense, calculateGroupBalances, canSettle } from "./shared-balances";

const members = [{ memberId: "ana", name: "Ana" }, { memberId: "bia", name: "Bia" }, { memberId: "rui", name: "Rui" }];

describe("rateio do grupo", () => {
  it("reaproveita a divisão em centavos sem perder o resto", () => {
    expect(allocateGroupExpense(100, "EQUAL", members)).toEqual({ ok: true, shares: [
      { memberId: "ana", amountCents: 34 }, { memberId: "bia", amountCents: 33 }, { memberId: "rui", amountCents: 33 },
    ] });
  });

  it("aceita valores exatos e rejeita soma incorreta, fração e participante repetido", () => {
    const custom = [{ ...members[0], amountCents: 30 }, { ...members[1], amountCents: 70 }];
    expect(allocateGroupExpense(100, "VALUE", custom).ok).toBe(true);
    expect(allocateGroupExpense(101, "VALUE", custom).ok).toBe(false);
    expect(allocateGroupExpense(100, "VALUE", [{ ...custom[0], amountCents: 30.5 }, custom[1]]).ok).toBe(false);
    expect(allocateGroupExpense(100, "EQUAL", [members[0], members[0]]).ok).toBe(false);
  });
});

describe("saldo e acerto", () => {
  const expense = { payerId: "ana", amountCents: 100, shares: [{ memberId: "ana", amountCents: 40 }, { memberId: "bia", amountCents: 60 }] };
  const ids = members.map((member) => member.memberId);
  it("credita quem pagou e desconta a cota de cada participante", () => {
    const ledger = calculateGroupBalances(ids, [expense], []);
    expect(ledger.balances).toEqual([{ memberId: "ana", balanceCents: 60 }, { memberId: "bia", balanceCents: -60 }, { memberId: "rui", balanceCents: 0 }]);
    expect(ledger.debts).toEqual([{ fromId: "bia", toId: "ana", amountCents: 60 }]);
  });

  it("abate acerto parcial e zera após quitação", () => {
    const ledger = calculateGroupBalances(ids, [expense], [{ fromId: "bia", toId: "ana", amountCents: 20 }]);
    expect(ledger.debts).toEqual([{ fromId: "bia", toId: "ana", amountCents: 40 }]);
    expect(canSettle(ledger.debts, { fromId: "bia", toId: "ana", amountCents: 41 })).toBe(false);
    expect(canSettle(ledger.debts, { fromId: "ana", toId: "bia", amountCents: 1 })).toBe(false);
    expect(canSettle(ledger.debts, { fromId: "bia", toId: "ana", amountCents: 40 })).toBe(true);
    expect(calculateGroupBalances(ids, [expense], [{ fromId: "bia", toId: "ana", amountCents: 60 }]).debts).toEqual([]);
  });

  it("compensa despesas de vários pagadores mantendo saldo total zero", () => {
    const ledger = calculateGroupBalances(ids, [expense, { payerId: "bia", amountCents: 50, shares: [{ memberId: "rui", amountCents: 50 }] }], []);
    expect(ledger.balances.reduce((sum, row) => sum + row.balanceCents, 0)).toBe(0);
    expect(ledger.debts).toEqual([{ fromId: "bia", toId: "ana", amountCents: 10 }, { fromId: "rui", toId: "ana", amountCents: 50 }]);
  });

  it("recusa participante de fora e rateio inconsistente", () => {
    expect(() => calculateGroupBalances(ids, [expense], [{ fromId: "fora", toId: "ana", amountCents: 20 }])).toThrow();
    expect(() => calculateGroupBalances(ids, [{ ...expense, amountCents: 101 }], [])).toThrow();
  });
});
