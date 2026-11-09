/** Persisted category defaults and native color inputs require literal colors.
 * Charts use theme tokens instead; keep these existing saved defaults stable. */
export const DEFAULT_CATEGORY_COLORS = [
  "#316DBA", "#168272", "#775CB8", "#A8721A", "#BA533D",
  "#2A8256", "#2480A4", "#9A5082", "#AC5369", "#5D6C7D",
] as const;
