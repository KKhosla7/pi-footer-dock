import type { HistoryRow } from './rows.js';

export type Period = 'day' | 'week' | 'month';
export const PERIODS: readonly Period[] = ['day', 'week', 'month'];

const two = (value: number): string => String(value).padStart(2, '0');
export const dayString = (date: Date): string =>
  `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
const fromDay = (day: string): Date =>
  new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

/** First day of the period that contains `date`: today, the Monday of this week, or the 1st. */
export function periodStart(period: Period, date: Date): string {
  if (period === 'day') return dayString(date);
  if (period === 'month') return `${date.getFullYear()}-${two(date.getMonth() + 1)}-01`;
  const back = (date.getDay() + 6) % 7;
  return dayString(new Date(date.getFullYear(), date.getMonth(), date.getDate() - back));
}
/** The first day of the period `back` periods before the one containing `date`. */
export function periodStartBack(period: Period, date: Date, back: number): string {
  if (period === 'day')
    return dayString(new Date(date.getFullYear(), date.getMonth(), date.getDate() - back));
  if (period === 'week') {
    const monday = fromDay(periodStart('week', date));
    return dayString(
      new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * back),
    );
  }
  return dayString(new Date(date.getFullYear(), date.getMonth() - back, 1));
}

export interface Bin {
  /** First day of the bin. */
  start: string;
  cost: number;
  unpriced: number;
  responses: number;
}
/** The last `count` bins of `period`, oldest first, ending with the one that contains `date`. */
export function series(
  rows: Iterable<HistoryRow>,
  period: Period,
  date: Date,
  count: number,
): Bin[] {
  const starts = Array.from({ length: count }, (_, index) =>
    periodStartBack(period, date, count - 1 - index),
  );
  const bins: Bin[] = starts.map((start) => ({ start, cost: 0, unpriced: 0, responses: 0 }));
  for (const row of rows) {
    let at = -1;
    for (let index = bins.length - 1; index >= 0; index -= 1) {
      if (row.day >= (bins[index]?.start ?? '9999')) {
        at = index;
        break;
      }
    }
    const bin = at < 0 ? undefined : bins[at];
    if (bin && row.day <= dayString(date)) {
      bin.cost += row.cost;
      bin.unpriced += row.unpriced;
      bin.responses += row.responses;
    }
  }
  return bins;
}
