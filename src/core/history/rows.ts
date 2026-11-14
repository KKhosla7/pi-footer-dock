export type GapBucket = 'first' | '1m' | '5m' | '1h' | 'long';
export const GAP_BUCKETS: readonly GapBucket[] = ['first', '1m', '5m', '1h', 'long'];

export function gapBucket(milliseconds: number | null): GapBucket {
  if (milliseconds === null) return 'first';
  if (milliseconds <= 60_000) return '1m';
  if (milliseconds <= 300_000) return '5m';
  return milliseconds <= 3_600_000 ? '1h' : 'long';
}

export interface HistoryRow {
  day: string;
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
  cost: number;
  unpriced: number;
}
export interface ProjectInfo {
  key: string;
  label: string;
}

export const rowKey = (row: HistoryRow): string =>
  [row.day, row.project, row.provider, row.model, row.api, row.gap].join('|');

const LIMIT = Number.MAX_SAFE_INTEGER;
const sat = (a: number, b: number): number => Math.min(LIMIT, a + b);

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

export function projectLabel(path: string): string {
  const name = path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
  const clean = name.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/gu, '').trim();
  return (clean || '(unnamed)').slice(0, 40);
}
