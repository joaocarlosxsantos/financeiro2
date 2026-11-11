import { MAX_BODY_BYTES, updateSchema, validWebhookSecret, type TelegramMessage } from "./protocol";

/** Limite real sobre o stream: Content-Length pode estar ausente ou mentir. */
async function boundedBody(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}

export async function handleWebhook(
  request: Request,
  secret: string | undefined,
  processMessage: (updateId: number, message: TelegramMessage) => Promise<string | null>,
) {
  const headers = { "Cache-Control": "no-store" };
  if (!secret) return Response.json({ error: "unavailable" }, { status: 503, headers });
  if (!validWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await boundedBody(request));
  } catch (error) {
    return Response.json({ error: "invalid_request" }, { status: error instanceof RangeError ? 413 : 400, headers });
  }
  const parsed = updateSchema.safeParse(raw);
  // Grupos, mensagens editadas, anexos e texto excessivo não geram resposta.
  if (!parsed.success || !parsed.data.message?.text) return Response.json({ ok: true }, { headers });
  try {
    const reply = await processMessage(parsed.data.update_id, parsed.data.message);
    return Response.json(reply ? {
      method: "sendMessage", chat_id: parsed.data.message.chat.id, text: reply, protect_content: true,
    } : { ok: true }, { headers });
  } catch (error) {
    const err = error as { name?: string; code?: string | number; constructor?: { name?: string } };
    console.error("[telegram-webhook]", {
      name: err?.constructor?.name ?? err?.name ?? "Error",
      code: err?.code ?? null,
    });
    // Não expor tokens, payload, chat, usuário, saldo ou mensagens do banco em logs.
    // O update já autenticado precisa de resposta no chat, não de um 5xx sem mensagem.
    return Response.json({
      method: "sendMessage", chat_id: parsed.data.message.chat.id,
      text: "Não foi possível consultar seus dados agora. Tente novamente em instantes.",
      protect_content: true,
    }, { headers });
  }
}
