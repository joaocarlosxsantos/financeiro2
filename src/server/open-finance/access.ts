export function maskClientId(clientId: string): string {
  if (!clientId) return "••••";
  const trimmed = clientId.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}
