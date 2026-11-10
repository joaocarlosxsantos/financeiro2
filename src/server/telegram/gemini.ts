import { z } from "zod";
import { AI_MAX_OUTPUT_TOKENS, AI_TOOLS } from "./ai-policy";
import type { AiMessage } from "./ai";

// ID estável e Free Tier confirmados nas páginas oficiais de modelo/preços em 10/11/2026.
export const GEMINI_MODEL = "gemini-3.8-flash";
export const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const callSchema = z.object({ id: z.string().min(1).max(100), name: z.string().max(64), args: z.unknown().optional() });
const partSchema = z.object({
  text: z.string().max(8000).optional(), functionCall: callSchema.optional(),
  thought: z.boolean().optional(), thoughtSignature: z.string().max(24_000).optional(),
}).passthrough();
const replySchema = z.object({ candidates: z.array(z.object({
  finishReason: z.string(), content: z.object({ role: z.literal("model"), parts: z.array(partSchema).min(1).max(8) }),
})).length(1) });

export function geminiRequest(messages: AiMessage[], system: string) {
  const names = new Map<string, string>();
  for (const message of messages) if (message.role === "assistant" && Array.isArray(message.content)) {
    for (const block of message.content) if (block.type === "tool_use") names.set(block.id, block.name);
  }
  const contents = messages.map((message) => {
    if (typeof message.content === "string") return { role: "user", parts: [{ text: message.content }] };
    if (message.role === "assistant") {
      // Replay intacto das assinaturas opacas exigidas pelo function calling Gemini.
      if (!message.geminiParts) throw new Error("missing_gemini_parts");
      return { role: "model", parts: message.geminiParts };
    }
    return { role: "user", parts: message.content.map((block) => {
      if (block.type !== "tool_result" || !names.has(block.tool_use_id)) throw new Error("invalid_function_response");
      return { functionResponse: { id: block.tool_use_id, name: names.get(block.tool_use_id), response: JSON.parse(block.content) as unknown } };
    }) };
  });
  return {
    systemInstruction: { parts: [{ text: system }] }, contents,
    tools: [{ functionDeclarations: AI_TOOLS.map((tool) => {
      const parametersJsonSchema = { ...tool.input_schema };
      delete parametersJsonSchema.$schema;
      return { name: tool.name, description: tool.description, parametersJsonSchema };
    }) }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: { maxOutputTokens: AI_MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingLevel: "LOW", includeThoughts: false } },
  };
}

/** Normaliza apenas texto/functionCall; não executa código ou server tools do provedor. */
export function geminiReply(raw: unknown) {
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) return null;
  const candidate = parsed.data.candidates[0];
  if (candidate.finishReason !== "STOP") return null;
  const content = candidate.content.parts.flatMap((part) => {
    if (part.functionCall) return [{ type: "tool_use" as const, id: part.functionCall.id, name: part.functionCall.name, input: part.functionCall.args ?? {} }];
    return [];
  });
  const text = candidate.content.parts.filter((part) => !part.thought && part.text !== undefined).map((part) => ({ type: "text" as const, text: part.text! }));
  return { stop_reason: content.length ? "tool_use" : "end_turn", content: [...text, ...content], geminiParts: candidate.content.parts };
}
