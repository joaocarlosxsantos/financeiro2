/**
 * Calcula o delta efetivo a aplicar quando o saldo é clamped ao piso 0.
 * Exemplo: saldo 100, delta -150 → saldo não pode ir abaixo de 0,
 * então o delta efetivo é -100 (deixa saldo em 0).
 */
export function effectiveDelta(current: number, delta: number): number {
  const newBalance = current + delta;
  if (newBalance >= 0) {
    return delta;
  }
  const result = -current;
  return result + 0; // Normaliza -0 para 0
}
