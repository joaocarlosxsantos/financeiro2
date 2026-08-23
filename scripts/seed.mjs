/**
 * Popula o banco com um usuário de demonstração e 6 meses de lançamentos.
 *
 *   npm run db:push      (cria as tabelas)
 *   npm run db:seed
 *
 * Login: demo@financeiro.app / demo12345
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida. Crie o .env a partir do .env.example.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const id = () =>
  Date.now().toString(36).padStart(9, "0") + randomBytes(9).toString("hex").slice(0, 17);

const CATEGORIES = [
  ["Salário", "INCOME", "FIXED", "#0d9488", ["salario", "pagamento", "folha"]],
  ["Renda extra", "INCOME", "VARIABLE", "#10b981", ["freela", "extra"]],
  ["Moradia", "EXPENSE", "FIXED", "#6366f1", ["aluguel", "condominio"]],
  ["Contas de casa", "EXPENSE", "FIXED", "#8b5cf6", ["energia", "agua", "internet"]],
  ["Assinaturas", "EXPENSE", "FIXED", "#a855f7", ["netflix", "spotify"]],
  ["Mercado", "EXPENSE", "VARIABLE", "#84cc16", ["mercado", "supermercado"]],
  ["Alimentação fora", "EXPENSE", "VARIABLE", "#d95926", ["ifood", "restaurante"]],
  ["Transporte", "EXPENSE", "VARIABLE", "#eab308", ["uber", "posto"]],
  ["Lazer", "EXPENSE", "VARIABLE", "#ec4899", ["cinema", "show"]],
];

const PATTERN = [
  ["Salário", "Salário mensal", 720000, "INCOME", 5],
  ["Moradia", "Aluguel", 180000, "EXPENSE", 8],
  ["Contas de casa", "Energia elétrica", 18500, "EXPENSE", 12],
  ["Contas de casa", "Internet fibra", 9990, "EXPENSE", 12],
  ["Assinaturas", "Netflix", 5590, "EXPENSE", 15],
  ["Assinaturas", "Spotify", 2190, "EXPENSE", 15],
  ["Mercado", "Mercado do mês", 96000, "EXPENSE", 3],
  ["Mercado", "Feira e hortifruti", 21000, "EXPENSE", 18],
  ["Alimentação fora", "iFood", 14800, "EXPENSE", 10],
  ["Alimentação fora", "Restaurante fim de semana", 19500, "EXPENSE", 22],
  ["Transporte", "Combustível", 32000, "EXPENSE", 7],
  ["Transporte", "Uber", 8600, "EXPENSE", 20],
  ["Lazer", "Cinema e passeio", 12000, "EXPENSE", 25],
];

const jitter = (c) => Math.round(c * (0.85 + Math.random() * 0.3));

async function main() {
  const email = "demo@financeiro.app";
  await sql`delete from users where email = ${email}`;

  const userId = id();
  await sql`
    insert into users (id, name, email, password_hash, monthly_income_cents, emergency_months, savings_target_pct, onboarded_at)
    values (${userId}, 'Usuário Demo', ${email}, ${await bcrypt.hash("demo12345", 10)}, 720000, 6, 20, now())
  `;

  const catIds = new Map();
  for (const [name, kind, nature, color, keywords] of CATEGORIES) {
    const cid = id();
    catIds.set(name, { id: cid, nature });
    await sql`
      insert into categories (id, user_id, name, kind, nature, color, keywords)
      values (${cid}, ${userId}, ${name}, ${kind}, ${nature}, ${color}, ${keywords})
    `;
  }

  const checkingId = id();
  const cardId = id();
  await sql`
    insert into accounts (id, user_id, name, type, color) values
      (${checkingId}, ${userId}, 'Conta corrente', 'CHECKING', '#6366f1'),
      (${cardId}, ${userId}, 'Cartão de crédito', 'CREDIT_CARD', '#f43f5e')
  `;

  const now = new Date();
  let count = 0;

  for (let back = 5; back >= 0; back--) {
    for (const [catName, desc, baseCents, kind, day] of PATTERN) {
      const cat = catIds.get(catName);
      const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() - back, day, 12));
      if (date > now) continue;

      const cents = kind === "INCOME" ? baseCents : jitter(baseCents);
      const accountId = kind === "EXPENSE" && cat.nature === "VARIABLE" ? cardId : checkingId;

      await sql`
        insert into transactions (id, user_id, account_id, category_id, date, description, amount_cents, kind, nature, fingerprint)
        values (${id()}, ${userId}, ${accountId}, ${cat.id}, ${date}, ${desc}, ${cents}, ${kind},
                ${kind === "INCOME" ? "VARIABLE" : cat.nature},
                ${`seed|${date.toISOString().slice(0, 10)}|${desc}|${cents}`})
        on conflict do nothing
      `;
      count++;
    }
  }

  await sql`
    insert into goals (id, user_id, name, kind, target_cents, saved_cents, color, note) values
      (${id()}, ${userId}, 'Reserva de emergência', 'EMERGENCY_FUND', 2600000, 940000, '#0891b2', 'Dinheiro para imprevistos, em liquidez diária.'),
      (${id()}, ${userId}, 'Viagem em família', 'TRIP', 900000, 210000, '#0d9488', null)
  `;

  console.log(`Seed pronto: ${count} lançamentos criados.`);
  console.log(`Login: ${email} / demo12345`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
