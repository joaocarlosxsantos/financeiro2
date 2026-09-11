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

export const debtKind = pgEnum("debt_kind", [
  "CARD_REVOLVING",
  "OVERDRAFT",
  "PERSONAL_LOAN",
  "FINANCING",
  "INSTALLMENT",
  "OTHER",
]);
export const importStatus = pgEnum("import_status", ["PENDING", "COMMITTED", "DISCARDED"]);
/** Conta individual (só anotar/controlar) ou em grupo (dividir entre pessoas). */
export const billType = pgEnum("bill_type", ["INDIVIDUAL", "GROUP"]);

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
    color: varchar("color", { length: 9 }).notNull().default("#294f59"),
    /**
     * Quanto havia nesta conta no dia em que você começou a usar o sistema.
     * Sem isso não dá para saber o saldo — o app só conhece os lançamentos.
     */
    openingBalanceCents: integer("opening_balance_cents").notNull().default(0),
    /** Data do saldo inicial. Lançamentos anteriores a ela não entram na conta. */
    openingBalanceDate: timestamp("opening_balance_date", { withTimezone: true }),
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
    /**
     * Movimento entre contas suas (pagar a fatura do cartão, mandar da corrente
     * para a poupança). Não é receita nem despesa: fica de fora dos totais,
     * senão o gasto seria contado duas vezes.
     */
    isTransfer: boolean("is_transfer").notNull().default(false),

    importBatchId: varchar("import_batch_id", { length: 32 }),
    /** Preenchido quando o lançamento nasceu de uma regra recorrente. */
    recurringRuleId: varchar("recurring_rule_id", { length: 32 }).references(
      () => recurringRules.id,
      { onDelete: "set null" },
    ),
    /** Compras parceladas: mesmo grupo para todas as parcelas da compra. */
    installmentGroupId: varchar("installment_group_id", { length: 32 }),
    /** Número desta parcela (1 a N). */
    installmentNumber: integer("installment_number"),
    /** Total de parcelas da compra. */
    installmentTotal: integer("installment_total"),
    /** Hash de conta+data+valor+descrição — impede importar a mesma linha duas vezes. */
    fingerprint: text("fingerprint"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_account_idx").on(t.accountId),
    index("transactions_category_idx").on(t.categoryId),
    index("transactions_recurring_idx").on(t.recurringRuleId),
    index("transactions_installment_idx").on(t.installmentGroupId),
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
    /** Preenchido quando o aporte veio de uma regra automática, não da mão. */
    recurringRuleId: varchar("recurring_rule_id", { length: 32 }).references(
      () => goalRecurringRules.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    index("goal_contributions_goal_idx").on(t.goalId),
    // Uma geração por regra por dia — a mesma regra sempre cai no mesmo dia
    // do mês, então isso impede duplicar o aporte se o botão for clicado
    // duas vezes. Aportes manuais (recurringRuleId nulo) não são afetados —
    // Postgres trata NULL como distinto em índice único.
    uniqueIndex("goal_contributions_recurring_rule_date_key").on(t.recurringRuleId, t.date),
  ],
);

/**
 * "Guarde R$ 200 todo dia 5 na meta X" — o mesmo conceito de `recurringRules`
 * (lançamentos), só que aportando em meta em vez de gerar lançamento. Cada
 * geração mensal vira um `goalContributions` normal, marcado com
 * `recurringRuleId`, o que permite saber o que já caiu no mês sem precisar
 * de outra tabela de controle.
 */
export const goalRecurringRules = pgTable(
  "goal_recurring_rules",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: varchar("goal_id", { length: 32 })
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    /** Dia do mês em que cai. Meses curtos usam o último dia disponível. */
    dayOfMonth: integer("day_of_month").notNull().default(5),
    startYear: integer("start_year").notNull(),
    startMonth: integer("start_month").notNull(),
    /** Opcional: a partir daqui a regra para de gerar. */
    endYear: integer("end_year"),
    endMonth: integer("end_month"),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goal_recurring_rules_user_idx").on(t.userId),
    index("goal_recurring_rules_goal_idx").on(t.goalId),
  ],
);

