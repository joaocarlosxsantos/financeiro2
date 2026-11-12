import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("web-push", () => ({
  sendNotification: mocks.sendNotification,
  setVapidDetails: mocks.setVapidDetails,
}));

import { POST } from "./route";

describe("POST /api/teste-push", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "test_public_key_abc123",
      VAPID_PRIVATE_KEY: "test_private_key_xyz789",
      VAPID_SUBJECT: "mailto:admin@mutanocontas.vercel.app",
    };
  });

  const validSubscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/sample-token",
    expirationTime: null,
    keys: {
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0GLC3Up0=test-key-p256dh",
      auth: "tBHItJI5svbpez7KI4CCXg==",
    },
  };

  it("retorna 401 para usuário não autenticado", async () => {
    mocks.auth.mockResolvedValue(null);

    const req = new NextRequest("https://mutanocontas.vercel.app/api/teste-push", {
      method: "POST",
      body: JSON.stringify({ subscription: validSubscription }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("retorna 403 se a origem for diferente do host", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user_test_1" } });

    const req = new NextRequest("https://mutanocontas.vercel.app/api/teste-push", {
      method: "POST",
      headers: {
        host: "mutanocontas.vercel.app",
        origin: "https://evil.example.com",
      },
      body: JSON.stringify({ subscription: validSubscription }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("retorna 400 se o corpo não for JSON válido", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user_test_2" } });

    const req = new NextRequest("https://mutanocontas.vercel.app/api/teste-push", {
      method: "POST",
      headers: {
        host: "mutanocontas.vercel.app",
        origin: "https://mutanocontas.vercel.app",
      },
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retorna 400 se o subscription for inválido", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user_test_3" } });

    const req = new NextRequest("https://mutanocontas.vercel.app/api/teste-push", {
      method: "POST",
      headers: {
        host: "mutanocontas.vercel.app",
        origin: "https://mutanocontas.vercel.app",
      },
      body: JSON.stringify({
        subscription: {
          endpoint: "not-a-url",
          keys: { p256dh: "short", auth: "short" },
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retorna 503 se as chaves VAPID não estiverem configuradas", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    mocks.auth.mockResolvedValue({ user: { id: "user_test_4" } });

    const req = new NextRequest("https://mutanocontas.vercel.app/api/teste-push", {
      method: "POST",
      headers: {
        host: "mutanocontas.vercel.app",
        origin: "https://mutanocontas.vercel.app",
      },
      body: JSON.stringify({ subscription: validSubscription }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("envia notificação com sucesso e retorna 200", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user_test_5" } });
    mocks.sendNotification.mockResolvedValue({});

    const req = new NextRequest("https://mutanocontas.vercel.app/api/teste-push", {
      method: "POST",
      headers: {
        host: "mutanocontas.vercel.app",
        origin: "https://mutanocontas.vercel.app",
      },
      body: JSON.stringify({ subscription: validSubscription }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.setVapidDetails).toHaveBeenCalledWith(
      "mailto:admin@mutanocontas.vercel.app",
      "test_public_key_abc123",
      "test_private_key_xyz789"
    );
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("retorna 410 se a subscription tiver expirado (410 do gateway)", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user_test_6" } });
    mocks.sendNotification.mockRejectedValue({ statusCode: 410 });

    const req = new NextRequest("https://mutanocontas.vercel.app/api/teste-push", {
      method: "POST",
      headers: {
        host: "mutanocontas.vercel.app",
        origin: "https://mutanocontas.vercel.app",
      },
      body: JSON.stringify({ subscription: validSubscription }),
    });

    const res = await POST(req);
    expect(res.status).toBe(410);
  });
});
