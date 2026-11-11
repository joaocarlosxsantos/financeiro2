/** Styles remain inline-compatible for React/Recharts dynamic style attributes. */
export function documentPolicy(nonce: string, development: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.pluggy.ai${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://cdn.pluggy.ai",
    "img-src 'self' data: blob: https://*.pluggy.ai https://cdn.pluggy.ai",
    "font-src 'self' https://cdn.pluggy.ai",
    `connect-src 'self' https://api.pluggy.ai https://*.pluggy.ai${development ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'self' https://connect.pluggy.ai https://*.pluggy.ai",
    "frame-ancestors 'none'",
  ].join("; ");
}
