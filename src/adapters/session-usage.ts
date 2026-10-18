import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { readSnapshot } from './snapshot.js';
import type { Snapshot, GitState } from '../core/model.js';
import type { RateLimits } from '../core/rate-limits.js';
import { NO_PRICES } from '../core/price-source.js';
import type { PriceSource } from '../core/price-source.js';
import { registryPrices } from './registry-prices.js';
import { UsageLedger } from '../core/usage-ledger.js';
import type { SessionUsage } from '../core/usage-ledger.js';
type Manager = ExtensionContext['sessionManager'];
/** Pi's public session entries are append-only. History events/manual refresh force verification. */
export class SessionSnapshotReader {
  private ledger = new UsageLedger();
  private session: string | undefined;
  private leaf: string | null = null;
  private dirty = true;
  invalidate(): void {
    this.dirty = true;
  }
  reset(): void {
    this.session = undefined;
    this.leaf = null;
    this.dirty = true;
    this.ledger = new UsageLedger();
  }
  /** `prices` is used when the ledger is rebuilt; appends keep the source it was built with. */
  read(manager: Manager, prices: PriceSource = NO_PRICES): SessionUsage {
    const session = manager.getSessionId();
    const leaf = manager.getLeafId();
    if (this.dirty || session !== this.session) this.rebuild(manager, prices);
    else if (leaf !== this.leaf && !this.append(manager, leaf)) this.rebuild(manager, prices);
    this.session = session;
    this.leaf = leaf;
    this.dirty = false;
    return this.ledger.snapshot();
  }
  capture(
    ctx: ExtensionContext,
    pi: Pick<ExtensionAPI, 'getSettings'>,
    git: GitState,
    limits: RateLimits | null,
  ): Snapshot {
    const usage = this.read(ctx.sessionManager, registryPrices(ctx.modelRegistry));
    return readSnapshot(ctx, pi, git, { limits, usage });
  }
  private rebuild(manager: Manager, prices: PriceSource): void {
    this.ledger = new UsageLedger(prices);
    this.ledger.append(manager.getEntries());
  }
  private append(manager: Manager, leaf: string | null): boolean {
    const pending: ReturnType<Manager['getEntries']> = [];
    const visited = new Set<string>();
    let cursor = leaf;
    while (cursor !== this.leaf) {
      if (cursor === null || visited.has(cursor) || pending.length >= 1024) return false;
      visited.add(cursor);
      const entry = manager.getEntry(cursor);
      if (!entry) return false;
      pending.push(entry);
      cursor = entry.parentId;
    }
    this.ledger.append(pending.reverse());
    return true;
  }
}
