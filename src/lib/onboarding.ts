import { z } from "zod";
import { getNavigationSections } from "@/components/navigation-model";
import { canUseCapability, USAGE_PROFILES, type UsageProfile } from "./usage-profile";
import { MAX_CENTS, parseMoneyToCents } from "./money";

export const ONBOARDING_VERSION = 1;
export const ONBOARDING_STEP_IDS = ["registration", "mode", "pluggy", "first-data", "planning", "notifications", "summary"] as const;
export type OnboardingStepId = typeof ONBOARDING_STEP_IDS[number];
export type OnboardingStepStatus = "pendente" | "em_andamento" | "concluido" | "pulado" | "nao_aplicavel";
export const TOUR_STOP_IDS = ["overview", "activity", "planning", "integration", "account", "notifications"] as const;
export type TourStopId = typeof TOUR_STOP_IDS[number];
export type TourStatus = "not_started" | "active" | "paused" | "completed" | "dismissed";
export type IntegrationProgress = "not_started" | "needs_accounts" | "pending" | "syncing" | "error" | "partial" | "complete";

export const PLUGGY_ACCESS_GUIDANCE = "Use o caminho correspondente à sua aplicação: seus próprios dados via Meu Pluggy ou uma aplicação habilitada para dados de terceiros. Confira a modalidade e as permissões com a Pluggy. Essa orientação não altera sua conta nem sua licença.";

export type OnboardingFacts = {
  registered: boolean;
  profile: UsageProfile;
  modeChosen: boolean;
  hasAccount: boolean;
  hasTransaction: boolean;
  hasManualTransaction: boolean;
  credentialConfigured: boolean;
  integration: { status: IntegrationProgress; connections: number; linkedAccounts: number; syncedConnections: number };
  hasBudget: boolean;
  notifications: { decided: boolean; inAppEnabled: boolean; pushEnabled: boolean; pushRegisteredOnAnyDevice: boolean; telegramEnabled: boolean; telegramLinked: boolean };
  hasReadSummary: boolean;
};

export type OnboardingLocalState = {
  version: number;
  skippedSteps: OnboardingStepId[];
  tour: { status: TourStatus; stopId: TourStopId | null };
};
const skippable: readonly OnboardingStepId[] = ONBOARDING_STEP_IDS.filter(id => id !== "registration" && id !== "mode");
export const emptyOnboardingLocalState = (): OnboardingLocalState => ({ version: ONBOARDING_VERSION, skippedSteps: [], tour: { status: "not_started", stopId: null } });
const localSchema = z.object({
  version: z.number().int().min(0).max(1000), skippedSteps: z.array(z.string().max(40)).max(20),
  tour: z.object({ status: z.enum(["not_started", "active", "paused", "completed", "dismissed"]), stopId: z.string().max(40).nullable() }),
});

/** Only cosmetic tour/skip choices; never a copy of server facts, credentials or financial data. */
export function parseOnboardingLocalState(raw: unknown): OnboardingLocalState {
  try {
    if (typeof raw === "string" && raw.length > 4096) return emptyOnboardingLocalState();
    const parsed = localSchema.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw);
    if (!parsed.success) return emptyOnboardingLocalState();
    const stopId = TOUR_STOP_IDS.find(id => id === parsed.data.tour.stopId) ?? null;
    return { version: ONBOARDING_VERSION,
      skippedSteps: [...new Set(parsed.data.skippedSteps.filter((id): id is OnboardingStepId => skippable.some(value => value === id)))],
      // Preserve completed/dismissed decisions across catalog revisions; never restart implicitly.
      tour: { status: parsed.data.tour.status, stopId },
    };
  } catch { return emptyOnboardingLocalState(); }
}

