export function money(value: number): string {
  if (value === 0) return '$0.00';
  return value >= 0.01
    ? `$${value.toFixed(2)}`
    : value >= 0.0001
      ? `$${value.toFixed(4)}`
      : '<$0.0001';
}
