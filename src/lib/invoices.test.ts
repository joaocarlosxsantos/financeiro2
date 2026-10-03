import { describe, expect, it } from "vitest";
import {
  invoiceAlerts,
  invoiceCycle,
  invoiceRefForInstallment,
  resolveTransactionInvoiceRef,
  type Invoice,
} from "./invoices";

const d = (iso: string) => new Date(iso.includes("T") ? iso : `${iso}T12:00:00Z`);

describe("invoiceCycle", () => {
  describe("Dia 31 em fevereiro (bissexto e não bissexto)", () => {
    it("não bissexto (2023): closingDay=31 ajusta fechamento efetivo para 28 de fevereiro", () => {
      // Compra antes ou no fechamento efetivo de fevereiro (28/02)
      const res = invoiceCycle(d("2023-02-15"), 31, 10);
      expect(res.closesOn).toEqual(d("2023-02-28"));
      expect(res.periodStart).toEqual(d("2023-02-01"));
      expect(res.dueOn).toEqual(d("2023-03-10"));
      expect(res.ref).toBe("2023-03");

      // Compra no próprio dia 28/02
      const resLastDay = invoiceCycle(d("2023-02-28"), 31, 10);
      expect(resLastDay.closesOn).toEqual(d("2023-02-28"));
      expect(resLastDay.dueOn).toEqual(d("2023-03-10"));
      expect(resLastDay.ref).toBe("2023-03");
    });

    it("bissexto (2024): closingDay=31 ajusta fechamento efetivo para 29 de fevereiro", () => {
      // Compra em ano bissexto antes ou no fechamento (29/02)
      const res = invoiceCycle(d("2024-02-15"), 31, 10);
      expect(res.closesOn).toEqual(d("2024-02-29"));
      expect(res.periodStart).toEqual(d("2024-02-01"));
      expect(res.dueOn).toEqual(d("2024-03-10"));
      expect(res.ref).toBe("2024-03");

      // Compra no próprio dia 29/02
      const res29 = invoiceCycle(d("2024-02-29"), 31, 10);
      expect(res29.closesOn).toEqual(d("2024-02-29"));
      expect(res29.dueOn).toEqual(d("2024-03-10"));
      expect(res29.ref).toBe("2024-03");
    });

    it("dueDay=31 em fevereiro é limitado a 28 (não bissexto) ou 29 (bissexto)", () => {
      // dueDay=31 > closingDay=10 -> vence no mesmo mês do fechamento (fevereiro)
      const res2023 = invoiceCycle(d("2023-02-05"), 10, 31);
      expect(res2023.closesOn).toEqual(d("2023-02-10"));
      expect(res2023.dueOn).toEqual(d("2023-02-28"));
      expect(res2023.ref).toBe("2023-02");

      const res2024 = invoiceCycle(d("2024-02-05"), 10, 31);
      expect(res2024.closesOn).toEqual(d("2024-02-10"));
      expect(res2024.dueOn).toEqual(d("2024-02-29"));
      expect(res2024.ref).toBe("2024-02");
    });
  });

  describe("Fechamento e vencimento relativos", () => {
    it("fechamento 25 / vencimento 5 (dueDay <= closingDay): vence no mês seguinte", () => {
      // Compra dia 10 <= 25 -> fecha no mesmo mês (abril), vence em maio
      const res = invoiceCycle(d("2026-04-10"), 25, 5);
      expect(res.closesOn).toEqual(d("2026-04-25"));
      expect(res.periodStart).toEqual(d("2026-03-26"));
      expect(res.dueOn).toEqual(d("2026-05-05"));
      expect(res.ref).toBe("2026-05");

      // Compra dia 26 > 25 -> fecha no mês seguinte (maio), vence em junho
      const resNext = invoiceCycle(d("2026-04-26"), 25, 5);
      expect(resNext.closesOn).toEqual(d("2026-05-25"));
      expect(resNext.periodStart).toEqual(d("2026-04-26"));
      expect(resNext.dueOn).toEqual(d("2026-06-05"));
      expect(resNext.ref).toBe("2026-06");
    });

    it("fechamento 5 / vencimento 15 (dueDay > closingDay): vence no mesmo mês do fechamento", () => {
      // Compra dia 3 <= 5 -> fecha em abril, vence em abril
      const res = invoiceCycle(d("2026-04-03"), 5, 15);
      expect(res.closesOn).toEqual(d("2026-04-05"));
      expect(res.periodStart).toEqual(d("2026-03-06"));
      expect(res.dueOn).toEqual(d("2026-04-15"));
      expect(res.ref).toBe("2026-04");

      // Compra dia 6 > 5 -> fecha em maio, vence em maio
      const resNext = invoiceCycle(d("2026-04-06"), 5, 15);
      expect(resNext.closesOn).toEqual(d("2026-05-05"));
      expect(resNext.periodStart).toEqual(d("2026-04-06"));
      expect(resNext.dueOn).toEqual(d("2026-05-15"));
      expect(resNext.ref).toBe("2026-05");
    });
  });

  describe("Compra no dia exato do fechamento", () => {
    it("compra no dia exato do fechamento entra na fatura daquele mês (regra dia <= fechamento)", () => {
      // Fechamento no dia 20, compra no dia 20 -> entra na fatura que fecha no dia 20
      const onClosing = invoiceCycle(d("2026-05-20"), 20, 28);
      expect(onClosing.closesOn).toEqual(d("2026-05-20"));
      expect(onClosing.dueOn).toEqual(d("2026-05-28"));
      expect(onClosing.ref).toBe("2026-05");

      // Compra no dia 21 (dia seguinte) -> cai na fatura do mês seguinte (junho)
      const afterClosing = invoiceCycle(d("2026-05-21"), 20, 28);
      expect(afterClosing.closesOn).toEqual(d("2026-06-20"));
      expect(afterClosing.dueOn).toEqual(d("2026-06-28"));
      expect(afterClosing.ref).toBe("2026-06");
    });
  });

  describe("Virada de ano (dezembro → janeiro)", () => {
    it("compra antes do fechamento de dezembro com vencimento em janeiro", () => {
      const res = invoiceCycle(d("2026-12-10"), 25, 5);
      expect(res.closesOn).toEqual(d("2026-12-25"));
      expect(res.periodStart).toEqual(d("2026-11-26"));
      expect(res.dueOn).toEqual(d("2027-01-05"));
      expect(res.ref).toBe("2027-01");
    });

    it("compra após o fechamento de dezembro fecha em janeiro do ano seguinte", () => {
      const res = invoiceCycle(d("2026-12-28"), 25, 5);
      expect(res.closesOn).toEqual(d("2027-01-25"));
      expect(res.periodStart).toEqual(d("2026-12-26"));
      expect(res.dueOn).toEqual(d("2027-02-05"));
      expect(res.ref).toBe("2027-02");
    });

    it("compra após o fechamento de dezembro com dueDay > closingDay fecha e vence em janeiro", () => {
      const res = invoiceCycle(d("2026-12-28"), 25, 30);
      expect(res.closesOn).toEqual(d("2027-01-25"));
      expect(res.dueOn).toEqual(d("2027-01-30"));
      expect(res.ref).toBe("2027-01");
    });
  });

  describe("Casos de borda (edges)", () => {
    it("closingDay=31 em meses de 30 dias (abril, junho, setembro, novembro)", () => {
      const resApr = invoiceCycle(d("2026-04-30"), 31, 10);
      expect(resApr.closesOn).toEqual(d("2026-04-30"));
      expect(resApr.dueOn).toEqual(d("2026-05-10"));
      expect(resApr.ref).toBe("2026-05");

      const resSep = invoiceCycle(d("2026-09-30"), 31, 5);
      expect(resSep.closesOn).toEqual(d("2026-09-30"));
      expect(resSep.dueOn).toEqual(d("2026-10-05"));
      expect(resSep.ref).toBe("2026-10");
    });

    it("closingDay=31 e dueDay=31 (dueDay <= closingDay): vence no último dia do mês seguinte", () => {
      // Janeiro (31 dias) -> fecha em 31/01 -> vence em 28/02 (fevereiro não bissexto)
      const resJan = invoiceCycle(d("2026-01-15"), 31, 31);
      expect(resJan.closesOn).toEqual(d("2026-01-31"));
      expect(resJan.dueOn).toEqual(d("2026-02-28"));
      expect(resJan.ref).toBe("2026-02");

      // Março (31 dias) -> fecha em 31/03 -> vence em 30/04 (abril tem 30 dias)
      const resMar = invoiceCycle(d("2026-03-15"), 31, 31);
      expect(resMar.closesOn).toEqual(d("2026-03-31"));
      expect(resMar.dueOn).toEqual(d("2026-04-30"));
      expect(resMar.ref).toBe("2026-04");
    });

    it("closingDay=1 e dueDay=1 (dueDay <= closingDay): vence no dia 1 do mês seguinte", () => {
      const res = invoiceCycle(d("2026-05-01"), 1, 1);
      expect(res.closesOn).toEqual(d("2026-05-01"));
      expect(res.dueOn).toEqual(d("2026-06-01"));
      expect(res.ref).toBe("2026-06");

      const resAfter = invoiceCycle(d("2026-05-02"), 1, 1);
      expect(resAfter.closesOn).toEqual(d("2026-06-01"));
      expect(resAfter.dueOn).toEqual(d("2026-07-01"));
      expect(resAfter.ref).toBe("2026-07");
    });

    it("closingDay=1 e dueDay=31 (dueDay > closingDay): vence no mesmo mês", () => {
      const res = invoiceCycle(d("2026-02-01"), 1, 31);
      expect(res.closesOn).toEqual(d("2026-02-01"));
      expect(res.dueOn).toEqual(d("2026-02-28"));
      expect(res.ref).toBe("2026-02");
    });

    it("rejeita closingDay ou dueDay fora do intervalo 1..31", () => {
      expect(() => invoiceCycle(d("2026-05-01"), 0, 10)).toThrow(RangeError);
      expect(() => invoiceCycle(d("2026-05-01"), 32, 10)).toThrow(RangeError);
      expect(() => invoiceCycle(d("2026-05-01"), 10, 0)).toThrow(RangeError);
      expect(() => invoiceCycle(d("2026-05-01"), 10, 32)).toThrow(RangeError);
    });
  });
});