/**
 * Uma dívida em aberto.
 *
 * A taxa é guardada em pontos-base ao mês (`monthlyRateBps`): 12,50% a.m. = 1250.
 * Inteiro pelo mesmo motivo do dinheiro — nada de float acumulando erro.
 */
export const debts = pgTable(
  "debts",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    creditor: text("creditor"),
    kind: debtKind("kind").notNull().default("OTHER"),

    /** Saldo devedor atual, em centavos. */
    balanceCents: integer("balance_cents").notNull(),
    /** Juros ao mês em pontos-base (1250 = 12,50% a.m.). */
    monthlyRateBps: integer("monthly_rate_bps").notNull().default(0),
    /** Parcela mínima que precisa ser paga todo mês, em centavos. */
    minimumPaymentCents: integer("minimum_payment_cents").notNull().default(0),
    dueDay: integer("due_day").notNull().default(10),

    note: text("note"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("debts_user_idx").on(t.userId)],
);

/** Pagamento registrado numa dívida — abate o saldo devedor. */
export const debtPayments = pgTable(
  "debt_payments",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    debtId: varchar("debt_id", { length: 32 })
      .notNull()
      .references(() => debts.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [index("debt_payments_debt_idx").on(t.debtId)],
);

/**
 * Regra de lançamento recorrente (aluguel, assinatura, salário).
 * A regra é um molde: os lançamentos do mês são gerados a partir dela, com um
 * clique, e passam a viver como qualquer outro lançamento. Nada é criado sem o
 * usuário mandar — abrir uma tela nunca escreve no banco.
 */
export const recurringRules = pgTable(
  "recurring_rules",
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

    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    kind: categoryKind("kind").notNull(),
    nature: expenseNature("nature").notNull().default("FIXED"),
    notes: text("notes"),

    /** Dia do mês em que cai. Meses curtos usam o último dia disponível. */
    dayOfMonth: integer("day_of_month").notNull().default(1),
    startYear: integer("start_year").notNull(),
    startMonth: integer("start_month").notNull(),
    /** Opcional: a partir daqui a regra para de gerar. */
    endYear: integer("end_year"),
    endMonth: integer("end_month"),
    active: boolean("active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recurring_rules_user_idx").on(t.userId)],
);

/**
 * Limite de gasto por categoria, mês a mês.
 * Guardar o período em colunas separadas (ano + mês 1-12) deixa a chave única
 * óbvia e as consultas simples — não precisamos de intervalo de datas aqui.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: varchar("category_id", { length: 32 })
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** Ano de referência (ex.: 2026). */
    periodYear: integer("period_year").notNull(),
    /** Mês de referência, de 1 a 12. */
    periodMonth: integer("period_month").notNull(),
    /** Limite do mês, em centavos. */
    limitCents: integer("limit_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("budgets_user_period_idx").on(t.userId, t.periodYear, t.periodMonth),
    uniqueIndex("budgets_user_category_period_key").on(
      t.userId,
      t.categoryId,
      t.periodYear,
      t.periodMonth,
    ),
  ],
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
    /**
     * Mês/ano da fatura ("AAAA-MM"), só para importação de cartão. Com
     * compra à vista mantendo a data real (fora do mês da fatura, às vezes),
     * não dá mais para descobrir "o que já foi importado dessa fatura" só
     * pela data do lançamento — precisa desse rótulo no lote em vez disso.
     * Nulo para extrato de conta comum.
     */
    invoiceRef: varchar("invoice_ref", { length: 7 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("import_batches_user_idx").on(t.userId),
    index("import_batches_invoice_idx").on(t.accountId, t.invoiceRef),
  ],
);

