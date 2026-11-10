import { describe, expect, it } from "vitest";
import { detectSubscriptions, type RawTransactionForDetection } from "./subscriptions";

describe("detectSubscriptions", () => {
  it("detecta assinaturas recorrentes com base em múltiplos meses de cobrança", () => {
    const txs: RawTransactionForDetection[] = [
      // Mês 10
      { description: "Netflix Com", amountCents: 3990, date: new Date("2026-10-05T12:00Z"), categoryName: "Streaming" },
      { description: "Spotify Brasil", amountCents: 2190, date: new Date("2026-10-10T12:00Z"), categoryName: "Streaming" },
      // Mês 11
      { description: "Netflix Com", amountCents: 3990, date: new Date("2026-11-05T12:00Z"), categoryName: "Streaming" },
      { description: "Spotify Brasil", amountCents: 2190, date: new Date("2026-11-10T12:00Z"), categoryName: "Streaming" },
      // Transação avulsa que só ocorreu uma vez
      { description: "Restaurante Central", amountCents: 15000, date: new Date("2026-11-08T12:00Z"), categoryName: "Alimentação" },
    ];

    const registeredRules = ["Spotify Brasil"]; // Spotify já está cadastrado, Netflix não

    const result = detectSubscriptions(txs, registeredRules);

    // Deve detectar Netflix e Spotify
    expect(result).toHaveLength(2);

    const netflix = result.find((s) => s.normalizedName.includes("netflix"))!;
    expect(netflix).toBeDefined();
    expect(netflix.isRegistered).toBe(false); // Esquecido / não cadastrado
    expect(netflix.monthOccurrences).toBe(2);
    expect(netflix.hasPriceIncrease).toBe(false);

    const spotify = result.find((s) => s.normalizedName.includes("spotify"))!;
    expect(spotify).toBeDefined();
    expect(spotify.isRegistered).toBe(true); // Já cadastrado
  });

  it("detecta aumento de preço entre o mês anterior e o mês atual", () => {
    const txs: RawTransactionForDetection[] = [
      // Mês 10: R$ 40,00
      { description: "ChatGPT Plus", amountCents: 10000, date: new Date("2026-10-02T12:00Z") },
      // Mês 11: subiu para R$ 120,00 (+20%)
      { description: "ChatGPT Plus", amountCents: 12000, date: new Date("2026-11-02T12:00Z") },
    ];

    const result = detectSubscriptions(txs, []);
    expect(result).toHaveLength(1);

    const chatGpt = result[0];
    expect(chatGpt.hasPriceIncrease).toBe(true);
    expect(chatGpt.priceIncreaseCents).toBe(2000);
    expect(chatGpt.priceIncreasePct).toBe(20);
    expect(chatGpt.previousAmountCents).toBe(10000);
    expect(chatGpt.currentAmountCents).toBe(12000);
  });

  it("ignora aumento se o valor diminuiu ou permaneceu igual", () => {
    const txs: RawTransactionForDetection[] = [
      { description: "Academia", amountCents: 15000, date: new Date("2026-10-01T12:00Z") },
      { description: "Academia", amountCents: 13000, date: new Date("2026-11-01T12:00Z") },
    ];

    const result = detectSubscriptions(txs, []);
    expect(result[0].hasPriceIncrease).toBe(false);
  });
});
