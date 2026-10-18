/** How long Pi sat idle before a response: the main thing that decides whether a cache survives. */
export type GapBucket = 'first' | '1m' | '5m' | '1h' | 'long';
export const GAP_BUCKETS: readonly GapBucket[] = ['first', '1m', '5m', '1h', 'long'];

export function gapBucket(milliseconds: number | null): GapBucket {
  if (milliseconds === null) return 'first';
  if (milliseconds <= 60_000) return '1m';
  if (milliseconds <= 300_000) return '5m';
  return milliseconds <= 3_600_000 ? '1h' : 'long';
}

/** Sums for one (day, project, model, gap): numbers and short labels only, never any text. */
export interface HistoryRow {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  /** Opaque project key (a one-way hash of the folder). */
  project: string;
  provider: string;
  model: string;
  api: string;
  gap: GapBucket;
  responses: number;
  input: number;
  output: number;
  read: number;
  write: number;
  /** Dollars of the responses that could be priced. */
  cost: number;
  /** Responses that carried tokens but could not be priced: counted, never treated as free. */
  unpriced: number;
}
export interface ProjectInfo {
  key: string;
  /** The folder name, cleaned for display. */
  label: string;
}

export const rowKey = (row: HistoryRow): string =>
  [row.day, row.project, row.provider, row.model, row.api, row.gap].join('|');

const LIMIT = Number.MAX_SAFE_INTEGER;
const sat = (a: number, b: number): number => Math.min(LIMIT, a + b);

/** Adds `row` into `into` under its key; sums saturate at the safe-integer limit instead of overflowing. */
export function addRow(into: Map<string, HistoryRow>, row: HistoryRow): void {
  const key = rowKey(row);
  const have = into.get(key);
  if (!have) {
    into.set(key, { ...row });
    return;
  }
  have.responses = sat(have.responses, row.responses);
  have.input = sat(have.input, row.input);
  have.output = sat(have.output, row.output);
  have.read = sat(have.read, row.read);
  have.write = sat(have.write, row.write);
  have.cost += row.cost;
  have.unpriced = sat(have.unpriced, row.unpriced);
}

/** A folder name made safe to draw: no controls, no newlines, at most 40 characters. */
export function projectLabel(path: string): string {
  const name = path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
  // eslint-disable-next-line no-control-regex -- stripping controls is the point
  const clean = name.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/gu, '').trim();
  return (clean || '(unnamed)').slice(0, 40);
}
