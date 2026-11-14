import { describe, expect, it } from "vitest";
import { detectSubscriptions, type RawTransactionForDetection } from "./subscriptions";

describe("detectSubscriptions", () => {
  const pair = (description: string, extra = {}): RawTransactionForDetection[] => [
    { description, amountCents: 3990, date: new Date("2026-10-05T12:00Z"), ...extra },
    { description, amountCents: 3990, date: new Date("2026-11-05T12:00Z"), ...extra },
  ];
  it("exclui falsos positivos mesmo quando repetidos em meses distintos", () => {
    const transactions = ["PIX João", "Mercado Central", "Restaurante Central", "Amazon BR", "Google Play",
      "Transferência Netflix", "Netflix parcela 1/12", "Notebook 2/10"].flatMap(d => pair(d));
    transactions.push(...pair("Spotify", { isTransfer: true }), ...pair("Netflix", { isCardPayment: true }),
      ...pair("Assinatura CDB", { accountType: "INVESTMENT" }), ...pair("Mensalidade celular", { installmentGroupId: "phone" }));
    expect(detectSubscriptions(transactions, ["Mercado Central", "Restaurante Central"])).toEqual([]);
  });
  it("exige cadência e valor estáveis até para merchants conhecidos", () => {
    expect(detectSubscriptions([pair("Netflix")[0]], [])).toEqual([]);
    expect(detectSubscriptions([pair("Netflix")[0], { ...pair("Netflix")[1], amountCents: 19000 }], [])).toEqual([]);
    expect(detectSubscriptions([pair("Netflix")[0], { ...pair("Netflix")[1], date: new Date("2026-11-25T12:00Z") }], [])).toEqual([]);
    expect(detectSubscriptions([...pair("Netflix"), { ...pair("Netflix")[1], date: new Date("2026-11-10T12:00Z") }], [])).toEqual([]);
  });
  it("reconhece cobrança anual e descritores de adquirentes sem incluir compras Amazon", () => {
    const result = detectSubscriptions([
      { description: "EBN *Netflix 123456", amountCents: 3990, date: new Date("2026-10-05T12:00Z") },
      { description: "Netflix.com 789456", amountCents: 3990, date: new Date("2026-11-05T12:00Z") },
      { description: "Amazon Prime", amountCents: 16680, date: new Date("2025-11-05T12:00Z") },
      { description: "Amazon Prime", amountCents: 16680, date: new Date("2026-11-05T12:00Z") },
      ...pair("Amazon Marketplace"),
    ], ["Netflix"]);
    expect(result).toHaveLength(2);
    expect(result.find(s => s.name === "Amazon Prime")?.cadence).toBe("annual");
    expect(result.find(s => s.normalizedName === "netflix")).toMatchObject({ cadence: "monthly", isRegistered: true });
  });
  it("aceita serviços desconhecidos com evidência explícita de assinatura e recorrência", () => {
    expect(detectSubscriptions(pair("Assinatura Revista Ciência"), [])[0]).toMatchObject({ cadence: "monthly" });
    expect(detectSubscriptions(pair("PIX avulso Assinatura Revista Ciência"), [])).toEqual([]);
  });
  it("não lista como ativa uma assinatura mensal que deixou de cobrar", () => {
    expect(detectSubscriptions(pair("Netflix"), [], new Date("2027-02-01T12:00Z"))).toEqual([]);
  });
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
