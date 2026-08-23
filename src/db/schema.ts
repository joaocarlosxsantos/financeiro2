/**
 * Financeiro 2.0 — schema do banco (Drizzle ORM / Postgres).
 *
 * Regra de ouro: todo valor monetário é armazenado em CENTAVOS (integer).
 * Isso evita erro de arredondamento de float e problema de serialização
 * de Decimal entre Server e Client Components.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createId } from "@/lib/id";

// ---------------------------------------------------------------- enums

export const categoryKind = pgEnum("category_kind", ["INCOME", "EXPENSE"]);
/** Gasto fixo (aluguel, escola) x variável (mercado, lazer). */
export const expenseNature = pgEnum("expense_nature", ["FIXED", "VARIABLE"]);
export const accountType = pgEnum("account_type", [
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "CASH",
  "INVESTMENT",
]);
export const goalKind = pgEnum("goal_kind", [
  "EMERGENCY_FUND",
  "PURCHASE",
  "TRIP",
  "DEBT_PAYOFF",
  "INVESTMENT",
  "CUSTOM",
]);
export const importSource = pgEnum("import_source", ["CSV", "OFX"]);
export const importStatus = pgEnum("import_status", ["PENDING", "COMMITTED", "DISCARDED"]);

// ---------------------------------------------------------------- tables

export const users = pgTable("users", {
  id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),

  /** Renda mensal líquida, em centavos. */
  monthlyIncomeCents: integer("monthly_income_cents").notNull().default(0),
  /** Quantos meses de custo de vida a reserva de emergência deve cobrir. */
  emergencyMonths: integer("emergency_months").notNull().default(6),
  /** % da renda que o usuário quer guardar por mês (0-100). */
  savingsTargetPct: integer("savings_target_pct").notNull().default(20),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: accountType("type").notNull().default("CHECKING"),
    institution: text("institution"),
    color: varchar("color", { length: 9 }).notNull().default("#6366f1"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const categories = pgTable(
  "categories",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull().default("EXPENSE"),
    nature: expenseNature("nature").notNull().default("VARIABLE"),
    color: varchar("color", { length: 9 }).notNull().default("#64748b"),
    /** Palavras-chave usadas na categorização automática das importações. */
    keywords: text("keywords").array().notNull().default([]),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    index("categories_user_idx").on(t.userId),
    uniqueIndex("categories_user_name_kind_key").on(t.userId, t.name, t.kind),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 32 })
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: varchar("category_id", { length: 32 }).references(() => categories.id, {
      onDelete: "set null",
    }),

    date: timestamp("date", { withTimezone: true }).notNull(),
    description: text("description").notNull(),
    /** Valor absoluto em centavos. O sinal vem de `kind`. */
    amountCents: integer("amount_cents").notNull(),
    kind: categoryKind("kind").notNull(),
    nature: expenseNature("nature").notNull().default("VARIABLE"),
    notes: text("notes"),

    importBatchId: varchar("import_batch_id", { length: 32 }),
    /** Hash de conta+data+valor+descrição — impede importar a mesma linha duas vezes. */
    fingerprint: text("fingerprint"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_account_idx").on(t.accountId),
    index("transactions_category_idx").on(t.categoryId),
    uniqueIndex("transactions_user_fingerprint_key").on(t.userId, t.fingerprint),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: goalKind("kind").notNull().default("CUSTOM"),
    targetCents: integer("target_cents").notNull(),
    savedCents: integer("saved_cents").notNull().default(0),
    targetDate: timestamp("target_date", { withTimezone: true }),
    color: varchar("color", { length: 9 }).notNull().default("#0ea5e9"),
    note: text("note"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    goalId: varchar("goal_id", { length: 32 })
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    /** Positivo = aporte, negativo = resgate. Em centavos. */
    deltaCents: integer("delta_cents").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [index("goal_contributions_goal_idx").on(t.goalId)],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 32 })
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    source: importSource("source").notNull(),
    status: importStatus("status").notNull().default("PENDING"),
    rowCount: integer("row_count").notNull().default(0),
    savedRows: integer("saved_rows").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_batches_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------- relations

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
  goals: many(goals),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  user: one(users, { fields: [goals.userId], references: [users.id] }),
  contributions: many(goalContributions),
}));

export const goalContributionsRelations = relations(goalContributions, ({ one }) => ({
  goal: one(goals, { fields: [goalContributions.goalId], references: [goals.id] }),
}));

export const importBatchesRelations = relations(importBatches, ({ one }) => ({
  user: one(users, { fields: [importBatches.userId], references: [users.id] }),
  account: one(accounts, { fields: [importBatches.accountId], references: [accounts.id] }),
}));

// ---------------------------------------------------------------- tipos

export type CategoryKind = (typeof categoryKind.enumValues)[number];
export type ExpenseNature = (typeof expenseNature.enumValues)[number];
export type AccountType = (typeof accountType.enumValues)[number];
export type GoalKind = (typeof goalKind.enumValues)[number];

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Goal = typeof goals.$inferSelect;
