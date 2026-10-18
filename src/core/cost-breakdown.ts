import { NO_PARTS } from './response-price.js';
import type { CostParts, PriceBasis } from './response-price.js';
import type { TokenUsage } from './usage-values.js';

/** What one model (or the whole session) cost: tokens and dollars by category. */
export interface CostRow {
  responses: number;
  tokens: TokenUsage;
  parts: CostParts;
}
/** The most recent priced response, for the worked example. */
export interface LatestCost extends CostRow {
  model: string;
  basis: PriceBasis;
}
export interface CostBreakdown {
  total: CostRow;
  /** By `provider/model`; at most 16 plus `(other)`. */
  models: Readonly<Record<string, CostRow>>;
  latest?: LatestCost;
}

const MAX_MODELS = 16;
const SAFE = /^[\w./:-]{1,128}$/u;
const NO_TOKENS: TokenUsage = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

function sum(a: CostParts, b: CostParts): CostParts {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}
function tokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}
const empty = (): CostRow => ({ responses: 0, tokens: NO_TOKENS, parts: NO_PARTS });
function join(row: CostRow, usage: TokenUsage, parts: CostParts): CostRow {
  return {
    responses: row.responses + 1,
    tokens: tokens(row.tokens, usage),
    parts: sum(row.parts, parts),
  };
}
export function modelKey(provider: unknown, model: unknown): string {
  const safe = (value: unknown): string | undefined =>
    typeof value === 'string' && SAFE.test(value) ? value : undefined;
  const p = safe(provider);
  const m = safe(model);
  return p && m ? `${p}/${m}` : '(unassigned)';
}

/** Where the money went, by category and by model. Metadata only, bounded, never any text. */
export class CostBreakdownAccumulator {
  private total = empty();
  private readonly models = new Map<string, CostRow>();
  private latest: LatestCost | undefined;

  add(key: string, usage: TokenUsage, parts: CostParts, basis: PriceBasis): void {
    const slot = this.models.has(key) || this.models.size < MAX_MODELS ? key : '(other)';
    this.total = join(this.total, usage, parts);
    this.models.set(slot, join(this.models.get(slot) ?? empty(), usage, parts));
    this.latest = { model: key, basis, responses: 1, tokens: usage, parts };
  }
  snapshot(): CostBreakdown {
    return {
      total: this.total,
      models: Object.fromEntries(this.models),
      ...(this.latest ? { latest: this.latest } : {}),
    };
  }
}
