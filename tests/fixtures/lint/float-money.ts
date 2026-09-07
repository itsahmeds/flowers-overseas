// Invalid fixture: float money (spec 001 §2 "fo/no-float-money", §8; plan/12 §2 "Money").
// Four violations, one per shape the rule detects: decimal literal, `number` annotation,
// `parseFloat`, `toFixed`. The rule is unit tested and fixture-checked in spec 001 but only
// switched on in eslint.config.mjs by spec 005, so `pnpm lint:fixtures` does not report it.
export const listPrice = 12.5;

export function quote(deliveryFee: number, rawPrice: string): string {
  const amount = parseFloat(rawPrice);
  return `${String(deliveryFee)} ${amount.toFixed(2)}`;
}
