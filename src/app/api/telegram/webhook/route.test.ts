import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ after: vi.fn(), callback: vi.fn(), details: vi.fn(), notify: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/server/telegram/store", () => ({ processMessage: vi.fn() }));
vi.mock("@/server/telegram/command-menu", () => ({ registerCommandMenu: vi.fn() }));
vi.mock("@/server/telegram/callback-store", () => ({ processInlineCallback: mocks.callback, replyKeyboard: vi.fn() }));
vi.mock("@/server/telegram/callback-delivery", () => ({ sendCallbackDetails: mocks.details, sendCallbackResult: mocks.notify }));

import { POST } from "./route";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("rota registra trabalho com after e devolve ACK sem aguardar callback", async () => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  const query = { id: "123", from: { id: 123, is_bot: false },
    message: { message_id: 10, date: 1794490000, chat: { id: 123, type: "private" }, from: { id: 999, is_bot: true } }, data: "opaque" };
  const response = await POST(new Request("https://app.test/api/telegram/webhook", {
    method: "POST", headers: { "x-telegram-bot-api-secret-token": "test-secret" },
    body: JSON.stringify({ update_id: 30, callback_query: query }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ method: "answerCallbackQuery", callback_query_id: query.id, cache_time: 0 });
  expect(mocks.callback).not.toHaveBeenCalled();
  expect(mocks.after).toHaveBeenCalledOnce();
  mocks.callback.mockResolvedValue({ text: "Detalhes enviados no chat.", details: "d2" });
  mocks.details.mockResolvedValue(true);
  await mocks.after.mock.calls[0][0]();
  expect(mocks.details).toHaveBeenCalledWith(query, "d2");
});
