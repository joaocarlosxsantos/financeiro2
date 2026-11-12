import { describe, expect, it } from "vitest";
import { parseNaturalTransaction } from "./natural-transaction-parser";

describe("parseNaturalTransaction", () => {
  const fixedNow = new Date("2026-11-12T15:00:00.000Z"); // Quinta-feira em SP

  it("reconhece despesas simples com valor e descrição", () => {
    const res1 = parseNaturalTransaction("mercado 35", fixedNow);
    expect(res1).not.toBeNull();
    expect(res1?.amountCents).toBe(3500);
    expect(res1?.kind).toBe("EXPENSE");
    expect(res1?.description).toBe("Mercado");
    expect(res1?.date).toBe("2026-11-12");

    const res2 = parseNaturalTransaction("almoço 42,50", fixedNow);
    expect(res2?.amountCents).toBe(4250);
    expect(res2?.kind).toBe("EXPENSE");
    expect(res2?.description).toBe("Almoço");
    expect(res2?.date).toBe("2026-11-12");
  })

  it("reconhece valor na frente da descrição", () => {
    const res = parseNaturalTransaction("50 farmácia", fixedNow);
    expect(res?.amountCents).toBe(5000);
    expect(res?.kind).toBe("EXPENSE");
    expect(res?.description).toBe("Farmácia");
  });

  it("reconhece moeda explícita R$ e reais", () => {
    const res1 = parseNaturalTransaction("R$ 150 luz", fixedNow);
    expect(res1?.amountCents).toBe(15000);
    expect(res1?.description).toBe("Luz");

    const res2 = parseNaturalTransaction("uber 25 reais", fixedNow);
    expect(res2?.amountCents).toBe(2500);
    expect(res2?.description).toBe("Uber");
  });

  it("reconhece datas relativas: hoje, ontem, anteontem", () => {
    const resHoje = parseNaturalTransaction("uber 25 hoje", fixedNow);
    expect(resHoje?.date).toBe("2026-11-12");

    const resOntem = parseNaturalTransaction("uber 25 ontem", fixedNow);
    expect(resOntem?.date).toBe("2026-11-11");

    const resAnteontem = parseNaturalTransaction("cinema 40 anteontem", fixedNow);
    expect(resAnteontem?.date).toBe("2026-11-10");
  });

  it("reconhece receitas com triggers e +", () => {
    const res1 = parseNaturalTransaction("salario 5000", fixedNow);
    expect(res1?.kind).toBe("INCOME");
    expect(res1?.amountCents).toBe(500000);

    const res2 = parseNaturalTransaction("recebi 300 freela", fixedNow);
    expect(res2?.kind).toBe("INCOME");
    expect(res2?.amountCents).toBe(30000);

    const res3 = parseNaturalTransaction("+250 pix", fixedNow);
    expect(res3?.kind).toBe("INCOME");
    expect(res3?.amountCents).toBe(25000);
  });

  it("remove palavras de ligação e verbos comuns na descrição", () => {
    const res = parseNaturalTransaction("paguei 89,90 no mercado", fixedNow);
    expect(res?.amountCents).toBe(8990);
    expect(res?.description).toBe("Mercado");
  });

  it("suporta comando explícito /lancar, /gasto, /receita", () => {
    const res1 = parseNaturalTransaction("/lancar ferramenta rara 120", fixedNow);
    expect(res1?.amountCents).toBe(12000);
    expect(res1?.description).toBe("Ferramenta rara");

    const res2 = parseNaturalTransaction("/receita venda do teclado 450", fixedNow);
    expect(res2?.kind).toBe("INCOME");
    expect(res2?.amountCents).toBe(45000);
    expect(res2?.description).toBe("Venda teclado");
  });

  it("rejeita perguntas e mensagens que não são lançamentos", () => {
    expect(parseNaturalTransaction("qual é meu saldo?", fixedNow)).toBeNull();
    expect(parseNaturalTransaction("quanto gastei este mês?", fixedNow)).toBeNull();
    expect(parseNaturalTransaction("listar gastos", fixedNow)).toBeNull();
    expect(parseNaturalTransaction("olá, tudo bem?", fixedNow)).toBeNull();
    expect(parseNaturalTransaction("/saldo", fixedNow)).toBeNull();
    expect(parseNaturalTransaction("/resumo", fixedNow)).toBeNull();
    expect(parseNaturalTransaction("/ajuda", fixedNow)).toBeNull();
    expect(parseNaturalTransaction("xyz 123", fixedNow)).toBeNull(); // sem termo comum, sem R$, sem data
  });
});
