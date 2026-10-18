import { gapBucket, addRow } from './rows.js';
import type { HistoryRow, ProjectInfo } from './rows.js';
import { parseContribution } from './entry.js';
import type { PriceSource } from '../price-source.js';

/** What is kept about one log file between scans. */
export interface FileState {
  /** Bytes of the file already read. */
  offset: number;
  /** When the previous assistant response in this file was written, for the idle gap. */
  prevEnd: number | null;
  rows: Map<string, HistoryRow>;
  skipped: number;
}
export const emptyState = (): FileState => ({
  offset: 0,
  prevEnd: null,
  rows: new Map(),
  skipped: 0,
});

const dayOf = (ms: number): string => {
  const date = new Date(ms);
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
};

/** Folds one log line into the file's state. Pure: no I/O, so the same lines always give the same rows. */
export function feedLine(
  state: FileState,
  line: string,
  context: { project: ProjectInfo; prices: PriceSource },
): void {
  const item = parseContribution(line, context.prices);
  if (item === undefined) return;
  if (item === 'invalid') {
    state.skipped += 1;
    return;
  }
  const gap =
    state.prevEnd === null || item.startMs === null
      ? null
      : Math.max(0, item.startMs - state.prevEnd);
  state.prevEnd = item.endMs;
  const { usage } = item;
  addRow(state.rows, {
    day: dayOf(item.endMs),
    project: context.project.key,
    provider: item.provider,
    model: item.model,
    api: item.api,
    gap: gapBucket(gap),
    responses: 1,
    input: usage.input,
    output: usage.output,
    read: usage.cacheRead,
    write: usage.cacheWrite,
    cost: item.cost ?? 0,
    unpriced:
      item.cost === null && usage.input + usage.output + usage.cacheRead + usage.cacheWrite > 0
        ? 1
        : 0,
  });
}
