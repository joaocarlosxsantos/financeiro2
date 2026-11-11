export function isUserAllowedForOpenFinance(userId: string): { allowed: boolean; reason?: "unavailable" | "forbidden" } {
  const clientId = process.env.PLUGGY_CLIENT_ID?.trim();
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return { allowed: false, reason: "unavailable" };
  }
  const rawAllowed = process.env.OPEN_FINANCE_ALLOWED_USER_IDS?.trim() ?? "";
  if (!rawAllowed) {
    return { allowed: false, reason: "forbidden" };
  }
  const allowedSet = new Set(rawAllowed.split(",").map((id) => id.trim()).filter(Boolean));
  if (!allowedSet.has(userId)) {
    return { allowed: false, reason: "forbidden" };
  }
  return { allowed: true };
}
