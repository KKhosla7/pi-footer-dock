import type { Period } from './period.js';

export interface PeriodCost {
  cost: number;
  unpriced: number;
  responses: number;
}
export type HistoryCosts = Record<Period, PeriodCost>;
