import { getNowInSaoPaulo } from "@/lib/dates";

export interface ParsedNaturalTransaction {
  amountCents: number;
  kind: "INCOME" | "EXPENSE";
  description: string;
  date: string; // YYYY-MM-DD
}

const INCOME_TRIGGERS = /\b(recebi|recebimento|ganhei|salario|salário|renda|freela|reembolso|deposito|depósito|pix recebido|entrada)\b/i;
const QUESTION_TRIGGERS = /\b(quais|qual|quanto|quantos|quantas|listar|liste|mostre|consultar|ver|extrato|saldo|relatorio|relatório|ajuda|menu)\b/i;

const COMMON_EXPENSE_TERMS = new Set([
  "mercado", "supermercado", "almoco", "almoço", "jantar", "cafe", "café",
  "lanche", "padaria", "farmacia", "farmácia", "remedio", "remédio", "uber",
  "taxi", "táxi", "99", "onibus", "ônibus", "metro", "metrô", "gasolina",
  "combustivel", "combustível", "posto", "estacionamento", "pedagio", "pedágio",
  "luz", "energia", "agua", "água", "gas", "gás", "internet", "telefone", "celular",
  "aluguel", "condominio", "condomínio", "iptu", "ipva", "seguro", "academia",
  "cinema", "livro", "curso", "streaming", "netflix", "spotify", "bar",
  "restaurante", "pizza", "hamburguer", "hambúrguer", "compras", "roupa",
  "calcado", "calçado", "pet", "veterinario", "veterinário", "racao", "ração",
  "medico", "médico", "dentista", "exame", "presente", "doacao", "doação",
  "gasto", "despesa", "pagamento", "pix", "compra", "cartao", "cartão",
]);

/**
 * Analisa uma mensagem em linguagem natural e extrai valor, tipo, descrição e data.
 * Retorna null se a mensagem não for um lançamento financeiro válido.
 */
