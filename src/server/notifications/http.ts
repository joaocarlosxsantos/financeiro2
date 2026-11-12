import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
export const privateHeaders = { "Cache-Control": "no-store" };
export async function notificationUser(request: Request, mutating = false): Promise<string | Response> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return Response.json({ error: "Não autorizado." }, { status: 401, headers: privateHeaders });
  if (mutating && request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Origem inválida." }, { status: 403, headers: privateHeaders });
  if (!checkRateLimit(`notifications:${mutating ? "write" : "read"}:${id}`, mutating ? 30 : 120, Date.now(), 60000).allowed)
    return Response.json({ error: "Aguarde um minuto e tente novamente." }, { status: 429, headers: privateHeaders });
  return id;
}
export async function boundedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader(); if (!reader) throw new Error("invalid_body");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 8192) { await reader.cancel(); throw new Error("body_too_large"); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
