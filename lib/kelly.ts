export function kellyStake(
  bankroll: number,
  prob: number,
  odds: number,
  maxFraction: number
): number {
  const b = odds - 1;
  const q = 1 - prob;
  const kelly = (b * prob - q) / b;
  const fraction = Math.max(0, Math.min(kelly, maxFraction));
  return parseFloat((bankroll * fraction).toFixed(2));
}
