import { costAmount, hasCost } from '../api-cost.js';
import { formatApiCost } from '../model.js';
import type { Snapshot } from '../model.js';
import { inPeriod, sum } from './queries.js';
import type { HistoryCosts, PeriodCost } from './cost-types.js';
import type { Period } from './period.js';

export type { HistoryCosts, PeriodCost };
import type { HistoryRow } from './rows.js';

/** What the footer cost can cover: a calendar day, week or month across sessions, or this session. */
export type CostPeriod = Period | 'session';
export const COST_PERIODS: readonly CostPeriod[] = ['day', 'week', 'month', 'session'];
export const DEFAULT_COST_PERIOD: CostPeriod = 'month';

const SUFFIX: Record<Period, string> = { day: 'day', week: 'wk', month: 'mo' };
const none = (): PeriodCost => ({ cost: 0, unpriced: 0, responses: 0 });

/** Totals per period at `now`; `memory` is a session that has no log file (so it is not in the rows). */
export function periodCostsOf(
  rows: readonly HistoryRow[],
  now: Date,
  memory: PeriodCost = none(),
): HistoryCosts {
  const total = (period: Period): PeriodCost => {
    const part = sum(inPeriod(rows, period, now));
    return {
      cost: part.cost + memory.cost,
      unpriced: part.unpriced + memory.unpriced,
      responses: part.responses + memory.responses,
    };
  };
  return { day: total('day'), week: total('week'), month: total('month') };
}

/**
 * `≈$62.26 mo`. A total with unpriced responses is a lower bound and gets the `+`; one that is
 * only unpriced responses, or under a cent with some, says nothing and draws nothing.
 */
export function periodCostLabel(period: Period, cost: PeriodCost): string {
  if (cost.responses === 0) return '';
  if (cost.unpriced > 0 && cost.cost < 0.01) return '';
  return `${costAmount(cost.cost)}${cost.unpriced > 0 ? '+' : ''} ${SUFFIX[period]}`;
}

/**
 * The footer's cost text: the chosen period once the history is known, else this session's cost
 * (until the first scan finishes, and when the history cannot be read). The period suffix tells
 * which one is shown.
 */
export function costDisplay(snapshot: Snapshot, period: CostPeriod = DEFAULT_COST_PERIOD): string {
  const history = snapshot.historyCosts;
  if (period !== 'session' && history) return periodCostLabel(period, history[period]);
  return hasCost(snapshot.apiCostEstimate) ? formatApiCost(snapshot.apiCostEstimate) : '';
}
