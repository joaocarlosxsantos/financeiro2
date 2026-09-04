import { test } from "vitest";
import assert from "node:assert/strict";
import { buildBudgetAlerts, buildGoalAlerts } from "./alerts";

test("só categoria estourada vira aviso — 'atenção' fica só na tela de orçamento", () => {
  const rows = [
    { categoryId: "1", name: "Mercado", limitCents: 100000, spentCents: 120000, remainingCents: -20000, status: "estourou" },
    { categoryId: "2", name: "Lazer", limitCents: 50000, spentCents: 45000, remainingCents: 5000, status: "atencao" },
    { categoryId: "3", name: "Transporte", limitCents: 20000, spentCents: 5000, remainingCents: 15000, status: "ok" },
  ];
  const alerts = buildBudgetAlerts(rows);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, "budget-1");
  assert.match(alerts[0].title, /Mercado/);
  assert.match(alerts[0].description, /R\$\s200,00/); // 20000 centavos acima
});

test("meta sem prazo, ou dentro do prazo, ou já concluída não vira aviso", () => {
  const now = new Date("2026-09-04T12:00:00Z");
  const goals = [
    { id: "a", name: "Sem prazo", targetCents: 100000, savedCents: 0, targetDate: null, archived: false },
    { id: "b", name: "No prazo", targetCents: 100000, savedCents: 0, targetDate: new Date("2026-12-01"), archived: false },
    { id: "c", name: "Atrasada mas já batida", targetCents: 100000, savedCents: 100000, targetDate: new Date("2026-01-01"), archived: false },
    { id: "d", name: "Atrasada e arquivada", targetCents: 100000, savedCents: 0, targetDate: new Date("2026-01-01"), archived: true },
  ];
  assert.equal(buildGoalAlerts(goals, now).length, 0);
});

test("meta com prazo vencido e ainda não batida vira aviso", () => {
  const now = new Date("2026-09-04T12:00:00Z");
  const goals = [
    { id: "e", name: "Viagem", targetCents: 900000, savedCents: 210000, targetDate: new Date("2026-08-01"), archived: false },
  ];
  const alerts = buildGoalAlerts(goals, now);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, "goal-e");
  assert.match(alerts[0].title, /Viagem/);
  assert.match(alerts[0].description, /R\$\s6\.900,00/); // faltam 690000 centavos
});
