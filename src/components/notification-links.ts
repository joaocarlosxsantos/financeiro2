export function safeNotificationPath(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    if (url.origin === origin && value.startsWith("/") && !value.startsWith("//")) return `${url.pathname}${url.search}${url.hash}`;
  } catch { /* Invalid paths fall back to the inbox. */ }
  return "/notificacoes";
}
