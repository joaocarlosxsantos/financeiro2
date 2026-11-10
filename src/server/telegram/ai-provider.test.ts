import { describe, expect, it } from "vitest";
import { selectAiProvider } from "./ai-provider";

describe("seleção de provedor IA", () => {
  it.each([
    [{}, null], [{ GEMINI_API_KEY: "  ", ANTHROPIC_API_KEY: "" }, null],
    [{ GEMINI_API_KEY: "fake-google" }, "gemini"], [{ ANTHROPIC_API_KEY: "fake-anthropic" }, "anthropic"],
    [{ GEMINI_API_KEY: "fake-google", ANTHROPIC_API_KEY: "fake-anthropic" }, "gemini"],
    [{ AI_PROVIDER: "anthropic", GEMINI_API_KEY: "fake-google", ANTHROPIC_API_KEY: "fake-anthropic" }, "anthropic"],
    [{ AI_PROVIDER: "gemini", GEMINI_API_KEY: " fake-google ", ANTHROPIC_API_KEY: "fake-anthropic" }, "gemini"],
    [{ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "fake-anthropic" }, null],
    [{ AI_PROVIDER: "anthropic", GEMINI_API_KEY: "fake-google" }, null],
    [{ AI_PROVIDER: "other", GEMINI_API_KEY: "fake-google" }, null],
  ] as const)("seleciona configuração %j sem fallback silencioso", (env, expected) => {
    expect(selectAiProvider(env)).toBe(expected);
  });
});
