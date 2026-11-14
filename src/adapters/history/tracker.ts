import { homedir } from 'node:os';
import { NAMES } from '../../core/product.js';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { periodCostsOf } from '../../core/history/costs.js';
import type { PeriodCost } from '../../core/history/costs.js';
import type { Snapshot } from '../../core/model.js';
import { registryPrices } from '../registry-prices.js';
import { UsageScanner } from './scanner.js';
import type { History } from './scanner.js';

const FIRST_SCAN_DELAY_MS = 300;
const GROWTH_DELAY_MS = 1500;

export const rollupPath = (): string =>
  join(
    process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'),
    NAMES.cacheDir,
    'usage-v1',
    'rollup.json',
  );

function unsaved(snapshot: Snapshot): PeriodCost {
  const cost = snapshot.apiCostEstimate;
  return {
    cost: cost?.pricedAmount ?? 0,
    unpriced: cost?.unavailable ?? 0,
    responses: cost?.responses ?? 0,
  };
}

export class HistoryTracker {
  private scanner: UsageScanner | undefined;
  private history: History | undefined;
  private stopped = true;
  private failed = false;
  private abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly changed: () => void) {}

  start(ctx: ExtensionContext): void {
    this.stop();
    this.stopped = false;
    this.failed = false;
    this.abort = new AbortController();
    this.scanner = new UsageScanner({
      root: join(getAgentDir(), 'sessions'),
      cachePath: rollupPath(),
      prices: () => registryPrices(ctx.modelRegistry),
    });
    this.later(FIRST_SCAN_DELAY_MS, () => {
      this.run((scanner) => scanner.scan(this.abort.signal));
    });
  }
  sessionGrew(ctx: ExtensionContext): void {
    const file = ctx.sessionManager.getSessionFile();
    if (this.stopped || !file || !this.history || this.timer) return;
    this.later(GROWTH_DELAY_MS, () => {
      this.run((scanner) => scanner.refresh(file, this.abort.signal));
    });
  }
  fields(
    ctx: ExtensionContext,
    snapshot: Snapshot,
    now = new Date(),
  ): Pick<Snapshot, 'historyCosts' | 'history'> {
    if (this.stopped || this.failed || !this.history || this.history.files === 0) return {};
    const memory = ctx.sessionManager.getSessionFile() ? undefined : unsaved(snapshot);
    const { rows, projects } = this.history;
    return { historyCosts: periodCostsOf(rows, now, memory), history: { rows, projects } };
  }
  stop(): void {
    this.stopped = true;
    this.abort.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.scanner?.save().catch(() => undefined);
    this.scanner = undefined;
    this.history = undefined;
  }

  private later(delay: number, work: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      work();
    }, delay);
    this.timer.unref();
  }
  private run(read: (scanner: UsageScanner) => Promise<History>): void {
    const scanner = this.scanner;
    if (!scanner || this.stopped) return;
    read(scanner)
      .then((history) => {
        if (this.stopped) return;
        this.history = history;
        this.changed();
      })
      .catch(() => {
        this.failed = true;
        this.changed();
      });
  }
}
