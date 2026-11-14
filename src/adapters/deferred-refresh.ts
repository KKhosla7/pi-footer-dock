import { clearImmediate, setImmediate } from 'node:timers';

export class DeferredRefresh {
  private handle: NodeJS.Immediate | undefined;
  private latest: (() => void) | undefined;

  schedule(refresh: () => void): void {
    this.latest = refresh;
    if (this.handle) return;
    this.handle = setImmediate(() => {
      this.handle = undefined;
      const callback = this.latest;
      this.latest = undefined;
      try {
        callback?.();
      } catch {}
    });
  }

  cancel(): void {
    if (this.handle) clearImmediate(this.handle);
    this.handle = undefined;
    this.latest = undefined;
  }
}
