import { describe, it, expect } from "vitest";
import { buildBackup } from "./backup";

describe("buildBackup", () => {
  it("removes passwordHash from user", () => {
    const backup = buildBackup({
      user: [
        {
          id: "user1",
          name: "João Silva",
          email: "joao@example.com",
          passwordHash: "secret-hash-should-not-appear",
          monthlyIncomeCents: 500000,
          emergencyMonths: 6,
          savingsTargetPct: 20,
        },
      ],
      accounts: [],
      categories: [],
      transactions: [],
      goals: [],
      goalContributions: [],
      debts: [],
      debtPayments: [],
      budgets: [],
      recurringRules: [],
      bills: [],
      billParticipants: [],
      billGroupings: [],
      transactionSplits: [],
    });

    expect(backup.user).not.toHaveProperty("passwordHash");
    expect(backup.user.name).toBe("João Silva");
    expect(backup.user.email).toBe("joao@example.com");
  });

  it("sets version to 1", () => {
    const backup = buildBackup({
      user: [
        {
          id: "user1",
          name: "Test",
          email: "test@example.com",
          passwordHash: "hash",
          monthlyIncomeCents: 0,
          emergencyMonths: 6,
          savingsTargetPct: 20,
        },
      ],
      accounts: [],
      categories: [],
      transactions: [],
      goals: [],
      goalContributions: [],
      debts: [],
      debtPayments: [],
      budgets: [],
      recurringRules: [],
      bills: [],
      billParticipants: [],
      billGroupings: [],
      transactionSplits: [],
    });

    expect(backup.version).toBe(1);
  });

  it("includes all entity lists", () => {
    const backup = buildBackup({
      user: [
        {
          id: "user1",
          name: "Test",
          email: "test@example.com",
          passwordHash: "hash",
          monthlyIncomeCents: 0,
          emergencyMonths: 6,
          savingsTargetPct: 20,
        },
      ],
      accounts: [{ id: "acc1", name: "Account", type: "CHECKING", institution: null, color: "#000", openingBalanceCents: 0, archived: false }],
      categories: [{ id: "cat1", name: "Category", kind: "EXPENSE", nature: "VARIABLE", color: "#000", keywords: [], archived: false }],
      transactions: [],
      goals: [],
      goalContributions: [],
      debts: [],
      debtPayments: [],
      budgets: [],
      recurringRules: [],
      bills: [],
      billParticipants: [],
      billGroupings: [],
      transactionSplits: [],
    });

    expect(backup.accounts).toHaveLength(1);
    expect(backup.categories).toHaveLength(1);
    expect(Array.isArray(backup.transactions)).toBe(true);
    expect(Array.isArray(backup.goals)).toBe(true);
    expect(Array.isArray(backup.bills)).toBe(true);
  });
});
