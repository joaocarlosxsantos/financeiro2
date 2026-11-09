/** Semantic chart inks adapt to both paper and AMOLED themes. */
export const VIZ = {
  in: "var(--text-in)",
  out: "var(--text-out)",
  balance: "var(--text)",
  fixed: "var(--text)",
  variable: "var(--text-warn)",
  comparison: "var(--text-muted)",
  grid: "var(--line)",
  axis: "var(--text-subtle)",
} as const;

export const CHART_CATEGORY_PALETTE = [
  "var(--text)", "var(--text-info)", "var(--text-warn)",
  "var(--text-in)", "var(--text-out)", "var(--text-muted)",
] as const;

// Compatibility for persisted defaults/native color inputs, never chart ink.
export { DEFAULT_CATEGORY_COLORS as CATEGORY_PALETTE } from "@/lib/category-colors";
