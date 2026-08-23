import type { CategoryKind, ExpenseNature } from "@/db/schema";

export type DefaultCategory = {
  name: string;
  kind: CategoryKind;
  nature: ExpenseNature;
  color: string;
  icon: string;
  keywords: string[];
};

/**
 * Categorias criadas junto com a conta. O usuário pode editar tudo depois.
 * `keywords` alimentam a categorização automática das importações.
 */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // ---------------- receitas
  { name: "Salário", kind: "INCOME", nature: "FIXED", color: "#059669", icon: "wallet", keywords: ["salario", "salário", "pagamento", "folha", "remuneracao", "provento"] },
  { name: "Renda extra", kind: "INCOME", nature: "VARIABLE", color: "#10b981", icon: "sparkles", keywords: ["freela", "freelance", "bico", "extra", "pix recebido", "venda"] },
  { name: "Rendimentos", kind: "INCOME", nature: "VARIABLE", color: "#14b8a6", icon: "trending-up", keywords: ["rendimento", "juros", "dividendo", "cdb", "tesouro", "resgate"] },

  // ---------------- gastos fixos
  { name: "Moradia", kind: "EXPENSE", nature: "FIXED", color: "#6366f1", icon: "home", keywords: ["aluguel", "condominio", "condomínio", "iptu", "financiamento imovel"] },
  { name: "Contas de casa", kind: "EXPENSE", nature: "FIXED", color: "#8b5cf6", icon: "plug", keywords: ["energia", "luz", "enel", "cemig", "copel", "agua", "água", "sabesp", "gas", "gás", "internet", "vivo", "claro", "tim", "oi"] },
  { name: "Educação", kind: "EXPENSE", nature: "FIXED", color: "#0ea5e9", icon: "graduation-cap", keywords: ["escola", "faculdade", "curso", "mensalidade", "udemy", "alura"] },
  { name: "Saúde", kind: "EXPENSE", nature: "FIXED", color: "#06b6d4", icon: "heart-pulse", keywords: ["plano de saude", "unimed", "amil", "farmacia", "farmácia", "drogaria", "consulta", "dentista"] },
  { name: "Assinaturas", kind: "EXPENSE", nature: "FIXED", color: "#a855f7", icon: "repeat", keywords: ["netflix", "spotify", "amazon prime", "disney", "hbo", "max", "youtube premium", "icloud", "google one", "assinatura"] },
  { name: "Transporte fixo", kind: "EXPENSE", nature: "FIXED", color: "#f59e0b", icon: "car", keywords: ["ipva", "seguro auto", "estacionamento mensal", "financiamento carro"] },

  // ---------------- gastos variáveis
  { name: "Mercado", kind: "EXPENSE", nature: "VARIABLE", color: "#84cc16", icon: "shopping-cart", keywords: ["mercado", "supermercado", "atacadao", "atacadão", "carrefour", "assai", "assaí", "pao de acucar", "hortifruti", "acougue", "açougue", "padaria"] },
  { name: "Alimentação fora", kind: "EXPENSE", nature: "VARIABLE", color: "#f97316", icon: "utensils", keywords: ["ifood", "rappi", "restaurante", "lanchonete", "burger", "pizza", "cafe", "café", "starbucks", "mcdonald", "bar"] },
  { name: "Transporte", kind: "EXPENSE", nature: "VARIABLE", color: "#eab308", icon: "bus", keywords: ["uber", "99", "taxi", "combustivel", "combustível", "posto", "shell", "ipiranga", "petrobras", "onibus", "ônibus", "metro", "pedagio", "pedágio"] },
  { name: "Lazer", kind: "EXPENSE", nature: "VARIABLE", color: "#ec4899", icon: "party-popper", keywords: ["cinema", "show", "ingresso", "steam", "playstation", "xbox", "viagem", "hotel", "airbnb"] },
  { name: "Compras", kind: "EXPENSE", nature: "VARIABLE", color: "#f43f5e", icon: "shopping-bag", keywords: ["amazon", "mercado livre", "shopee", "aliexpress", "magalu", "americanas", "renner", "zara", "shein"] },
  { name: "Cuidados pessoais", kind: "EXPENSE", nature: "VARIABLE", color: "#d946ef", icon: "scissors", keywords: ["barbearia", "salao", "salão", "cabeleireiro", "academia", "smartfit", "manicure"] },
  { name: "Dívidas e juros", kind: "EXPENSE", nature: "FIXED", color: "#dc2626", icon: "alert-triangle", keywords: ["juros", "emprestimo", "empréstimo", "rotativo", "parcelamento fatura", "encargos", "multa", "iof"] },
  { name: "Outros", kind: "EXPENSE", nature: "VARIABLE", color: "#64748b", icon: "tag", keywords: [] },
];
