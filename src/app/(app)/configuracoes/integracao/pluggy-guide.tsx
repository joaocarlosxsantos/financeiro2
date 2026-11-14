"use client";

import { useState } from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { OnboardingMediaSlot } from "@/components/onboarding/media-slot";

export const PLUGGY_DASHBOARD_URL = "https://dashboard.pluggy.ai";
export const PLUGGY_SECURITY_NOTICE = "O Client Secret aparece na geração. Guarde-o em um gerenciador seguro e nunca o compartilhe.";

const paths = [
  { id: "personal", label: "Meus próprios dados via Meu Pluggy", description: "Você autoriza seus bancos no Meu Pluggy e usa as credenciais da aplicação correspondente." },
  { id: "existing_app", label: "Já tenho uma aplicação habilitada", description: "Use apenas uma aplicação e uma modalidade autorizadas pela Pluggy para o seu caso." },
] as const;

const stepMedia = [
  { src: "/onboarding/02-meu-pluggy.webp", alt: "Captura demonstrativa do Meu Pluggy com dados fictícios, destacando a conexão de um banco.", caption: "Captura 02 · Meu Pluggy. O espaço será preenchido pelo responsável pelo produto." },
  { src: "/onboarding/03-aplicacoes.webp", alt: "Captura demonstrativa do Dashboard Pluggy, com aplicação e Client ID fictícios.", caption: "Captura 03 · Aplicações. Ocultar dados pessoais antes de publicar." },
  { src: "/onboarding/04-secret.webp", alt: "Captura demonstrativa da geração de Client Secret, com o valor coberto por máscara permanente.", caption: "Captura 04 · Secret sempre mascarado, inclusive no arquivo final." },
  { src: "/onboarding/08-colar-validar.webp", alt: "Captura demonstrativa dos campos de credenciais Mutano com valores fictícios e secret mascarado.", caption: "Captura 08 · Validar credenciais no Mutano." },
  { src: "/onboarding/06-demo.webp", alt: "Captura demonstrativa da escolha do MeuPluggy no fluxo de conexão, sem dados reais.", caption: "Captura 06 · Escolha do conector no fluxo oficial." },
  { src: "/onboarding/09-sync.webp", alt: "Captura demonstrativa do estado de sincronização e seu resultado, sem dados financeiros reais.", caption: "Captura 09 · Resultado da sincronização, inclusive quando não há movimentações." },
];

