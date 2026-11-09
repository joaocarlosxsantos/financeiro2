import type { CategoryKind } from "@/db/schema";

export type CatalogMatch = { categoryName: string; kind: CategoryKind };

const MERCHANTS: Array<{ terms: string[]; categoryName: string; kind: CategoryKind }> = [
  { terms: ["IFOOD", "RAPPI", "UBER EATS", "ZE DELIVERY"], categoryName: "Alimentação fora", kind: "EXPENSE" },
  { terms: ["NETFLIX", "SPOTIFY", "DISNEY PLUS", "DISNEY", "HBO", "MAX", "AMAZON PRIME", "ICLOUD", "GOOGLE ONE", "YOUTUBE PREMIUM"], categoryName: "Assinaturas", kind: "EXPENSE" },
  { terms: ["CARREFOUR", "PAO DE ACUCAR", "ASSAI", "ATACADAO", "HORTIFRUTI", "SUPERMERCADO", "DROGARIA SAO PAULO"], categoryName: "Mercado", kind: "EXPENSE" },
  { terms: ["DROGASIL", "DROGA RAIA", "PAGUE MENOS", "PANVEL", "FARMACIA", "DROGARIA"], categoryName: "Saúde", kind: "EXPENSE" },
  { terms: ["UBER", "99 POP", "99 APP", "99 TAXI", "SHELL", "IPIRANGA", "PETROBRAS", "POSTO", "CONECTCAR", "SEM PARAR", "TAXI", "ONIBUS", "METRO"], categoryName: "Transporte", kind: "EXPENSE" },
  { terms: ["SMART FIT", "SMARTFIT", "BLUEFIT", "TOTALPASS", "GYMPASS", "BARBEARIA"], categoryName: "Cuidados pessoais", kind: "EXPENSE" },
  { terms: ["MERCADO LIVRE", "SHOPEE", "AMAZON", "MAGALU", "AMERICANAS", "RENNER", "ZARA", "SHEIN", "ALIEXPRESS"], categoryName: "Compras", kind: "EXPENSE" },
  { terms: ["CINEMARK", "CINEMA", "INGRESSO", "STEAM", "PLAYSTATION", "XBOX", "AIRBNB", "HOTEL"], categoryName: "Lazer", kind: "EXPENSE" },
  { terms: ["ENEL", "CEMIG", "COPEL", "SABESP", "VIVO", "CLARO", "TIM", "OI", "ENERGIA", "DEBITO AUTOMATICO"], categoryName: "Contas de casa", kind: "EXPENSE" },
  { terms: ["ALUGUEL", "CONDOMINIO", "IPTU", "FINANCIAMENTO IMOVEL"], categoryName: "Moradia", kind: "EXPENSE" },
  { terms: ["ESCOLA", "FACULDADE", "UDEMY", "ALURA", "CURSO"], categoryName: "Educação", kind: "EXPENSE" },
];

const MCC: Record<string, CatalogMatch> = {
  "5411": { categoryName: "Mercado", kind: "EXPENSE" },
  "5812": { categoryName: "Alimentação fora", kind: "EXPENSE" },
  "5814": { categoryName: "Alimentação fora", kind: "EXPENSE" },
  "5541": { categoryName: "Transporte", kind: "EXPENSE" },
  "5542": { categoryName: "Transporte", kind: "EXPENSE" },
  "4121": { categoryName: "Transporte", kind: "EXPENSE" },
  "5912": { categoryName: "Saúde", kind: "EXPENSE" },
  "4899": { categoryName: "Assinaturas", kind: "EXPENSE" },
  "5735": { categoryName: "Assinaturas", kind: "EXPENSE" },
  "5311": { categoryName: "Compras", kind: "EXPENSE" },
  "5651": { categoryName: "Compras", kind: "EXPENSE" },
  "7991": { categoryName: "Lazer", kind: "EXPENSE" },
  "7832": { categoryName: "Lazer", kind: "EXPENSE" },
  "7997": { categoryName: "Cuidados pessoais", kind: "EXPENSE" },
  "7230": { categoryName: "Cuidados pessoais", kind: "EXPENSE" },
};

export function matchMerchant(normalizedDescription: string): CatalogMatch | null {
  const match = MERCHANTS
    .flatMap((item) => item.terms.map((term) => ({ ...item, term })))
    .filter((item) => normalizedDescription.includes(item.term))
    .sort((a, b) => b.term.length - a.term.length)[0];
  return match ? { categoryName: match.categoryName, kind: match.kind } : null;
}

export function matchMcc(payeeMcc: number | string | null | undefined): CatalogMatch | null {
  if (payeeMcc == null) return null;
  return MCC[String(payeeMcc)] ?? null;
}