export function onboardingStorageKey(userId: string) {
  if (!userId || userId.length > 128) throw new Error("invalid_onboarding_owner");
  return `mutano:onboarding:${encodeURIComponent(userId)}`;
}
export function readOnboardingLocalState(storage: { getItem(key: string): string | null }, userId: string) {
  try { return parseOnboardingLocalState(storage.getItem(onboardingStorageKey(userId))); } catch { return emptyOnboardingLocalState(); }
}
export function writeOnboardingLocalState(storage: { setItem(key: string, value: string): void }, userId: string, state: OnboardingLocalState) {
  try { storage.setItem(onboardingStorageKey(userId), JSON.stringify(parseOnboardingLocalState(state))); return true; } catch { return false; }
}

export function getOnboardingTour(profile: UsageProfile) {
  const sections = getNavigationSections(profile, "desktop");
  return [
    ...sections.map(section => ({ id: section.id as TourStopId, title: section.label, href: section.items[0]!.href,
      routes: section.items.map(item => ({ href: item.href, label: item.label })) })),
    { id: "notifications" as const, title: "Notificações, Telegram e chat", href: "/notificacoes", routes: [{ href: "/notificacoes", label: "Escolher avisos" }] },
  ];
}

export type OnboardingLocalEvent = { type: "skip" | "resume-step"; stepId: OnboardingStepId }
  | { type: "tour-start" | "tour-resume" | "tour-pause" | "tour-complete" | "tour-dismiss" }
  | { type: "tour-go"; stopId: TourStopId };
export function transitionOnboardingLocalState(input: OnboardingLocalState, event: OnboardingLocalEvent, profile: UsageProfile): OnboardingLocalState {
  const state = parseOnboardingLocalState(input);
  if (event.type === "skip" || event.type === "resume-step") {
    if (!skippable.includes(event.stepId)) return state;
    return { ...state, skippedSteps: event.type === "skip" ? [...new Set([...state.skippedSteps, event.stepId])] : state.skippedSteps.filter(id => id !== event.stepId) };
  }
  const stops = getOnboardingTour(profile);
  const current = stops.find(stop => stop.id === state.tour.stopId)?.id ?? stops[0]!.id;
  if (event.type === "tour-dismiss" || event.type === "tour-complete") return { ...state, tour: { status: event.type === "tour-dismiss" ? "dismissed" : "completed", stopId: null } };
  if (event.type === "tour-pause") return { ...state, tour: { status: "paused", stopId: current } };
  if (event.type === "tour-go") return stops.some(stop => stop.id === event.stopId) ? { ...state, tour: { status: "active", stopId: event.stopId } } : state;
  if (event.type === "tour-resume" && (state.tour.status === "completed" || state.tour.status === "dismissed")) return state;
  return { ...state, tour: { status: "active", stopId: event.type === "tour-start" ? stops[0]!.id : current } };
}

