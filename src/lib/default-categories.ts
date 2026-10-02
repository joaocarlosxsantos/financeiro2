import type { CategoryKind, ExpenseNature } from "@/db/schema";
import { CATEGORY_PALETTE } from "@/components/charts/palette";

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
  { name: "Salário", kind: "INCOME", nature: "FIXED", color: CATEGORY_PALETTE[0], icon: "wallet", keywords: ["salario", "salário", "pagamento", "folha", "remuneracao", "provento"] },
  { name: "Renda extra", kind: "INCOME", nature: "VARIABLE", color: CATEGORY_PALETTE[1], icon: "sparkles", keywords: ["freela", "freelance", "bico", "extra", "pix recebido", "venda"] },
  { name: "Rendimentos", kind: "INCOME", nature: "VARIABLE", color: CATEGORY_PALETTE[6], icon: "trending-up", keywords: ["rendimento", "juros", "dividendo", "cdb", "tesouro", "resgate"] },

  // ---------------- gastos fixos
  { name: "Moradia", kind: "EXPENSE", nature: "FIXED", color: CATEGORY_PALETTE[2], icon: "home", keywords: ["aluguel", "condominio", "condomínio", "iptu", "financiamento imovel"] },
  { name: "Contas de casa", kind: "EXPENSE", nature: "FIXED", color: CATEGORY_PALETTE[9], icon: "plug", keywords: ["energia", "luz", "enel", "cemig", "copel", "agua", "água", "sabesp", "gas", "gás", "internet", "vivo", "claro", "tim", "oi"] },
  { name: "Educação", kind: "EXPENSE", nature: "FIXED", color: CATEGORY_PALETTE[0], icon: "graduation-cap", keywords: ["escola", "faculdade", "curso", "mensalidade", "udemy", "alura"] },
  { name: "Saúde", kind: "EXPENSE", nature: "FIXED", color: CATEGORY_PALETTE[1], icon: "heart-pulse", keywords: ["plano de saude", "unimed", "amil", "farmacia", "farmácia", "drogaria", "consulta", "dentista"] },
  { name: "Assinaturas", kind: "EXPENSE", nature: "FIXED", color: CATEGORY_PALETTE[7], icon: "repeat", keywords: ["netflix", "spotify", "amazon prime", "disney", "hbo", "max", "youtube premium", "icloud", "google one", "assinatura"] },
  { name: "Transporte fixo", kind: "EXPENSE", nature: "FIXED", color: CATEGORY_PALETTE[3], icon: "car", keywords: ["ipva", "seguro auto", "estacionamento mensal", "financiamento carro"] },
  { name: "Dívidas e juros", kind: "EXPENSE", nature: "FIXED", color: CATEGORY_PALETTE[4], icon: "alert-triangle", keywords: ["juros", "emprestimo", "empréstimo", "rotativo", "parcelamento fatura", "encargos", "multa", "iof"] },

  // ---------------- gastos variáveis
  { name: "Mercado", kind: "EXPENSE", nature: "VARIABLE", color: CATEGORY_PALETTE[5], icon: "shopping-cart", keywords: ["mercado", "supermercado", "atacadao", "atacadão", "carrefour", "assai", "assaí", "pao de acucar", "hortifruti", "acougue", "açougue", "padaria"] },
  { name: "Alimentação fora", kind: "EXPENSE", nature: "VARIABLE", color: CATEGORY_PALETTE[3], icon: "utensils", keywords: ["ifood", "rappi", "restaurante", "lanchonete", "burger", "pizza", "cafe", "café", "starbucks", "mcdonald", "bar"] },
  { name: "Transporte", kind: "EXPENSE", nature: "VARIABLE", color: CATEGORY_PALETTE[6], icon: "bus", keywords: ["uber", "99", "taxi", "combustivel", "combustível", "posto", "shell", "ipiranga", "petrobras", "onibus", "ônibus", "metro", "pedagio", "pedágio"] },
  { name: "Lazer", kind: "EXPENSE", nature: "VARIABLE", color: CATEGORY_PALETTE[2], icon: "party-popper", keywords: ["cinema", "show", "ingresso", "steam", "playstation", "xbox", "viagem", "hotel", "airbnb"] },
  { name: "Compras", kind: "EXPENSE", nature: "VARIABLE", color: CATEGORY_PALETTE[8], icon: "shopping-bag", keywords: ["amazon", "mercado livre", "shopee", "aliexpress", "magalu", "americanas", "renner", "zara", "shein"] },
  { name: "Cuidados pessoais", kind: "EXPENSE", nature: "VARIABLE", color: CATEGORY_PALETTE[7], icon: "scissors", keywords: ["barbearia", "salao", "salão", "cabeleireiro", "academia", "smartfit", "manicure"] },
  { name: "Outros", kind: "EXPENSE", nature: "VARIABLE", color: CATEGORY_PALETTE[9], icon: "tag", keywords: [] },
];
