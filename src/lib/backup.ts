export type BackupData = {
  version: 1;
  exportedAt: string;
  user: {
    name: string;
    email: string;
    monthlyIncomeCents: number;
    emergencyMonths: number;
    savingsTargetPct: number;
  };
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    institution: string | null;
    color: string;
    openingBalanceCents: number;
    archived: boolean;
  }>;
  categories: Array<{
    id: string;
    name: string;
    kind: string;
    nature: string;
    color: string;
    keywords: string[];
    archived: boolean;
  }>;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    amountCents: number;
    kind: string;
    nature: string;
    notes: string | null;
    isTransfer: boolean;
    installmentNumber: number | null;
    installmentTotal: number | null;
  }>;
  goals: Array<{
    id: string;
    name: string;
    kind: string;
    targetCents: number;
    savedCents: number;
    targetDate: string | null;
    color: string;
    note: string | null;
    archived: boolean;
  }>;
  goalContributions: Array<{
    id: string;
    goalId: string;
    deltaCents: number;
    date: string;
    note: string | null;
  }>;
  debts: Array<{
    id: string;
    name: string;
    creditor: string | null;
    kind: string;
    balanceCents: number;
    monthlyRateBps: number;
    minimumPaymentCents: number;
    dueDay: number;
    note: string | null;
    archived: boolean;
  }>;
  debtPayments: Array<{
    id: string;
    debtId: string;
    amountCents: number;
    date: string;
    note: string | null;
  }>;
  budgets: Array<{
    id: string;
    categoryId: string;
    periodYear: number;
    periodMonth: number;
    limitCents: number;
  }>;
  recurringRules: Array<{
    id: string;
    accountId: string;
    categoryId: string | null;
    description: string;
    amountCents: number;
    kind: string;
    nature: string;
    dayOfMonth: number;
    active: boolean;
    notes: string | null;
  }>;
  bills: Array<{
    id: string;
    name: string;
    type: string;
    year: number;
    month: number;
    totalCents: number;
    note: string | null;
  }>;
  billParticipants: Array<{
    id: string;
    billId: string;
    name: string;
    phone: string | null;
    amountCents: number;
  }>;
  billGroupings: Array<{
    id: string;
    name: string;
    color: string;
    archived: boolean;
  }>;
  transactionSplits: Array<{
    id: string;
    transactionId: string;
    name: string;
    phone: string | null;
    amountCents: number;
  }>;
};

export function buildBackup(rows: {
  user: Array<any>;
  accounts: Array<any>;
  categories: Array<any>;
  transactions: Array<any>;
  goals: Array<any>;
  goalContributions: Array<any>;
  debts: Array<any>;
  debtPayments: Array<any>;
  budgets: Array<any>;
  recurringRules: Array<any>;
  bills: Array<any>;
  billParticipants: Array<any>;
  billGroupings: Array<any>;
  transactionSplits: Array<any>;
}): BackupData {
  const user = rows.user[0];
  if (!user) throw new Error("User not found");

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: {
      name: user.name,
      email: user.email,
      monthlyIncomeCents: user.monthlyIncomeCents,
      emergencyMonths: user.emergencyMonths,
      savingsTargetPct: user.savingsTargetPct,
    },
    accounts: rows.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      institution: a.institution,
      color: a.color,
      openingBalanceCents: a.openingBalanceCents,
      archived: a.archived,
    })),
    categories: rows.categories.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      nature: c.nature,
      color: c.color,
      keywords: c.keywords,
      archived: c.archived,
    })),
    transactions: rows.transactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      description: t.description,
      amountCents: t.amountCents,
      kind: t.kind,
      nature: t.nature,
      notes: t.notes,
      isTransfer: t.isTransfer,
      installmentNumber: t.installmentNumber,
      installmentTotal: t.installmentTotal,
    })),
    goals: rows.goals.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      targetCents: g.targetCents,
      savedCents: g.savedCents,
      targetDate: g.targetDate?.toISOString() ?? null,
      color: g.color,
      note: g.note,
      archived: g.archived,
    })),
    goalContributions: rows.goalContributions.map((gc) => ({
      id: gc.id,
      goalId: gc.goalId,
      deltaCents: gc.deltaCents,
      date: gc.date.toISOString(),
      note: gc.note,
    })),
    debts: rows.debts.map((d) => ({
      id: d.id,
      name: d.name,
      creditor: d.creditor,
      kind: d.kind,
      balanceCents: d.balanceCents,
      monthlyRateBps: d.monthlyRateBps,
      minimumPaymentCents: d.minimumPaymentCents,
      dueDay: d.dueDay,
      note: d.note,
      archived: d.archived,
    })),
    debtPayments: rows.debtPayments.map((dp) => ({
      id: dp.id,
      debtId: dp.debtId,
      amountCents: dp.amountCents,
      date: dp.date.toISOString(),
      note: dp.note,
    })),
    budgets: rows.budgets.map((b) => ({
      id: b.id,
      categoryId: b.categoryId,
      periodYear: b.periodYear,
      periodMonth: b.periodMonth,
      limitCents: b.limitCents,
    })),
    recurringRules: rows.recurringRules.map((rr) => ({
      id: rr.id,
      accountId: rr.accountId,
      categoryId: rr.categoryId,
      description: rr.description,
      amountCents: rr.amountCents,
      kind: rr.kind,
      nature: rr.nature,
      dayOfMonth: rr.dayOfMonth,
      active: rr.active,
      notes: rr.notes,
    })),
    bills: rows.bills.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      year: b.year,
      month: b.month,
      totalCents: b.totalCents,
      note: b.note,
    })),
    billParticipants: rows.billParticipants.map((bp) => ({
      id: bp.id,
      billId: bp.billId,
      name: bp.name,
      phone: bp.phone,
      amountCents: bp.amountCents,
    })),
    billGroupings: rows.billGroupings.map((bg) => ({
      id: bg.id,
      name: bg.name,
      color: bg.color,
      archived: bg.archived,
    })),
    transactionSplits: rows.transactionSplits.map((ts) => ({
      id: ts.id,
      transactionId: ts.transactionId,
      name: ts.name,
      phone: ts.phone,
      amountCents: ts.amountCents,
    })),
  };
}