export function parseNaturalTransaction(
  rawText: string | undefined | null,
  now: Date = new Date(),
): ParsedNaturalTransaction | null {
  if (!rawText) return null;
  const text = rawText.trim();
  if (!text) return null;

  // Perguntas ou mensagens que terminam com ? não são lançamentos
  if (text.endsWith("?") || QUESTION_TRIGGERS.test(text)) {
    return null;
  }

  // Comandos que não sejam /lancar, /gasto, /despesa, /receita são ignorados
  let workingText = text;
  const isExplicitCommand = /^\/(lancar|lançar|gasto|despesa|receita)\b/i.test(workingText);
  if (workingText.startsWith("/") && !isExplicitCommand) {
    return null;
  }

  if (isExplicitCommand) {
    workingText = workingText.replace(/^\/(lancar|lançar|gasto|despesa|receita)\s*/i, "");
  }

  // 1. Extração da data (hoje, ontem, anteontem ou DD/MM[/YYYY])
  const spNow = getNowInSaoPaulo(now);
  let targetDate = new Date(spNow.getFullYear(), spNow.getMonth(), spNow.getDate());
  let dateFound = false;

  if (/\bhoje\b/i.test(workingText)) {
    workingText = workingText.replace(/\bhoje\b/gi, " ");
    dateFound = true;
  } else if (/\banteontem\b/i.test(workingText)) {
    targetDate.setDate(targetDate.getDate() - 2);
    workingText = workingText.replace(/\banteontem\b/gi, " ");
    dateFound = true;
  } else if (/\bontem\b/i.test(workingText)) {
    targetDate.setDate(targetDate.getDate() - 1);
    workingText = workingText.replace(/\bontem\b/gi, " ");
    dateFound = true;
  } else {
    const explicitDateMatch = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/.exec(workingText);
    if (explicitDateMatch) {
      const day = parseInt(explicitDateMatch[1], 10);
      const month = parseInt(explicitDateMatch[2], 10) - 1;
      let year = explicitDateMatch[3] ? parseInt(explicitDateMatch[3], 10) : spNow.getFullYear();
      if (year < 100) year += 2000;
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        targetDate = new Date(year, month, day);
        workingText = workingText.replace(explicitDateMatch[0], " ");
        dateFound = true;
      }
    }
  }

  const yearStr = targetDate.getFullYear();
  const monthStr = String(targetDate.getMonth() + 1).padStart(2, "0");
  const dayStr = String(targetDate.getDate()).padStart(2, "0");
  const isoDate = `${yearStr}-${monthStr}-${dayStr}`;

  // 2. Extração do valor em centavos
  let amountCents: number | null = null;
  let hasExplicitCurrency = false;

  // Padrão 1: R$ 35,50 ou R$ 35 ou R$35.50
  const rDollarMatch = /R\$\s*(\d{1,7}(?:[.,]\d{1,2})?)/i.exec(workingText);
  if (rDollarMatch) {
    const numStr = rDollarMatch[1].replace(".", "").replace(",", ".");
    const parsed = Math.round(parseFloat(numStr) * 100);
    if (parsed > 0 && parsed <= 2_000_000_000) {
      amountCents = parsed;
      hasExplicitCurrency = true;
      workingText = workingText.replace(rDollarMatch[0], " ");
    }
  }

  // Padrão 2: 35 reais ou 35 conto
  if (amountCents === null) {
    const reaisMatch = /\b(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:reais|real|conto|contos)\b/i.exec(workingText);
    if (reaisMatch) {
      const numStr = reaisMatch[1].replace(".", "").replace(",", ".");
      const parsed = Math.round(parseFloat(numStr) * 100);
      if (parsed > 0 && parsed <= 2_000_000_000) {
        amountCents = parsed;
        hasExplicitCurrency = true;
        workingText = workingText.replace(reaisMatch[0], " ");
      }
    }
  }

  // Padrão 3: Número decimal com vírgula ou ponto (ex: 42,50 ou 10.90)
  if (amountCents === null) {
    const decimalMatch = /\b(\d{1,7}[.,]\d{1,2})\b/.exec(workingText);
    if (decimalMatch) {
      const numStr = decimalMatch[1].replace(",", ".");
      const parsed = Math.round(parseFloat(numStr) * 100);
      if (parsed > 0 && parsed <= 2_000_000_000) {
        amountCents = parsed;
        workingText = workingText.replace(decimalMatch[0], " ");
      }
    }
  }

  // Padrão 4: Número inteiro isolado (ex: 35 ou 5000)
  if (amountCents === null) {
    const integerMatch = /\b(\d{1,7})\b/.exec(workingText);
    if (integerMatch) {
      const parsed = parseInt(integerMatch[1], 10) * 100;
      if (parsed > 0 && parsed <= 2_000_000_000) {
        amountCents = parsed;
        workingText = workingText.replace(integerMatch[0], " ");
      }
    }
  }

  if (amountCents === null) {
    return null;
  }

  // 3. Determinação do tipo (INCOME vs EXPENSE)
  const isExplicitIncome = /^\/(receita)\b/i.test(text) || text.trim().startsWith("+") || INCOME_TRIGGERS.test(text);
  const kind: "INCOME" | "EXPENSE" = isExplicitIncome ? "INCOME" : "EXPENSE";

  // 4. Limpeza da descrição
  // Remover palavras de ligação e verbos comuns
  let cleaned = workingText
    .replace(/[+]/g, " ")
    .replace(/\b(gastei|comprei|paguei|recebi|pix|de|do|da|dos|das|no|na|nos|nas|em|com|por|para|valor|custou)\b/gi, " ")
    .replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Se não foi comando explícito, nem moeda explícita, nem data encontrada, nem gatilho de receita:
  // verificar se há pelo menos um termo financeiro/comum reconhecido na mensagem para evitar falsos positivos
  if (!isExplicitCommand && !hasExplicitCurrency && !dateFound && !isExplicitIncome) {
    const lowerTokens = text.toLowerCase().split(/\s+/);
    const hasKnownTerm = lowerTokens.some(token => {
      const normalized = token.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return COMMON_EXPENSE_TERMS.has(normalized);
    });
    if (!hasKnownTerm) {
      return null;
    }
  }

  let description = cleaned;
  if (description.length < 2) {
    description = kind === "INCOME" ? "Receita" : "Despesa";
  } else {
    description = description.charAt(0).toUpperCase() + description.slice(1);
    if (description.length > 100) {
      description = description.slice(0, 100).trim();
    }
  }

  return {
    amountCents,
    kind,
    description,
    date: isoDate,
  };
}