export function PluggyCredentialsGuide() {
  const [step, setStep] = useState(1);
  const [path, setPath] = useState<(typeof paths)[number]["id"] | null>(null);
  const selectedPath = paths.find((item) => item.id === path);
  const media = stepMedia[step - 1];

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4" aria-labelledby="pluggy-wizard-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="pluggy-wizard-title" className="text-sm font-semibold text-[var(--text)]">Assistente de configuração Pluggy</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Passo {step} de 6 · Escolha uma tarefa por vez. Suas credenciais não ficam neste assistente.</p>
        </div>
        <a href={PLUGGY_DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          Abrir Dashboard Pluggy <ExternalLink aria-hidden="true" className="size-3.5 text-[var(--text-brand)]" />
        </a>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-3)]" role="progressbar" aria-label="Progresso do assistente Pluggy" aria-valuemin={1} aria-valuemax={6} aria-valuenow={step}>
        <div className="h-full rounded-full bg-[var(--acento)] transition-[width] motion-reduce:transition-none" style={{ width: `${(step / 6) * 100}%` }} />
      </div>

      <div aria-live="polite" aria-atomic="true">
        {step === 1 ? <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[var(--text)]">1. Escolha o caminho da sua conexão</h4>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">Consentimento bancário autoriza a leitura da sua conta. Client ID e Client Secret identificam uma aplicação Pluggy. Nenhum deles é sua senha do Mutano ou do banco.</p>
          <div className="grid gap-2 sm:grid-cols-2">{paths.map((item) => <button key={item.id} type="button" aria-pressed={path === item.id} onClick={() => setPath(item.id)} className={`min-h-20 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${path === item.id ? "border-[var(--acento)] bg-[var(--surface)]" : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)]"}`}><span className="block text-xs font-semibold text-[var(--text)]">{item.label}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">{item.description}</span></button>)}</div>
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-[var(--text)]">Antes de continuar, confira com a Pluggy se sua modalidade de acesso permite o uso pretendido. Não presuma que uma aplicação nova em Sandbox acessa bancos reais.</p>
        </div> : null}
        {step === 2 ? <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[var(--text)]">2. Prepare a conta externa</h4>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">{selectedPath?.id === "personal" ? "Entre no Meu Pluggy, conecte o banco por lá e conclua a autorização no ambiente oficial. Depois volte a esta tela." : selectedPath?.id === "existing_app" ? "Entre no Dashboard com a conta que administra a aplicação já habilitada. Confirme a modalidade antes de usar as credenciais." : "Escolha um dos caminhos no passo 1 para ver as instruções adequadas."}</p>
          {selectedPath?.id === "personal" ? <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-[var(--text)]"><li>Abra o Meu Pluggy em uma aba separada.</li><li>Conecte cada banco e conclua a autorização solicitada pelo banco.</li><li>Volte ao Mutano para configurar sua aplicação Pluggy.</li></ol> : selectedPath?.id === "existing_app" ? <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-[var(--text)]"><li>Abra o Dashboard Pluggy e selecione a aplicação habilitada.</li><li>Confirme se está em Sandbox ou produção e se os conectores são os esperados.</li><li>Volte ao Mutano sem compartilhar credenciais com ninguém.</li></ol> : null}
        </div> : null}
        {step === 3 ? <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[var(--text)]">3. Encontre o par da aplicação</h4>
          <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-[var(--text)]"><li>No Dashboard, abra <strong>Applications</strong> e selecione ou crie uma aplicação.</li><li>Copie o <strong>Client ID</strong> da aplicação correta.</li><li>Gere o <strong>Client Secret</strong> e guarde-o imediatamente em um gerenciador seguro.</li></ol>
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-[var(--text)]"><ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" /><p>{PLUGGY_SECURITY_NOTICE} Se perder um secret, um administrador pode gerar outro; a rotação invalida o anterior e pode afetar outras integrações.</p></div>
        </div> : null}
        {step === 4 ? <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[var(--text)]">4. Cole e valide no Mutano</h4>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">Use os campos de Client ID e Client Secret do formulário desta página. Cole somente o valor, sem aspas nem prefixos como <code>CLIENT_SECRET=</code>. O secret fica no formulário apenas durante o envio e não é exibido de volta.</p>
          <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-[var(--text)]">Se aparecer <strong>CLIENT_KEYS_UNAUTHORIZED</strong>, confira se os dois valores são do mesmo app e ambiente. Não troque um par válido até conferir onde ele é usado.</p>
        </div> : null}
        {step === 5 ? <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[var(--text)]">5. Autorize a conexão pelo widget</h4>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">Use o botão de conectar existente nesta tela. No caminho pessoal, selecione MeuPluggy quando disponível. O tutorial do Dashboard não importa um item externo para sua conta Mutano; a conexão é criada pelo widget seguro do Mutano.</p>
          <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-[var(--text)]">“Conexão autorizada” confirma o consentimento. Ainda é preciso sincronizar e conferir o resultado no Mutano.</p>
        </div> : null}
        {step === 6 ? <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[var(--text)]">6. Confira a leitura e sincronização</h4>
          <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-[var(--text)]"><li>Selecione a conexão e vincule as contas locais correspondentes.</li><li>Use “Sincronizar agora” e aguarde a resposta.</li><li>Confira o estado por conta. Uma leitura concluída sem lançamentos também pode ser válida; veja o status antes de concluir.</li></ol>
          <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text-muted)]">Erro de login ou solicitação pendente: retorne ao fluxo oficial do banco. Instabilidade ou limite de chamadas: aguarde antes de tentar novamente. Token expirado: reabra o widget.</p>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--text-muted)]"><li><strong>Credenciais não autorizadas:</strong> confira Client ID, Secret e ambiente da mesma aplicação.</li><li><strong>Aplicação desativada:</strong> verifique o estado no Dashboard ou fale com a Pluggy.</li><li><strong>Pedido do banco pendente ou acesso inválido:</strong> conclua ou corrija a autorização no ambiente oficial do banco.</li><li><strong>Conta desatualizada:</strong> confira o status e tente de novo mais tarde, sem repetir em sequência.</li></ul>
          <p className="text-xs text-[var(--text-muted)]">Depois, revise categorias e orçamento para organizar o que foi importado.</p>
        </div> : null}
      </div>

      <OnboardingMediaSlot src={media.src} alt={media.alt} caption={media.caption} />
      {step === 2 ? <OnboardingMediaSlot type="video" src="/onboarding/v2-meu-pluggy.mp4" alt="Vídeo demonstrativo com legendas e transcrição: preparar o acesso ao Meu Pluggy sem exibir autenticação bancária." caption="Vídeo V2 · Meu Pluggy. Reprodução sob demanda; publicar com legendas e transcrição." /> : null}

      <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
        <button type="button" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))} className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-[var(--text-muted)] disabled:opacity-50">Voltar</button>
        <button type="button" onClick={() => setStep((value) => Math.min(6, value + 1))} disabled={step === 6 || (step === 1 && !path)} className="inline-flex min-h-11 items-center rounded-xl bg-[var(--acento)] px-4 text-xs font-semibold text-[var(--on-acento)] disabled:opacity-50">{step === 6 ? "Assistente concluído" : "Próximo passo"}</button>
      </div>
    </section>
  );
}
