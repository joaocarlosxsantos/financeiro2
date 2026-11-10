/** Política compartilhada pela navegação e pelas entradas do servidor. */
export const USAGE_PROFILES = ["integracao_total", "hibrido", "manual"] as const;
export type UsageProfile = (typeof USAGE_PROFILES)[number];
export type ProfileCapability = "manual-entry" | "integration";

export const PROFILE_OPTIONS: { value: UsageProfile; label: string; description: string }[] = [
  { value: "integracao_total", label: "Integração total", description: "Movimentações só pelo Open Finance. Planejamento continua disponível." },
  { value: "hibrido", label: "Híbrido", description: "Open Finance, lançamentos e importação manual." },
  { value: "manual", label: "Somente manual", description: "Lançamentos e importação de arquivos, sem Open Finance." },
];

export function isUsageProfile(value: unknown): value is UsageProfile {
  return USAGE_PROFILES.some((profile) => profile === value);
}

export function canUseCapability(profile: UsageProfile, capability: ProfileCapability): boolean {
  return capability === "manual-entry" ? profile !== "integracao_total" : profile !== "manual";
}

export function profileRestriction(profile: UsageProfile, capability: ProfileCapability): string | null {
  if (canUseCapability(profile, capability)) return null;
  return capability === "manual-entry"
    ? "Seu perfil usa apenas Open Finance. Para lançar manualmente, altere o perfil em Minha conta."
    : "Open Finance está desativado no perfil Somente manual. Altere o perfil em Minha conta para integrar.";
}

export function canVisitRoute(profile: UsageProfile, pathname: string): boolean {
  const at = (route: string) => pathname === route || pathname.startsWith(`${route}/`);
  if (at("/importar") || at("/recorrentes")) return canUseCapability(profile, "manual-entry");
  if (at("/configuracoes/integracao")) return canUseCapability(profile, "integration");
  return true;
}
