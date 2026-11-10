import { describe, expect, it } from "vitest";
import { billMonthSchema } from "./bill-month";

describe("período de geração de contas", () => {
  it.each(["2000-01", "2026-11", "2100-12"])("aceita %s e produz MonthRef", (value) => {
    expect(billMonthSchema.parse(value)).toEqual({ year: Number(value.slice(0, 4)), month: Number(value.slice(5)) });
  });
  it.each(["2026-00", "2026-13", "2026-1", "26-11", "1999-12", "2101-01", "2026/11", "2026-11-01", " 2026-11", "2026-11 ", "", null, undefined, { year: 2026, month: 11 }])("rejeita referência inválida %j", (value) => {
    expect(billMonthSchema.safeParse(value).success).toBe(false);
  });
});