describe("invoiceRefForInstallment", () => {
  it("parcelas 1..12 atravessando ano inteiro avançam mês a mês sem desvio", () => {
    const ref1 = "2026-07";
    const expected = [
      "2026-07", // k=1
      "2026-08", // k=2
      "2026-09", // k=3
      "2026-10", // k=4
      "2026-11", // k=5
      "2026-12", // k=6
      "2027-01", // k=7 (virada de ano)
      "2027-02", // k=8
      "2027-03", // k=9
      "2027-04", // k=10
      "2027-05", // k=11
      "2027-06", // k=12
    ];

    for (let k = 1; k <= 12; k++) {
      expect(invoiceRefForInstallment(ref1, k)).toBe(expected[k - 1]);
    }
  });

  it("parcela 2 de compra em 31/01 com fechamento dia 30 cai em março, não fevereiro", () => {
    // Compra em 31/01 com closingDay=30, dueDay=31:
    // 31 > 30 -> fecha em fevereiro (28/02) e vence em fevereiro (28/02) -> ref1 = "2026-02".
    const cycle1 = invoiceCycle(d("2026-01-31"), 30, 31);
    expect(cycle1.ref).toBe("2026-02");

    // Parcela 2 via invoiceRefForInstallment cai no mês seguinte (março), não em fevereiro!
    const ref2 = invoiceRefForInstallment(cycle1.ref, 2);
    expect(ref2).toBe("2026-03");

    // Se closingDay=30 e dueDay=10 (dueDay <= closingDay):
    // Parcela 1 fecha em 28/02 e vence em 10/03 -> ref1 = "2026-03".
    const cycleDue10 = invoiceCycle(d("2026-01-31"), 30, 10);
    expect(cycleDue10.ref).toBe("2026-03");
    // Parcela 2 cai em abril ("2026-04"), avançando mês a mês
    expect(invoiceRefForInstallment(cycleDue10.ref, 2)).toBe("2026-04");
  });

  it("valida installmentIndex >= 1 e formato de ref1", () => {
    expect(() => invoiceRefForInstallment("2026-05", 0)).toThrow(RangeError);
    expect(() => invoiceRefForInstallment("invalido", 1)).toThrow();
    expect(() => invoiceRefForInstallment("2026-13", 1)).toThrow(RangeError);
  });
});

