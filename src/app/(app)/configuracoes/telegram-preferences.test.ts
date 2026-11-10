import { describe, expect, it, vi } from "vitest";
import { preferenceFeedback } from "./telegram-preferences-feedback";
import { DEFAULT_PREFERENCES } from "@/server/telegram/insights";

describe("feedback de preferências Telegram", () => {
  it("carregamento passivo indisponível é neutro, tanto para erro retornado quanto rejeição", async () => {
    for (const load of [vi.fn().mockResolvedValue({ error: "Banco indisponível" }), vi.fn().mockRejectedValue(new Error("network unavailable"))]) {
      expect(await preferenceFeedback(load, "initial-load")).toEqual({ unavailable: true });
    }
  });
  it("erro só é apresentado quando o usuário tenta carregar novamente", async () => {
    const load = vi.fn().mockResolvedValue({ error: "Não foi possível carregar." });
    expect(await preferenceFeedback(load, "initial-load")).not.toHaveProperty("error");
    expect(await preferenceFeedback(load, "reload")).toEqual({ unavailable: true, error: "Não foi possível carregar." });
  });
  it("permite recuperar a leitura e preserva falha real ao salvar depois", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ prefs: DEFAULT_PREFERENCES });
    expect(await preferenceFeedback(load, "initial-load")).toEqual({ unavailable: true });
    expect(await preferenceFeedback(load, "reload")).toEqual({ prefs: DEFAULT_PREFERENCES });
    const write = vi.fn().mockResolvedValue({ error: "Não foi possível salvar as preferências." });
    const feedback = await preferenceFeedback(write, "save");
    expect(feedback.error).toBe("Não foi possível salvar as preferências.");
    expect(feedback).not.toHaveProperty("message");
    expect(feedback).not.toHaveProperty("unavailable");
  });
  it("rejeição e resposta incompleta de gravação jamais viram sucesso", async () => {
    const rejected = await preferenceFeedback(vi.fn().mockRejectedValue(new Error("server failure")), "save");
    expect(rejected.error).toContain("salvar"); expect(rejected).not.toHaveProperty("message");
    const incomplete = await preferenceFeedback(vi.fn().mockResolvedValue({}), "save");
    expect(incomplete.error).toContain("confirmar a gravação");
    expect(incomplete).not.toHaveProperty("message");
  });
  it("sucesso exige confirmação explícita do servidor", async () => {
    expect(await preferenceFeedback(vi.fn().mockResolvedValue({ ok: true, prefs: DEFAULT_PREFERENCES }), "save")).toEqual({ message: "Preferências de avisos salvas.", prefs: DEFAULT_PREFERENCES });
  });
});
