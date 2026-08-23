/**
 * Paleta dos gráficos — validada para daltonismo (protan/deutan/tritan)
 * e para contraste nos dois temas. Mesmos hexes em claro e escuro.
 *
 * Se trocar alguma cor, revalide os pares adjacentes antes de subir.
 */
export const VIZ = {
  in: "#0d9488", // entrou
  out: "#f43f5e", // saiu
  balance: "#6366f1", // sobrou
  fixed: "#6366f1",
  variable: "#d95926",
  grid: "rgba(127,140,160,0.18)",
  axis: "rgba(127,140,160,0.55)",
} as const;
