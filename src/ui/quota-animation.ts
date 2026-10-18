import type { Snapshot } from '../core/model.js';

/** One finite highlight sweep on real remaining-value changes; no synthetic usage. */
export class QuotaAnimation {
  frame = -1;
  private identity = '';
  private values = '';
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly redraw: () => void) {}

  update(snapshot: Snapshot, enabled: boolean): void {
    const limits = snapshot.rateLimits;
    const identity = JSON.stringify([
      snapshot.provider,
      snapshot.model,
      limits?.windows.map((window) => [window.label, window.resetAt]),
    ]);
    const values = JSON.stringify(limits?.windows.map((window) => window.remainingPercent));
    const changed = identity === this.identity && values !== this.values;
    if (identity !== this.identity || !enabled || !limits || snapshot.quotaStatus === 'quota stale')
      this.stop();
    this.identity = identity;
    this.values = values;
    if (!enabled || !changed || !limits || snapshot.quotaStatus === 'quota stale') return;
    this.stop();
    this.frame = 0;
    this.timer = setInterval(() => {
      this.frame += 1;
      if (this.frame >= 7) this.stop();
      this.redraw();
    }, 70);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.frame = -1;
  }
}
