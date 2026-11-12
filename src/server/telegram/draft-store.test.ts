import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computePayloadHash,
  createTransactionDraft,
  confirmTransactionDraft,
  undoTransactionDraft,
  cancelTransactionDraft,
} from "./draft-store";
import { telegramTransactionDrafts, transactions } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  rows: [] as unknown[][],
  events: [] as { kind: string; table?: unknown; value?: unknown }[],
}));

vi.mock("@/db", () => ({
  db: {
    transaction: mocks.transaction,
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
}));

const now = new Date("2026-11-12T15:00:00Z");
const linkCreatedAt = new Date("2026-11-10T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows.length = 0;
  mocks.events.length = 0;

  function query(kind: string, table?: unknown) {
    mocks.events.push({ kind, table });
    const result = () => Promise.resolve(mocks.rows.shift() ?? []);
    const chain: Record<string, unknown> = {
      from: (t: unknown) => { mocks.events.push({ kind: "from", table: t }); return chain; },
      where: (value: unknown) => { mocks.events.push({ kind: "where", value }); return chain; },
      for: (value: unknown) => { mocks.events.push({ kind: "lock", value }); return chain; },
      orderBy: () => chain,
      set: (value: unknown) => { mocks.events.push({ kind: "set", table, value }); return chain; },
      values: (value: unknown) => { mocks.events.push({ kind: "values", table, value }); return chain; },
      onConflictDoNothing: () => chain,
      returning: result,
      limit: result,
      then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) => result().then(resolve, reject),
    };
    return chain;
  }

  mocks.select.mockImplementation(() => query("select"));
  mocks.insert.mockImplementation((t: unknown) => query("insert", t));
  mocks.update.mockImplementation((t: unknown) => query("update", t));
  mocks.delete.mockImplementation((t: unknown) => query("delete", t));
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      select: () => query("select"),
      insert: (t: unknown) => query("insert", t),
      update: (t: unknown) => query("update", t),
      delete: (t: unknown) => query("delete", t),
    }),
  );
});

