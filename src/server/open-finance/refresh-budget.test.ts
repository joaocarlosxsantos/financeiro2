import { describe, expect, it } from "vitest";
import { decideRefresh, REFRESH_DAILY_MAX, REFRESH_MIN_INTERVAL_MS, REFRESH_MONTHLY_MAX, saoPauloDay, type RefreshRecord } from "./refresh-budget";

// Horários UTC abaixo caem no mesmo dia civil de São Paulo (UTC-3) do "agora".
const now = new Date("2026-11-13T23:00:00Z");
const at = (iso: string, reason: RefreshRecord["reason"] = "on_demand"): RefreshRecord => ({ at: new Date(iso), reason });
const run = (when: Date, reason: "morning" | "on_demand", item: RefreshRecord[], all = item) => decideRefresh({ now: when, reason, item, all });
const dayOf = (hourUtc: number[]) => hourUtc.map((h, i) => at(`2026-11-13T${String(h).padStart(2, "0")}:00:00Z`, i === 0 ? "morning" : "on_demand"));

describe("orçamento de refresh Open Finance", () => {
  it("usa o dia civil de São Paulo, não UTC", () => {
    expect(saoPauloDay(new Date("2026-11-13T02:30:00Z"))).toBe("2026-11-12");
    expect(saoPauloDay(new Date("2026-11-13T03:30:00Z"))).toBe("2026-11-13");
  });

  it("sob demanda respeita o intervalo mínimo entre refreshes", () => {
    const last = new Date("2026-11-13T14:00:00Z");
    expect(run(new Date("2026-11-13T15:00:00Z"), "on_demand", [at(last.toISOString())])).toEqual({ allowed: false, denial: "TOO_SOON" });
    expect(run(new Date(last.getTime() + REFRESH_MIN_INTERVAL_MS), "on_demand", [at(last.toISOString())])).toEqual({ allowed: true });
    expect(run(now, "on_demand", [])).toEqual({ allowed: true });
  });

  it("teto diário de 8 por item, contando o matinal", () => {
    const seven = dayOf([10, 12, 14, 16, 18, 19, 20]); // 7 registros no dia
    expect(seven).toHaveLength(REFRESH_DAILY_MAX - 1);
    expect(run(now, "on_demand", seven)).toEqual({ allowed: true });
    const eight = [...seven, at("2026-11-13T21:00:00Z")];
    expect(run(now, "on_demand", eight)).toEqual({ allowed: false, denial: "DAILY_CAP" });
  });

  it("reserva uma vaga do dia para o matinal enquanto ele não rodou", () => {
    const seven = dayOf([10, 12, 14, 16, 18, 19, 20]).map((row) => ({ ...row, reason: "on_demand" as const }));
    expect(run(now, "on_demand", seven)).toEqual({ allowed: false, denial: "DAILY_CAP" });
    expect(run(now, "morning", seven)).toEqual({ allowed: true });
  });

  it("matinal roda uma vez por dia e ignora o intervalo mínimo", () => {
    expect(run(new Date("2026-11-13T09:30:00Z"), "morning", [])).toEqual({ allowed: true });
    expect(run(new Date("2026-11-13T09:31:00Z"), "morning", [at("2026-11-13T09:30:00Z", "morning")])).toEqual({ allowed: false, denial: "MORNING_DONE" });
    expect(run(new Date("2026-11-13T09:31:00Z"), "morning", [at("2026-11-13T08:00:00Z")])).toEqual({ allowed: true });
  });

  it("teto mensal de 230 bloqueia tudo, inclusive matinal, e conta todas as conexões", () => {
    const all = Array.from({ length: REFRESH_MONTHLY_MAX }, (_, i) => at(`2026-11-0${(i % 9) + 1}T10:00:00Z`));
    expect(run(now, "morning", [], all)).toEqual({ allowed: false, denial: "MONTHLY_CAP" });
    expect(run(now, "on_demand", [], all)).toEqual({ allowed: false, denial: "MONTHLY_CAP" });
    const lastMonth = Array.from({ length: REFRESH_MONTHLY_MAX }, () => at("2026-10-31T10:00:00Z"));
    expect(run(new Date("2026-11-13T15:00:00Z"), "on_demand", [], lastMonth)).toEqual({ allowed: true });
  });

  it("virada do dia em São Paulo zera o contador diário", () => {
    const yesterday = dayOf([10, 11, 12, 13, 14, 15, 16, 17]).map((row) => ({ ...row, at: new Date(row.at.getTime() - 24 * 3600_000) }));
    expect(run(new Date("2026-11-13T12:00:00Z"), "morning", yesterday)).toEqual({ allowed: true });
  });
});
