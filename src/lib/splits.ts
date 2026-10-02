/**
 * Regras puras de divisão de um lançamento entre pessoas — sem banco, testável isolada.
 *
 * Permite dividir um lançamento (despesa) com outras pessoas para saber
 * quanto cada um deve. O lançamento mantém o valor TOTAL.
 * A parte do dono NÃO é gravada no banco: minha parte = total - soma dos outros.
 */

import { splitBillEqually } from "./bills";

export type SplitMode = "EQUAL" | "PERCENT" | "VALUE";

export type SplitPersonInput = {
  name: string;
  phone?: string | null;
  amount?: number;
  basisPoints?: number;
  percent?: number;
};

export type SplitResultItem = {
  name: string;
  phone?: string | null;
  amountCents: number;
};

export type ComputeSplitSuccess = {
  ok: true;
  amounts: SplitResultItem[];
  myShareCents: number;
};

export type ComputeSplitError = {
  ok: false;
  error: string;
};

export type ComputeSplitResult = ComputeSplitSuccess | ComputeSplitError;

/**
 * Calcula a divisão do valor total entre as outras pessoas e o dono.
 *
 * @param totalCents Valor total do lançamento em centavos (deve ser > 0).
 * @param mode Modo de divisão: EQUAL, PERCENT ou VALUE.
 * @param others Lista das outras pessoas participantes.
 * @param myIncluded Se a parte do próprio dono está incluída na divisão.
 */
export function computeSplit(
  totalCents: number,
  mode: SplitMode,
  others: SplitPersonInput[],
  myIncluded: boolean,
): ComputeSplitResult {
  if (typeof totalCents !== "number" || !Number.isFinite(totalCents) || totalCents <= 0) {
    return { ok: false, error: "O valor total deve ser maior que zero." };
  }

  if (!Array.isArray(others) || others.length === 0) {
    return { ok: false, error: "Informe ao menos uma pessoa para dividir." };
  }

  if (others.length > 20) {
    return { ok: false, error: "O limite máximo é de 20 pessoas." };
  }

  // Validação dos nomes: não vazios e sem duplicados (case-insensitive)
  const seenNames = new Set<string>();
  for (const person of others) {
    const trimmed = person.name ? person.name.trim() : "";
    if (!trimmed) {
      return { ok: false, error: "O nome de cada pessoa não pode ser vazio." };
    }
    const lower = trimmed.toLowerCase();
    if (seenNames.has(lower)) {
      return { ok: false, error: `Nomes duplicados não são permitidos: "${trimmed}".` };
    }
    seenNames.add(lower);
  }

  if (mode === "EQUAL") {
    const count = myIncluded ? others.length + 1 : others.length;
    const shares = splitBillEqually(totalCents, count);

    // As primeiras pessoas recebem as primeiras parcelas (absorvendo resto de centavos)
    const amounts: SplitResultItem[] = others.map((p, i) => ({
      name: p.name.trim(),
      phone: p.phone?.trim() || null,
      amountCents: shares[i],
    }));

    const myShareCents = myIncluded ? shares[shares.length - 1] : 0;
    return { ok: true, amounts, myShareCents };
  }

  if (mode === "VALUE") {
    for (const p of others) {
      const amt = Math.round(p.amount ?? 0);
      if (amt < 0) {
        return { ok: false, error: "O valor de cada pessoa não pode ser negativo." };
      }
    }

    const sumOthers = others.reduce((acc, p) => acc + Math.round(p.amount ?? 0), 0);

    if (sumOthers > totalCents) {
      return { ok: false, error: "A soma das partes não pode ultrapassar o valor total." };
    }

    if (!myIncluded && sumOthers !== totalCents) {
      return {
        ok: false,
        error: "A soma das partes deve ser igual ao valor total quando você não participa da divisão.",
      };
    }

    const myShareCents = myIncluded ? totalCents - sumOthers : 0;
    const amounts: SplitResultItem[] = others.map((p) => ({
      name: p.name.trim(),
      phone: p.phone?.trim() || null,
      amountCents: Math.round(p.amount ?? 0),
    }));

    return { ok: true, amounts, myShareCents };
  }

  if (mode === "PERCENT") {
    // Determina basis points para cada pessoa (100% = 10000 bps)
    const allAmountsUnderOrEqual100 = others.every(
      (o) => o.basisPoints === undefined && o.percent === undefined && (o.amount ?? 0) <= 100,
    );

    const bpsList = others.map((p) => {
      if (p.basisPoints !== undefined) {
        return Math.round(p.basisPoints);
      }
      if (p.percent !== undefined) {
        return Math.round(p.percent * 100);
      }
      if (p.amount !== undefined) {
        return allAmountsUnderOrEqual100 ? Math.round(p.amount * 100) : Math.round(p.amount);
      }
      return 0;
    });

    for (const val of bpsList) {
      if (val < 0) {
        return { ok: false, error: "A porcentagem não pode ser negativa." };
      }
    }

    const sumOthersBps = bpsList.reduce((acc, b) => acc + b, 0);

    if (myIncluded) {
      if (sumOthersBps > 10000) {
        return { ok: false, error: "A soma das porcentagens não pode ultrapassar 100%." };
      }
    } else {
      if (sumOthersBps !== 10000) {
        return { ok: false, error: "A soma das porcentagens deve totalizar 100%." };
      }
    }

    const myBps = myIncluded ? 10000 - sumOthersBps : 0;

    type Entry = {
      type: "other" | "me";
      index: number;
      name: string;
      phone: string | null;
      bps: number;
      baseCents: number;
    };

    const entries: Entry[] = others.map((p, i) => ({
      type: "other",
      index: i,
      name: p.name.trim(),
      phone: p.phone?.trim() || null,
      bps: bpsList[i],
      baseCents: Math.floor((totalCents * bpsList[i]) / 10000),
    }));

    if (myIncluded && myBps > 0) {
      entries.push({
        type: "me",
        index: -1,
        name: "Você",
        phone: null,
        bps: myBps,
        baseCents: Math.floor((totalCents * myBps) / 10000),
      });
    }

    const totalBase = entries.reduce((acc, e) => acc + e.baseCents, 0);
    const remainder = totalCents - totalBase;

    // "resto nas maiores": distribui os centavos restantes para as maiores porcentagens
    const sorted = [...entries].sort((a, b) => {
      if (b.bps !== a.bps) return b.bps - a.bps;
      return (a.type === "other" ? a.index : 999) - (b.type === "other" ? b.index : 999);
    });

    for (let i = 0; i < remainder; i++) {
      sorted[i % sorted.length].baseCents += 1;
    }

    const amounts: SplitResultItem[] = others.map((_, i) => {
      const entry = entries.find((e) => e.type === "other" && e.index === i)!;
      return {
        name: entry.name,
        phone: entry.phone,
        amountCents: entry.baseCents,
      };
    });

    const meEntry = entries.find((e) => e.type === "me");
    const myShareCents = meEntry ? meEntry.baseCents : 0;

    return { ok: true, amounts, myShareCents };
  }

  return { ok: false, error: "Modo de divisão inválido." };
}
