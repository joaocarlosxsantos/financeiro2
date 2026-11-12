import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setVapidDetails, sendNotification } from "web-push";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(10).max(256),
    auth: z.string().min(10).max(256),
  }),
});

export async function POST(req: NextRequest) {
  // 1. Autenticação por sessão
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // 2. Verificação de Origem (CSRF)
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Origem malformada" }, { status: 403 });
    }
  }

  // 3. Rate limit simples (máximo 10 disparos por minuto por usuário)
  const rate = checkRateLimit(`push-test:${userId}`, 10, Date.now(), 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas de teste. Aguarde alguns segundos." },
      { status: 429 }
    );
  }

  // 4. Validação do corpo da requisição
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const rawSubscription = (body as { subscription?: unknown })?.subscription ?? body;
  const parsed = subscriptionSchema.safeParse(rawSubscription);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Inscrição push inválida ou incompleta", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // 5. Configuração VAPID
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@mutanocontas.vercel.app";
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json(
      { error: "Chaves VAPID não configuradas no servidor." },
      { status: 503 }
    );
  }

  // 6. Envio pontual sem persistência
  try {
    setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const payload = JSON.stringify({
      title: "Mutano Contas",
      body: "Notificação de teste recebida com sucesso no seu iPhone!",
      icon: "/icon.svg",
      badge: "/icon.svg",
      url: "/configuracoes/teste-push",
    });

    await sendNotification(parsed.data, payload);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      return NextResponse.json(
        { error: "A inscrição push expirou ou foi cancelada no dispositivo." },
        { status: 410 }
      );
    }
    return NextResponse.json(
      { error: "Falha ao enviar notificação para o gateway push da Apple/Google." },
      { status: 502 }
    );
  }
}
