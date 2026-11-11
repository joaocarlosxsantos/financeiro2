import { ExternalLink, ShieldAlert } from "lucide-react";

/**
 * URL oficial e constante do portal de desenvolvedores da Pluggy.
 * Fonte: docs.pluggy.ai/docs/quickstart (acessado em 10/11/2026).
 */
export const PLUGGY_DASHBOARD_URL = "https://dashboard.pluggy.ai";

/**
 * Aviso de segurança obrigatório sobre as credenciais e conexões gratuitas.
 */
export const PLUGGY_SECURITY_NOTICE =
  "Credenciais gratuitas são pessoais (até 5 conexões); nunca compartilhe o Client Secret.";

/**
 * Guia passo a passo acessível e responsivo para obtenção de credenciais da Pluggy.
 */
export function PluggyCredentialsGuide() {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-xs text-[var(--text-muted)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--text)] text-[0.8125rem]">
            Como obter suas credenciais na Pluggy
          </h3>
          <p className="mt-0.5 text-[0.75rem] text-[var(--text-muted)]">
            Siga os 5 passos no portal oficial de desenvolvedores.
          </p>
        </div>
        <a
          href={PLUGGY_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] transition-colors shrink-0"
        >
          <span>Criar minha conta e obter credenciais na Pluggy</span>
          <ExternalLink className="size-3.5 shrink-0 text-[var(--text-brand)]" aria-hidden="true" />
        </a>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[0.75rem] text-amber-700 dark:text-amber-300 flex items-start gap-2">
        <ShieldAlert className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong>Aviso:</strong> {PLUGGY_SECURITY_NOTICE}
        </p>
      </div>

      <ol className="list-decimal space-y-2 pl-4 text-[0.8125rem] leading-relaxed text-[var(--text)]">
        <li>
          Acesse o <strong>Dashboard da Pluggy</strong> pelo botão acima (
          <code className="text-xs font-mono">dashboard.pluggy.ai</code>) e crie sua conta gratuita de desenvolvedor (ou faça login se já possuir conta).
        </li>
        <li>
          No menu lateral à esquerda, acesse a seção <strong>Applications</strong> (Aplicações).
        </li>
        <li>
          Selecione sua aplicação ou clique em <strong>Create application</strong> (Criar aplicação) para gerar um novo projeto.
        </li>
        <li>
          Na tela de detalhes da aplicação, localize as credenciais e copie o <strong>Client ID</strong> e o <strong>Client Secret</strong>.
        </li>
        <li>
          Retorne a este formulário e cole o <strong>Client ID</strong> e o <strong>Client Secret</strong> nos campos abaixo para validar e salvar.
        </li>
      </ol>
    </div>
  );
}
