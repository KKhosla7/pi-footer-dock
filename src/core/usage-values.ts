export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function dollars(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
}
export function add(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  const sum = a + b;
  return Number.isFinite(sum) && sum <= Number.MAX_SAFE_INTEGER ? sum : null;
}
export interface TokenUsage {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}
export function tokenUsage(value: unknown): TokenUsage | null {
  const usage = record(value);
  if (!usage) return null;
  const input = count(usage.input);
  const output = count(usage.output);
  const cacheRead = count(usage.cacheRead);
  const cacheWrite = count(usage.cacheWrite);
  return input === null || output === null || cacheRead === null || cacheWrite === null
    ? null
    : { input, output, cacheRead, cacheWrite };
}
