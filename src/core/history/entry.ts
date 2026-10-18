import { priceResponse } from '../response-price.js';
import { contribution } from '../usage-ledger.js';
import type { PriceSource } from '../price-source.js';
import { record, tokenUsage } from '../usage-values.js';
import type { TokenUsage } from '../usage-values.js';

const SAFE = /^[\w./:-]{1,128}$/u;
const label = (value: unknown): string =>
  typeof value === 'string' && SAFE.test(value) ? value : '(unassigned)';

/** The first line of a Pi session log. */
export interface SessionHeader {
  cwd: string;
  version: number;
}
export function parseHeader(line: string): SessionHeader | undefined {
  try {
    const value = record(JSON.parse(line));
    if (value?.type !== 'session') return undefined;
    const { cwd, version } = value;
    return typeof cwd === 'string' &&
      cwd.length > 0 &&
      cwd.length < 4096 &&
      typeof version === 'number'
      ? { cwd, version }
      : undefined;
  } catch {
    return undefined;
  }
}

/** One response's worth of usage from a log line. */
export interface Contribution {
  /** When Pi began the response, epoch ms, or null when the line does not say. */
  startMs: number | null;
  /** When the entry was written, epoch ms. */
  endMs: number;
  provider: string;
  model: string;
  api: string;
  usage: TokenUsage;
  /** Dollars, or null when it could not be priced. */
  cost: number | null;
}

function jsonRecord(line: string): Record<string, unknown> | null {
  try {
    return record(JSON.parse(line));
  } catch {
    return null;
  }
}

/**
 * What a log line contributes, by the same rule as the session total (`contribution`): an
 * assistant response, a standalone usage entry or a summary that carries usage. Any other line
 * returns `undefined`; a line that claims usage but is unusable returns `'invalid'`.
 */
export function parseContribution(
  line: string,
  prices: PriceSource,
): Contribution | 'invalid' | undefined {
  if (!line.includes('"usage"')) return undefined;
  const entry = jsonRecord(line);
  if (!entry) return 'invalid';
  const source = contribution(entry);
  if (!source) return undefined;
  const usage = tokenUsage(source.usage);
  const endMs = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : Number.NaN;
  if (!usage || !Number.isFinite(endMs)) return 'invalid';
  const priced = priceResponse(source, usage, prices);
  const start = source.timestamp;
  return {
    startMs: typeof start === 'number' && Number.isFinite(start) ? start : null,
    endMs,
    provider: label(source.provider),
    model: label(source.model),
    api: label(source.api),
    usage,
    cost: 'failure' in priced ? null : priced.amount,
  };
}
