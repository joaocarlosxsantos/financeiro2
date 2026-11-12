import { signOut } from "@/lib/auth";

/**
 * Encerra uma sessão órfã.
 *
 * Um cookie de sessão pode continuar válido (é um JWT assinado) apontando para
 * um usuário que não existe mais: conta apagada, banco trocado, ambiente
 * diferente. Redirecionar direto para /login não resolve — a tela de login vê
 * a sessão "válida" e devolve para o painel, criando um laço infinito.
 *
 * Aqui o cookie é apagado antes do redirecionamento, o que quebra o laço.
 */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Origem inválida." }, { status: 403 });
  }
  await signOut({ redirect: false });
  return Response.redirect(new URL("/login?sessao=expirada", request.url), 303);
}

export const runtime = "nodejs";
