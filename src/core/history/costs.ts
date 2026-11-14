import { costAmount, hasCost } from '../api-cost.js';
import { formatApiCost } from '../model.js';
import type { Snapshot } from '../model.js';
import { inPeriod, sum } from './queries.js';
import type { HistoryCosts, PeriodCost } from './cost-types.js';
import type { Period } from './period.js';

export type { HistoryCosts, PeriodCost };
import type { HistoryRow } from './rows.js';

export type CostPeriod = Period | 'session';
export const COST_PERIODS: readonly CostPeriod[] = ['day', 'week', 'month', 'session'];
export const DEFAULT_COST_PERIOD: CostPeriod = 'month';

const SUFFIX: Record<Period, string> = { day: 'day', week: 'wk', month: 'mo' };
const none = (): PeriodCost => ({ cost: 0, unpriced: 0, responses: 0 });

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

export function periodCostLabel(period: Period, cost: PeriodCost): string {
  if (cost.responses === 0) return '';
  if (cost.unpriced > 0 && cost.cost < 0.01) return '';
  return `${costAmount(cost.cost)}${cost.unpriced > 0 ? '+' : ''} ${SUFFIX[period]}`;
}

export function costDisplay(snapshot: Snapshot, period: CostPeriod = DEFAULT_COST_PERIOD): string {
  const history = snapshot.historyCosts;
  if (period !== 'session' && history) return periodCostLabel(period, history[period]);
  return hasCost(snapshot.apiCostEstimate) ? formatApiCost(snapshot.apiCostEstimate) : '';
}
