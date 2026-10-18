import { formatTokens } from '../../model.js';
import type { Snapshot } from '../../model.js';
import { inPeriod, sum } from '../../history/queries.js';
import { cacheShare } from '../../history/queries.js';
import type { Totals } from '../../history/queries.js';
import { series } from '../../history/period.js';
import type { Period } from '../../history/period.js';
import { GAP_BUCKETS } from '../../history/rows.js';
import type { GapBucket, HistoryRow } from '../../history/rows.js';
import { bars, bullets, facts, gap, heading, note, table } from '../blocks.js';
import type { Block, Fact } from '../blocks.js';
import { money } from './money.js';

type History = NonNullable<Snapshot['history']>;
const BINS: Record<Period, number> = { day: 14, week: 12, month: 12 };
const NAMES: Record<Period, string> = { day: 'today', week: 'this week', month: 'this month' };
const LAST: Record<Period, string> = { day: 'days', week: 'weeks', month: 'months' };
const TOP = 8;
const GAPS: Record<GapBucket, string> = {
  first: 'first of a session',
  '1m': 'up to 1 minute',
  '5m': 'up to 5 minutes',
  '1h': 'up to 1 hour',
  long: 'over 1 hour',
};
const count = (value: number): string => value.toLocaleString('en-US');
const share = (part: number, whole: number): string =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
const percent = (totals: Totals): string => {
  const value = cacheShare(totals);
  return value === null
    ? 'not reported'
    : `${value >= 99.5 && value < 100 ? '<100' : Math.round(value)}%`;
};
const promptOf = (totals: Totals): number => totals.input + totals.read + totals.write;

/** The pinned line for the chosen period's total, when the history is known. */
export function headlineFact(history: History | undefined, period: Period, now: Date): Fact[] {
  if (!history) return [];
  const total = sum(inPeriod(history.rows, period, now));
  const plus = total.unpriced > 0 ? '+' : '';
  const name = NAMES[period];
  return [
    {
      label: `${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`,
      value: `${total.cost < 0.01 && total.cost > 0 ? '<$0.01' : money(total.cost)}${plus}`,
      note: `${count(total.responses)} responses, all sessions`,
    },
  ];
}

/** How the screen says which period it is showing and how to change it. */
export function periodFacts(period: Period): Block {
  return facts({
    label: 'Period',
    value: NAMES[period],
    note: 'press d, w or m for today, this week or this month',
  });
}

/** Rows grouped by `pick`, biggest first by `weigh`, the tail folded into one `other` row. */
function grouped(
  rows: readonly HistoryRow[],
  pick: (row: HistoryRow) => string,
  weigh: (totals: Totals) => number,
): { name: string; totals: Totals }[] {
  const groups = new Map<string, HistoryRow[]>();
  for (const row of rows) groups.set(pick(row), [...(groups.get(pick(row)) ?? []), row]);
  const sorted = [...groups]
    .map(([name, list]) => ({ name, totals: sum(list) }))
    .sort((a, b) => weigh(b.totals) - weigh(a.totals));
  if (sorted.length <= TOP) return sorted;
  const rest = sum(sorted.slice(TOP).flatMap(({ name }) => groups.get(name) ?? []));
  return [...sorted.slice(0, TOP), { name: `other (${sorted.length - TOP})`, totals: rest }];
}
const projectName =
  (history: History) =>
  (row: HistoryRow): string =>
    history.projects[row.project] ?? '(unknown)';

/** Cost over time: a column per day, week or month, then where the period's money went. */
export function costHistory(history: History, period: Period, now: Date): Block[] {
  const bins = series(history.rows, period, now, BINS[period]);
  const costs = bins.map((bin) => bin.cost);
  const peak = Math.max(0, ...costs);
  const here = inPeriod(history.rows, period, now);
  const total = sum(here);
  return [
    gap,
    heading('Over time'),
    periodFacts(period),
    bars({
      values: costs,
      axis: [
        bins[0]?.start.slice(period === 'month' ? 0 : 5, period === 'month' ? 7 : 10) ?? '',
        bins.at(-1)?.start.slice(period === 'month' ? 0 : 5, period === 'month' ? 7 : 10) ?? '',
      ],
      peak: money(peak),
      current: costs.length - 1,
    }),
    note(
      `Last ${bins.length} ${LAST[period]}. ${NAMES[period][0]?.toUpperCase()}${NAMES[period].slice(1)}: ${money(total.cost)} over ${count(total.responses)} responses.`,
    ),
    gap,
    heading(`By project, ${NAMES[period]}`),
    table(
      ['Project', 'Responses', 'Dollars', 'Share'],
      grouped(here, projectName(history), (t) => t.cost).map(({ name, totals }) => [
        name,
        count(totals.responses),
        money(totals.cost),
        share(totals.cost, total.cost),
      ]),
      [1, 2, 3],
    ),
    gap,
    heading(`By model, ${NAMES[period]}`),
    table(
      ['Model', 'Responses', 'Dollars', 'Share'],
      grouped(
        here,
        (row) => `${row.provider}/${row.model}`,
        (t) => t.cost,
      ).map(({ name, totals }) => [
        name,
        count(totals.responses),
        money(totals.cost),
        share(totals.cost, total.cost),
      ]),
      [1, 2, 3],
    ),
    ...(total.unpriced > 0
      ? [
          note(
            `${count(total.unpriced)} responses in this period could not be priced and are not in these totals.`,
            'warning',
          ),
        ]
      : []),
  ];
}

/** Cache over time: reuse by project, by model and by how long Pi sat idle before the response. */
export function cacheHistory(history: History, period: Period, now: Date): Block[] {
  const here = inPeriod(history.rows, period, now);
  const total = sum(here);
  const row = (name: string, totals: Totals): string[] => [
    name,
    count(totals.responses),
    formatTokens(promptOf(totals), 'decimal'),
    percent(totals),
  ];
  const byGap = GAP_BUCKETS.map((bucket) => ({
    name: GAPS[bucket],
    totals: sum(here.filter((item) => item.gap === bucket)),
  })).filter(({ totals }) => totals.responses > 0);
  return [
    gap,
    heading('Over time'),
    periodFacts(period),
    facts({
      label: 'Reuse',
      value: percent(total),
      note: `${formatTokens(total.read, 'decimal')} read of ${formatTokens(promptOf(total), 'decimal')} prompt tokens`,
    }),
    gap,
    heading('By idle time'),
    table(
      ['Idle before', 'Responses', 'Prompt', 'Reuse'],
      byGap.map(({ name, totals }) => row(name, totals)),
      [1, 2, 3],
    ),
    bullets({
      text: 'Most low readings are a pause, not a broken cache: the longer Pi sat idle, the less of the prompt is still cached.',
    }),
    gap,
    heading(`By project, ${NAMES[period]}`),
    table(
      ['Project', 'Responses', 'Prompt', 'Reuse'],
      grouped(here, projectName(history), promptOf).map(({ name, totals }) => row(name, totals)),
      [1, 2, 3],
    ),
    gap,
    heading(`By model, ${NAMES[period]}`),
    table(
      ['Model', 'Responses', 'Prompt', 'Reuse'],
      grouped(here, (item) => `${item.provider}/${item.model}`, promptOf).map(({ name, totals }) =>
        row(name, totals),
      ),
      [1, 2, 3],
    ),
  ];
}
