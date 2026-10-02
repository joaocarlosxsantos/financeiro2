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
  in: "var(--color-money-in)", // entrou
  out: "var(--color-money-out)", // saiu
  balance: "var(--text-brand)", // sobrou
  fixed: "var(--text-brand)",
  variable: "var(--color-variable)",
  grid: "var(--line)",
  axis: "var(--line)",
} as const;

/**
 * 10 tons de categoria limpos e distintos entre si
 * (famílias azul, verde-água, violeta, âmbar, coral e cinza).
 * Saturação média, contraste >= 3:1 contra a superfície em ambos os temas
 * (#FFFFFF no claro e #151A21 no escuro) e delta perceptível entre vizinhos.
 */
export const CATEGORY_PALETTE = [
  "#316DBA", // 0: azul safira (família azul)
  "#168272", // 1: verde-água profundo / petróleo (família verde-água)
  "#775CB8", // 2: violeta ametista (família violeta)
  "#A8721A", // 3: âmbar dourado (família âmbar)
  "#BA533D", // 4: coral terracota (família coral)
  "#2A8256", // 5: verde sálvia floresta (família verde-água)
  "#2480A4", // 6: azul ardósia cerúleo (família azul)
  "#9A5082", // 7: ameixa suave / baga (família violeta)
  "#AC5369", // 8: rosa argila / terracota (família coral)
  "#5D6C7D", // 9: cinza ardósia / grafite (família cinza)
] as const;
