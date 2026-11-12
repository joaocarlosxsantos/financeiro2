import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), select: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("web-push", () => ({ sendNotification: mocks.send }));
vi.mock("@/db", () => ({ db: { select: mocks.select, update: mocks.update, delete: mocks.remove } }));
import { notificationDrivers } from "./drivers";
import { DEFAULT_NOTIFICATION_PREFERENCES, eventSchema } from "./policy";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
beforeEach(() => { vi.resetAllMocks(); });
describe("push driver", () => {
  it.each([404, 410])("remove apenas subscription do dono em %i e continua nos outros dispositivos", async statusCode => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "fake-public"); vi.stubEnv("VAPID_PRIVATE_KEY", "fake-private");
    const subs = [1, 2].map(i => ({ id: String(i), userId: "owner", endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, auth: "auth", p256dh: "public" }));
    mocks.select.mockReturnValue({ from: () => ({ where: async () => subs }) });
    mocks.update.mockReturnValue({ set: () => ({ where: () => ({ returning: async () => [{ id: "notice" }] }) }) });
    const where = vi.fn().mockResolvedValue([]); mocks.remove.mockReturnValue({ where });
    mocks.send.mockRejectedValueOnce({ statusCode }).mockResolvedValueOnce({});
    const event = eventSchema.parse({ userId: "owner", category: "budget", type: "BUDGET", body: "Aviso", dedupeKey: "key" });
    expect(await notificationDrivers.push(event, "notice", DEFAULT_NOTIFICATION_PREFERENCES)).toBe(1);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL);
    expect(predicate.params).toEqual(["owner", "1", "auth", "public"]);
    vi.unstubAllEnvs();
  });
});
