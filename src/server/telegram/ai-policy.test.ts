import { describe, expect, it } from "vitest";
import { AI_TOOLS, safeAnswer, safeLabel, validToolInput } from "./ai-policy";

describe("fronteira das ferramentas IA", () => {
  it("oferece só cinco ferramentas de leitura sem parâmetro de identidade", () => {
    expect(AI_TOOLS.map((t) => t.name)).toEqual(["get_balance", "get_spending_by_category", "get_largest_expenses", "compare_months", "get_due_bills"]);
    for (const tool of AI_TOOLS) {
      expect(tool.input_schema.additionalProperties).toBe(false);
      expect(JSON.stringify(tool.input_schema)).not.toContain("user_id");
    }
  });
  it.each([
    ["get_balance", { user_id: "attacker" }], ["get_balance", { userId: "attacker" }],
    ["delete_transactions", {}], ["__proto__", {}], ["constructor", {}],
    ["get_largest_expenses", { start_date: "2026-11-01", end_date: "2026-11-10", limit: 50 }],
    ["get_spending_by_category", { start_date: "2026-01-01", end_date: "2026-11-10" }],
    ["get_spending_by_category", { start_date: "2026-11-10", end_date: "2026-11-01" }],
    ["get_spending_by_category", { start_date: "2026-11-01", end_date: "2026-12-10" }],
    ["get_spending_by_category", { start_date: "2026-02-30", end_date: "2026-03-01" }],
    ["compare_months", { first_month: "2020-01", second_month: "2026-01" }],
    ["compare_months", { first_month: "2026-13", second_month: "2026-01" }],
    ["get_due_bills", { days: -1 }], ["get_due_bills", { days: 8 }],
  ])("rejeita escopo/input inseguro %s %j", (name, input) => {
    expect(validToolInput(name, input, "2026-11-10")).toBeNull();
  });
  it("aceita períodos válidos, limite reduzido e meses atuais/passados", () => {
    expect(validToolInput("get_spending_by_category", { start_date: "2026-11-01", end_date: "2026-11-10" }, "2026-11-10")).not.toBeNull();
    expect(validToolInput("compare_months", { first_month: "2026-10", second_month: "2026-11" }, "2026-11-10")).not.toBeNull();
  });
  it("remove links, credenciais conhecidas, controles e limita textos", () => {
    expect(safeAnswer("Veja https://evil.test e t.me/mutano e private-key", ["private-key"])).not.toMatch(/https:|t.me|private-key/);
    expect(safeAnswer("evil.finance user@example.test tg://resolve 127.0.0.1", [])).not.toMatch(/evil\.finance|user@|tg:|127\./);
    expect(safeLabel("Mercado\nhttps://evil.test sk-ant-testkey")).not.toMatch(/\n|https:|sk-ant-/);
    const googleKey = "AIza" + "x".repeat(35);
    expect(safeLabel(googleKey)).toBe("[segredo removido]");
    expect(safeAnswer(googleKey, [])).toBe("[segredo removido]");
    expect(safeAnswer("x".repeat(3000), []).length).toBe(1800);
    expect(safeLabel("x".repeat(3000)).length).toBe(60);
  });
});