describe("draft-store: criação, confirmação e desfazer atômicos", () => {
  it("createTransactionDraft: cria rascunho PENDING para usuário com perfil manual", async () => {
    // 1. users row (usageProfile = manual)
    mocks.rows.push([{ id: "user_1", usageProfile: "manual" }]);
    // 2. accounts row
    mocks.rows.push([{ id: "acc_1", name: "Nubank", type: "CHECKING" }]);
    // 3. insert returning draft
    const expectedDraft = {
      id: "dr_test123",
      userId: "user_1",
      chatId: "123456",
      status: "PENDING",
      amountCents: 3500,
      description: "Mercado",
    };
    mocks.rows.push([expectedDraft]);

    const res = await createTransactionDraft({
      userId: "user_1",
      chatId: "123456",
      linkCreatedAt,
      updateId: 101,
      parsed: { amountCents: 3500, kind: "EXPENSE", description: "Mercado", date: "2026-11-12" },
      now,
    });

    expect(res.ok).toBe(true);
    expect(res.accountName).toBe("Nubank");
    expect(res.draft?.id).toBe("dr_test123");
  });

  it("createTransactionDraft: rejeita se perfil for integracao_total", async () => {
    mocks.rows.push([{ id: "user_1", usageProfile: "integracao_total" }]);

    const res = await createTransactionDraft({
      userId: "user_1",
      chatId: "123456",
      linkCreatedAt,
      updateId: 101,
      parsed: { amountCents: 3500, kind: "EXPENSE", description: "Mercado", date: "2026-11-12" },
      now,
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("integração automática");
  });

  it("confirmTransactionDraft: confirma rascunho com lock, cria transaction e grava hash", async () => {
    const draft = {
      id: "dr_test123",
      userId: "user_1",
      chatId: "123456",
      linkCreatedAt,
      status: "PENDING",
      accountId: "acc_1",
      amountCents: 3500,
      kind: "EXPENSE",
      nature: "VARIABLE",
      description: "Mercado",
      transactionDate: "2026-11-12",
      expiresAt: new Date(now.getTime() + 500_000),
    };

    // 1. select draft for update
    mocks.rows.push([draft]);
    // 2. select link for update
    mocks.rows.push([{ chatId: "123456", userId: "user_1", createdAt: linkCreatedAt }]);
    // 3. select user for update
    mocks.rows.push([{ usageProfile: "manual" }]);
    // 4. select account
    mocks.rows.push([{ id: "acc_1", name: "Nubank", userId: "user_1", archived: false }]);
    // 5. insert transaction
    mocks.rows.push([]);
    // 6. update draft returning
    mocks.rows.push([{ ...draft, status: "CONFIRMED" }]);

    const res = await confirmTransactionDraft({
      draftId: "dr_test123",
      chatId: "123456",
      now,
    });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("sucesso");
    const txInsert = mocks.events.find((e) => e.kind === "values" && e.table === transactions) as { value: { notes: string; amountCents: number } };
    expect(txInsert.value.notes).toBe("telegram:dr_test123");
    expect(txInsert.value.amountCents).toBe(3500);

    const draftUpdate = mocks.events.find((e) => e.kind === "set" && e.table === telegramTransactionDrafts) as { value: { status: string; confirmedPayloadHash: string } };
    expect(draftUpdate.value.status).toBe("CONFIRMED");
    expect(draftUpdate.value.confirmedPayloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("confirmTransactionDraft: rejeita rascunho expirado ou já confirmado", async () => {
    const draftExpired = {
      id: "dr_test123",
      userId: "user_1",
      chatId: "123456",
      status: "PENDING",
      expiresAt: new Date(now.getTime() - 1000),
    };
    mocks.rows.push([draftExpired]);

    const resExpired = await confirmTransactionDraft({
      draftId: "dr_test123",
      chatId: "123456",
      now,
    });
    expect(resExpired.ok).toBe(false);
    expect(resExpired.message).toContain("expirou");

    const draftConfirmed = {
      id: "dr_test123",
      userId: "user_1",
      chatId: "123456",
      status: "CONFIRMED",
      expiresAt: new Date(now.getTime() + 1000),
    };
    mocks.rows.push([draftConfirmed]);

    const resConfirmed = await confirmTransactionDraft({
      draftId: "dr_test123",
      chatId: "123456",
      now,
    });
    expect(resConfirmed.ok).toBe(false);
    expect(resConfirmed.message).toContain("anteriormente");
  });

  it("undoTransactionDraft: desfaz lançamento se não houver alteração no hash", async () => {
    const txId = "tx_123456";
    const expectedHash = computePayloadHash(txId, 3500, "EXPENSE", "acc_1", "Mercado", "2026-11-12");

    const draft = {
      id: "dr_test123",
      userId: "user_1",
      chatId: "123456",
      status: "CONFIRMED",
      transactionId: txId,
      confirmedPayloadHash: expectedHash,
      undoUntil: new Date(now.getTime() + 3600_000),
      amountCents: 3500,
      kind: "EXPENSE",
      accountId: "acc_1",
      description: "Mercado",
      transactionDate: "2026-11-12",
    };

    // 1. select draft for update
    mocks.rows.push([draft]);
    // 2. select link for update
    mocks.rows.push([{ chatId: "123456", userId: "user_1" }]);
    // 3. select transaction for update
    mocks.rows.push([{
      id: txId,
      userId: "user_1",
      accountId: "acc_1",
      amountCents: 3500,
      kind: "EXPENSE",
      description: "Mercado",
    }]);
    // 4. delete transaction
    mocks.rows.push([]);
    // 5. update draft returning
    mocks.rows.push([{ ...draft, status: "UNDONE" }]);

    const res = await undoTransactionDraft({
      draftId: "dr_test123",
      chatId: "123456",
      now,
    });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("sucesso");

    // Conferir se delete foi chamado na tabela transactions
    const deleteEvent = mocks.events.find((e) => e.kind === "delete" && e.table === transactions);
    expect(deleteEvent).toBeDefined();

    // Conferir se status do rascunho virou UNDONE
    const updateEvent = mocks.events.find((e) => e.kind === "set" && e.table === telegramTransactionDrafts) as { value: { status: string } };
    expect(updateEvent.value.status).toBe("UNDONE");
  });

  it("undoTransactionDraft: bloqueia desfazer se o lançamento foi editado no app", async () => {
    const txId = "tx_123456";
    const originalHash = computePayloadHash(txId, 3500, "EXPENSE", "acc_1", "Mercado", "2026-11-12");

    const draft = {
      id: "dr_test123",
      userId: "user_1",
      chatId: "123456",
      status: "CONFIRMED",
      transactionId: txId,
      confirmedPayloadHash: originalHash,
      undoUntil: new Date(now.getTime() + 3600_000),
      amountCents: 3500,
      kind: "EXPENSE",
      accountId: "acc_1",
      description: "Mercado",
      transactionDate: "2026-11-12",
    };

    mocks.rows.push([draft]);
    mocks.rows.push([{ chatId: "123456", userId: "user_1" }]);
    // Transaction alterada para 4000 cents
    mocks.rows.push([{
      id: txId,
      userId: "user_1",
      accountId: "acc_1",
      amountCents: 4000,
      kind: "EXPENSE",
      description: "Mercado",
    }]);

    const res = await undoTransactionDraft({
      draftId: "dr_test123",
      chatId: "123456",
      now,
    });

    expect(res.ok).toBe(false);
    expect(res.message).toContain("alterado no app");
    // Não pode ter excluído a transaction
    expect(mocks.events.some((e) => e.kind === "delete" && e.table === transactions)).toBe(false);
  });

  it("cancelTransactionDraft: cancela rascunho pendente", async () => {
    const draft = {
      id: "dr_test123",
      status: "PENDING",
    };
    mocks.rows.push([draft]);
    mocks.rows.push([{ ...draft, status: "CANCELLED" }]);

    const res = await cancelTransactionDraft({
      draftId: "dr_test123",
      chatId: "123456",
      now,
    });

    expect(res.ok).toBe(true);
    expect(res.message).toContain("cancelado");
  });
});