describe("invoiceAlerts", () => {
  const today = d("2026-10-05");

  it("alerta fatura vencida (diffDays < 0)", () => {
    const invoices: Invoice[] = [
      {
        ref: "2026-10",
        dueOn: d("2026-10-04"),
        balanceCents: 150000,
        accountName: "Nubank",
      },
    ];

    const alerts = invoiceAlerts(invoices, today);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].status).toBe("overdue");
    expect(alerts[0].tone).toBe("warn");
    expect(alerts[0].title).toBe("Fatura do Nubank vencida");
    expect(alerts[0].description).toMatch(/ontem/);
    expect(alerts[0].description).toMatch(/R\$\s*1\.500,00/);
    expect(alerts[0].diffDays).toBe(-1);
  });

  it("alerta fatura que vence hoje (diffDays === 0)", () => {
    const invoices: Invoice[] = [
      {
        ref: "2026-10",
        dueOn: d("2026-10-05"),
        balanceCents: 85000,
      },
    ];

    const alerts = invoiceAlerts(invoices, today);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].status).toBe("due_soon");
    expect(alerts[0].title).toBe("Fatura 2026-10 vence hoje");
    expect(alerts[0].description).toMatch(/vence hoje/i);
    expect(alerts[0].diffDays).toBe(0);
  });

  it("alerta fatura que vence amanhã (diffDays === 1)", () => {
    const invoices: Invoice[] = [
      {
        ref: "2026-10",
        dueOn: d("2026-10-06"),
        balanceCents: 50000,
      },
    ];

    const alerts = invoiceAlerts(invoices, today);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe("Fatura 2026-10 vence amanhã");
    expect(alerts[0].diffDays).toBe(1);
  });

  it("alerta fatura que vence em até 3 dias (diffDays === 3)", () => {
    const invoices: Invoice[] = [
      {
        ref: "2026-10",
        dueOn: d("2026-10-08"),
        balanceCents: 120000,
      },
    ];

    const alerts = invoiceAlerts(invoices, today);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe("Fatura 2026-10 vence em 3 dias");
    expect(alerts[0].diffDays).toBe(3);
  });

  it("não alerta fatura com mais de 3 dias até o vencimento (diffDays >= 4)", () => {
    const invoices: Invoice[] = [
      {
        ref: "2026-10",
        dueOn: d("2026-10-09"),
        balanceCents: 200000,
      },
    ];

    const alerts = invoiceAlerts(invoices, today);
    expect(alerts).toHaveLength(0);
  });

  it("não alerta fatura sem saldo devedor (balanceCents <= 0: paga ou em crédito)", () => {
    const invoices: Invoice[] = [
      {
        ref: "2026-10",
        dueOn: d("2026-10-04"), // vencida, mas já paga
        balanceCents: 0,
      },
      {
        ref: "2026-10",
        dueOn: d("2026-10-05"), // vence hoje, mas saldo de crédito
        balanceCents: -5000,
      },
    ];

    const alerts = invoiceAlerts(invoices, today);
    expect(alerts).toHaveLength(0);
  });

  it("ordena múltiplos alertas por data de vencimento (mais urgentes primeiro)", () => {
    const invoices: Invoice[] = [
      { ref: "2026-10", dueOn: d("2026-10-08"), balanceCents: 30000 },
      { ref: "2026-09", dueOn: d("2026-10-02"), balanceCents: 40000 },
      { ref: "2026-10", dueOn: d("2026-10-05"), balanceCents: 50000 },
    ];

    const alerts = invoiceAlerts(invoices, today);
    expect(alerts).toHaveLength(3);
    expect(alerts[0].diffDays).toBe(-3); // mais atrasada primeiro
    expect(alerts[1].diffDays).toBe(0);  // hoje
    expect(alerts[2].diffDays).toBe(3);  // em 3 dias
  });
});

