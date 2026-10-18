import type { Period } from './period.js';

export interface PeriodCost {
  cost: number;
  unpriced: number;
  responses: number;
}
/** Totals for each period, known once the first scan of the history has finished. */
export type HistoryCosts = Record<Period, PeriodCost>;