/**
 * Agrupamento de contas a pagar — só uma pasta pra organizar (ex.: "Casa",
 * "Assinaturas"), sem lógica própria. Uma conta (individual ou em grupo) pode
 * opcionalmente viver dentro de um agrupamento; não é obrigatório.
 */
export const billGroupings = pgTable(
  "bill_groupings",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: varchar("color", { length: 9 }).notNull().default("#64748b"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bill_groupings_user_idx").on(t.userId)],
);

/**
 * Molde de uma conta a pagar recorrente (ex.: "Conta de luz", "Assinatura
 * YouTube Premium"). Só existe para contas que se repetem todo mês — uma
 * conta avulsa ("única daquele mês") não tem regra, é gravada direto em
 * `bills` com `ruleId` nulo. O valor NÃO mora aqui: cada mês varia (a conta de
 * luz não é sempre o mesmo valor), então o valor é preenchido a cada geração,
 * na linha de `bills` daquele mês.
 */
export const billRules = pgTable(
  "bill_rules",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupingId: varchar("grouping_id", { length: 32 }).references(() => billGroupings.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: billType("type").notNull().default("INDIVIDUAL"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bill_rules_user_idx").on(t.userId)],
);

/**
 * "Elenco" de pessoas de uma regra de conta em grupo (nome + telefone) — só
 * pra não redigitar todo mês. Copiado para `bill_participants` a cada geração
 * mensal; editar aqui não muda meses já gerados.
 */
export const billRuleParticipants = pgTable(
  "bill_rule_participants",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    ruleId: varchar("rule_id", { length: 32 })
      .notNull()
      .references(() => billRules.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bill_rule_participants_rule_idx").on(t.ruleId)],
);

/**
 * Uma conta a pagar de um mês específico — a unidade real que aparece na
 * tela. Nasce de duas formas: gerada a partir de uma `bill_rules` (recorrente,
 * `ruleId` preenchido) ou criada direto pelo usuário como avulsa ("única
 * daquele mês", `ruleId` nulo). Fica inteiramente fora dos lançamentos e
 * relatórios financeiros — é só organização e controle, por decisão do João.
 */
export const bills = pgTable(
  "bills",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Nulo = conta avulsa. Preenchido = nasceu de uma regra recorrente. */
    ruleId: varchar("rule_id", { length: 32 }).references(() => billRules.id, { onDelete: "set null" }),
    groupingId: varchar("grouping_id", { length: 32 }).references(() => billGroupings.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: billType("type").notNull().default("INDIVIDUAL"),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    totalCents: integer("total_cents").notNull().default(0),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bills_user_period_idx").on(t.userId, t.year, t.month),
    // Uma geração por regra por mês — Postgres trata NULL como distinto num
    // índice único, então contas avulsas (ruleId nulo) nunca conflitam entre
    // si; só protege contra gerar a mesma regra duas vezes no mesmo mês.
    uniqueIndex("bills_rule_period_key").on(t.ruleId, t.year, t.month),
  ],
);

/**
 * Uma pessoa dentro de uma conta em grupo, com o quanto ela deve pagar
 * daquele mês. A soma de `amountCents` de todos os participantes de uma
 * conta sempre deve bater exatamente com `bills.totalCents` — validado na
 * ação do servidor, não aqui (Drizzle/Postgres não expressam essa regra
 * entre linhas de tabelas diferentes com uma constraint simples). Sem
 * controle de "pago" por decisão do João — o objetivo aqui é só saber a
 * parte de cada um e mandar a mensagem no WhatsApp, não cobrar.
 */
export const billParticipants = pgTable(
  "bill_participants",
  {
    id: varchar("id", { length: 32 }).primaryKey().$defaultFn(createId),
    billId: varchar("bill_id", { length: 32 })
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    amountCents: integer("amount_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bill_participants_bill_idx").on(t.billId)],
);

// ---------------------------------------------------------------- relations

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
  goals: many(goals),
  budgets: many(budgets),
  recurringRules: many(recurringRules),
  goalRecurringRules: many(goalRecurringRules),
  debts: many(debts),
  billGroupings: many(billGroupings),
  billRules: many(billRules),
  bills: many(bills),
}));

export const debtsRelations = relations(debts, ({ one, many }) => ({
  user: one(users, { fields: [debts.userId], references: [users.id] }),
  payments: many(debtPayments),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
  debt: one(debts, { fields: [debtPayments.debtId], references: [debts.id] }),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  transactions: many(transactions),
  budgets: many(budgets),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  user: one(users, { fields: [budgets.userId], references: [users.id] }),
  category: one(categories, { fields: [budgets.categoryId], references: [categories.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  recurringRule: one(recurringRules, {
    fields: [transactions.recurringRuleId],
    references: [recurringRules.id],
  }),
}));

export const recurringRulesRelations = relations(recurringRules, ({ one, many }) => ({
  user: one(users, { fields: [recurringRules.userId], references: [users.id] }),
  account: one(accounts, { fields: [recurringRules.accountId], references: [accounts.id] }),
  category: one(categories, { fields: [recurringRules.categoryId], references: [categories.id] }),
  transactions: many(transactions),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  user: one(users, { fields: [goals.userId], references: [users.id] }),
  contributions: many(goalContributions),
  recurringRules: many(goalRecurringRules),
}));

export const goalContributionsRelations = relations(goalContributions, ({ one }) => ({
  goal: one(goals, { fields: [goalContributions.goalId], references: [goals.id] }),
  recurringRule: one(goalRecurringRules, {
    fields: [goalContributions.recurringRuleId],
    references: [goalRecurringRules.id],
  }),
}));

export const goalRecurringRulesRelations = relations(goalRecurringRules, ({ one, many }) => ({
  user: one(users, { fields: [goalRecurringRules.userId], references: [users.id] }),
  goal: one(goals, { fields: [goalRecurringRules.goalId], references: [goals.id] }),
  contributions: many(goalContributions),
}));

export const importBatchesRelations = relations(importBatches, ({ one }) => ({
  user: one(users, { fields: [importBatches.userId], references: [users.id] }),
  account: one(accounts, { fields: [importBatches.accountId], references: [accounts.id] }),
}));

export const billGroupingsRelations = relations(billGroupings, ({ one, many }) => ({
  user: one(users, { fields: [billGroupings.userId], references: [users.id] }),
  rules: many(billRules),
  bills: many(bills),
}));

export const billRulesRelations = relations(billRules, ({ one, many }) => ({
  user: one(users, { fields: [billRules.userId], references: [users.id] }),
  grouping: one(billGroupings, { fields: [billRules.groupingId], references: [billGroupings.id] }),
  participants: many(billRuleParticipants),
  bills: many(bills),
}));

export const billRuleParticipantsRelations = relations(billRuleParticipants, ({ one }) => ({
  rule: one(billRules, { fields: [billRuleParticipants.ruleId], references: [billRules.id] }),
}));

export const billsRelations = relations(bills, ({ one, many }) => ({
  user: one(users, { fields: [bills.userId], references: [users.id] }),
  rule: one(billRules, { fields: [bills.ruleId], references: [billRules.id] }),
  grouping: one(billGroupings, { fields: [bills.groupingId], references: [billGroupings.id] }),
  participants: many(billParticipants),
}));

export const billParticipantsRelations = relations(billParticipants, ({ one }) => ({
  bill: one(bills, { fields: [billParticipants.billId], references: [bills.id] }),
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
export type Budget = typeof budgets.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type GoalRecurringRule = typeof goalRecurringRules.$inferSelect;
export type Debt = typeof debts.$inferSelect;
export type DebtKind = (typeof debtKind.enumValues)[number];
export type BillType = (typeof billType.enumValues)[number];
export type BillGrouping = typeof billGroupings.$inferSelect;
export type BillRule = typeof billRules.$inferSelect;
export type BillRuleParticipant = typeof billRuleParticipants.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type BillParticipant = typeof billParticipants.$inferSelect;