describe("resolveTransactionInvoiceRef", () => {
  it("calcula ref do ciclo para compra em cartão com closingDay e dueDay", () => {
    const ref = resolveTransactionInvoiceRef({
      accountType: "CREDIT_CARD",
      closingDay: 25,
      dueDay: 5,
      date: d("2026-04-10"),
    });
    expect(ref).toBe("2026-05");
  });

  it("retorna batchInvoiceRef diretamente se fornecido para cartão com closingDay", () => {
    const ref = resolveTransactionInvoiceRef({
      accountType: "CREDIT_CARD",
      closingDay: 25,
      dueDay: 5,
      date: d("2026-04-10"),
      batchInvoiceRef: "2026-04",
    });
    expect(ref).toBe("2026-04");
  });

  it("retorna null se a conta não tiver closingDay configurado", () => {
    const ref = resolveTransactionInvoiceRef({
      accountType: "CREDIT_CARD",
      closingDay: null,
      dueDay: 5,
      date: d("2026-04-10"),
      batchInvoiceRef: "2026-04",
    });
    expect(ref).toBeNull();
  });

  it("retorna null se a conta não for CREDIT_CARD", () => {
    const ref = resolveTransactionInvoiceRef({
      accountType: "CHECKING",
      closingDay: 25,
      dueDay: 5,
      date: d("2026-04-10"),
    });
    expect(ref).toBeNull();
  });
});
