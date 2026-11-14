import { BOT_COMMANDS } from "@/server/telegram/commands";

const names: Record<string, string> = {
  saldo: "Saldo", previsao: "Previsão", hoje: "Gasto de hoje", assinaturas: "Assinaturas",
  resumo: "Resumo diário", relatorio: "Relatório mensal", cartao: "Cartões",
  start: "Início", menu: "Menu", ajuda: "Ajuda", pausar: "Pausar avisos",
};
// The bot's published catalog is the authority. No arbitrary text or AI path.
export const SITE_CHAT_COMMANDS = [
  ...BOT_COMMANDS.map(item => ({ command: `/${item.command}`, label: names[item.command] ?? item.command, description: item.description })),
  { command: "/resumo semana", label: "Resumo semanal", description: "Ver o resumo da semana." },
  { command: "/avisos", label: "Meus avisos", description: "Consultar as preferências do Telegram." },
] as const;

export const isSiteChatCommand = (value: unknown): value is string => typeof value === "string"
  && SITE_CHAT_COMMANDS.some(item => item.command === value);

export type ChatMessage = { id: number; role: "user" | "assistant"; text: string };

/** Keep the launcher clear of mobile navigation/install banners at its current edge. */
export function floatingChatBottom(viewportHeight: number, anchor: { left: number; right: number }, obstacles: { left: number; right: number; top: number; height: number }[]) {
  return obstacles.reduce((bottom, rect) => rect.height > 0 && rect.left < anchor.right && rect.right > anchor.left
    ? Math.max(bottom, viewportHeight - rect.top + 16) : bottom, 24);
}
