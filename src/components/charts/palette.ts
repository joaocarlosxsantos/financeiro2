/**
 * Paleta dos gráficos — validada para daltonismo (protan/deutan/tritan)
 * e para contraste nos dois temas.
 *
 * `in`/`out`/`variable` usam o mesmo hex em claro e escuro (contraste já
 * confortável nos dois). `balance`/`fixed` usam a cor de marca via
 * `var(--text-brand)` — o petróleo escuro que funciona no claro fica quase
 * invisível sobre fundo escuro, então esse token já vem com uma versão mais
 * clara para o dark mode (ver globals.css).
 *
 * Se trocar alguma cor, revalide os pares adjacentes antes de subir.
 */
export const VIZ = {
  in: "#0d9488", // entrou
  out: "#f43f5e", // saiu
  balance: "var(--text-brand)", // sobrou
  fixed: "var(--text-brand)",
  variable: "#d95926",
  grid: "rgba(127,140,160,0.18)",
  axis: "rgba(127,140,160,0.55)",
} as const;
