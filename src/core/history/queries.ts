import type { GapBucket, HistoryRow } from './rows.js';
import { dayString, periodStart } from './period.js';
import type { Period } from './period.js';

export interface Totals {
  responses: number;
  input: number;
  output: number;
  read: number;
  write: number;
  cost: number;
  unpriced: number;
}
export const noTotals = (): Totals => ({
  responses: 0,
  input: 0,
  output: 0,
  read: 0,
  write: 0,
  cost: 0,
  unpriced: 0,
});

export function sum(rows: Iterable<HistoryRow>): Totals {
  const total = noTotals();
  for (const row of rows) {
    total.responses += row.responses;
    total.input += row.input;
    total.output += row.output;
    total.read += row.read;
    total.write += row.write;
    total.cost += row.cost;
    total.unpriced += row.unpriced;
  }
  return total;
}
/** Rows that fall in the period containing `date` (today, this week from Monday, this month). */
export function inPeriod(rows: Iterable<HistoryRow>, period: Period, date: Date): HistoryRow[] {
  const from = periodStart(period, date);
  const to = dayString(date);
  return [...rows].filter((row) => row.day >= from && row.day <= to);
}
export type GroupKey = 'project' | 'model' | 'provider' | 'gap';
export function groupBy(rows: Iterable<HistoryRow>, by: GroupKey): Map<string, Totals> {
  const groups = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    const key = by === 'model' ? `${row.provider}/${row.model}` : row[by];
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return new Map([...groups].map(([key, list]) => [key, sum(list)]));
}
/** Reuse over many responses: all reads over all prompt tokens, never a mean of percentages. Null without reads. */
export function cacheShare(total: Totals): number | null {
  const prompt = total.input + total.read + total.write;
  return total.read > 0 && prompt > 0 ? (total.read / prompt) * 100 : null;
}
export type { GapBucket };
