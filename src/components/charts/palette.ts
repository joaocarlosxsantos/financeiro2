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
 * 17 tons de categoria desbotados derivados da paleta "caderno de contas"
 * (nanquim, musgo, tijolo, ocre, ameixa, oliva, petróleo, couro, argila, índigo).
 * Tons com delta perceptível claro e índice único para cada categoria padrão.
 */
export const CATEGORY_PALETTE = [
  "#2F6B4F", // 0: verde musgo floresta (Salário)
  "#4E8065", // 1: sálvia suave (Renda extra)
  "#1F3A5F", // 2: azul nanquim profundo (Rendimentos)
  "#2E4D6E", // 3: nanquim ardósia (Moradia)
  "#5C6B73", // 4: ardósia lavado neutro (Contas de casa)
  "#7B4B68", // 5: ameixa / vinho desbotado (Educação)
  "#3D7870", // 6: verde petróleo / sálvia medicinal (Saúde)
  "#4B5878", // 7: índigo acinzentado (Assinaturas)
  "#B8863A", // 8: ocre mostarda (Transporte fixo)
  "#8F3D30", // 9: vermelho tijolo escuro (Dívidas e juros)
  "#5E733B", // 10: verde oliva seco (Mercado)
  "#C2571A", // 11: laranja acento / queimado (Alimentação fora)
  "#D49B42", // 12: âmbar / trigo dourado (Transporte)
  "#9E5664", // 13: rosa antigo / argila (Lazer)
  "#B4412F", // 14: vermelho tijolo / terracota (Compras)
  "#825434", // 15: marrom couro / sela (Cuidados pessoais)
  "#6E727A", // 16: grafite / pedra neutro (Outros)
] as const;