export function deriveOnboardingJourney(facts: OnboardingFacts, local?: OnboardingLocalState) {
  const integrating = canUseCapability(facts.profile, "integration");
  const skipped = parseOnboardingLocalState(local).skippedSteps;
  const firstData = integrating ? facts.integration.status === "complete" : facts.hasManualTransaction;
  const defs: { id: OnboardingStepId; title: string; status: OnboardingStepStatus; href: string | null; actionLabel: string; evidence: string }[] = [
    { id: "registration", title: "Cadastro", status: facts.registered ? "concluido" : "pendente", href: "/onboarding", actionLabel: "Continuar configuração", evidence: "authenticated_account" },
    { id: "mode", title: "Escolher modo", status: facts.modeChosen ? "concluido" : "pendente", href: "/onboarding", actionLabel: "Salvar meu modo", evidence: "onboarded_at" },
    { id: "pluggy", title: "Preparar Pluggy", status: !integrating ? "nao_aplicavel" : facts.credentialConfigured ? "concluido" : "pendente", href: integrating ? "/configuracoes/integracao" : null, actionLabel: "Configurar minha conexão", evidence: "saved_credentials_only" },
    { id: "first-data", title: "Primeiros dados", status: firstData ? "concluido" : (integrating ? facts.integration.connections > 0 : facts.hasAccount) ? "em_andamento" : "pendente", href: integrating ? "/configuracoes/integracao" : "/lancamentos", actionLabel: integrating ? "Conectar e sincronizar" : "Adicionar primeiro lançamento", evidence: integrating ? facts.integration.status : "manual_or_imported_transaction" },
    { id: "planning", title: "Categorias e orçamento", status: facts.hasBudget ? "concluido" : "pendente", href: "/orcamento", actionLabel: "Revisar meu orçamento", evidence: "budget_created_category_review_not_tracked" },
    { id: "notifications", title: "Notificações, Telegram e chat", status: facts.notifications.decided ? "concluido" : facts.notifications.telegramLinked || facts.notifications.pushRegisteredOnAnyDevice ? "em_andamento" : "pendente", href: "/notificacoes", actionLabel: "Escolher meus avisos", evidence: "saved_preferences_not_delivery" },
    { id: "summary", title: "Primeiro resumo", status: facts.hasReadSummary ? "concluido" : facts.modeChosen ? "em_andamento" : "pendente", href: "/painel", actionLabel: "Ver meu primeiro resumo", evidence: facts.hasReadSummary ? "read_summary_receipt" : "dashboard_visit_not_tracked" },
  ];
  const steps = defs.map(step => ({ ...step, canSkip: skippable.includes(step.id),
    status: step.status !== "concluido" && step.status !== "nao_aplicavel" && skipped.includes(step.id) ? "pulado" as const : step.status,
  }));
  const completedCount = steps.filter(s => s.status === "concluido").length;
  const notApplicableCount = steps.filter(s => s.status === "nao_aplicavel").length;
  return { version: ONBOARDING_VERSION, profile: facts.profile, steps, completedCount,
    skippedCount: steps.filter(s => s.status === "pulado").length, notApplicableCount,
    applicableCount: steps.length - notApplicableCount,
    complete: completedCount === steps.length - notApplicableCount,
    nextStepId: steps.find(s => s.status === "pendente" || s.status === "em_andamento")?.id ?? null,
    notifications: facts.notifications, integration: facts.integration,
    persistence: { facts: "server-derived", tourAndSkips: "local-device-only", categoryReviewTracked: false, dashboardVisitTracked: false } as const,
  };
}
export type OnboardingJourney = ReturnType<typeof deriveOnboardingJourney>;

export const onboardingCalibrationSchema = z.object({
  usageProfile: z.enum(USAGE_PROFILES),
  income: z.string().trim().min(1, "Informe sua renda ou escolha adiar.").max(40)
    .regex(/^(?:R\$\s*)?(?:(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?|\d+\.\d{1,2})$/, "Informe uma renda válida e positiva.")
    .transform(parseMoneyToCents).refine(v => Number.isSafeInteger(v) && v > 0 && v <= MAX_CENTS, "Informe uma renda válida dentro do limite."),
  emergencyMonths: z.coerce.number().int().min(1).max(24).default(6),
  savingsTargetPct: z.coerce.number().int().min(0).max(90).default(20),
});

/** Never treat widget authorization, a skipped attempt or zero imported rows as proof by themselves. */
export function summarizeInitialOnboardingSync(result: unknown) {
  const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const good = accounts.filter(row => row && typeof row === "object" && row.status === "OK").length;
  const state = data.ok === true && data.status === "UPDATED" && !data.error && good > 0 && good === accounts.length ? "completed"
    : good > 0 && good < accounts.length ? "partial" : data.skipped === true ? "pending" : "failed";
  return { state, accountCount: accounts.length, imported: typeof data.imported === "number" && Number.isSafeInteger(data.imported) && data.imported >= 0 ? data.imported : 0 } as { state: "completed" | "partial" | "pending" | "failed"; accountCount: number; imported: number };
}
