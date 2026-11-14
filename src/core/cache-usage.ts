import { add, count, record } from './usage-values.js';

export interface CacheUsage {
  input: number | null;
  read: number | null;
  write: number | null;
  prompt: number | null;
  reusePercent: number | null;
}
export interface CachePolicy {
  short: number | null;
  long: number | null;
}

export function readCacheUsage(value: unknown): CacheUsage {
  const usage = record(value);
  const input = count(usage?.input);
  const read = count(usage?.cacheRead);
  const write = count(usage?.cacheWrite);
  const prompt = add(add(input, read), write);
  return {
    input,
    read,
    write,
    prompt,
    reusePercent:
      prompt !== null && prompt > 0 && read !== null && read > 0 ? (read / prompt) * 100 : null,
  };
}

function lifetime(value: unknown): number | null {
  const seconds = count(value);
  return seconds !== null && seconds > 0 ? seconds : null;
}

export function readCachePolicy(value: unknown): CachePolicy {
  const policy = record(value);
  return { short: lifetime(policy?.short), long: lifetime(policy?.long) };
}
