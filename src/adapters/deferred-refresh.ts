import { clearImmediate, setImmediate } from 'node:timers';

/**
 * Pi emits message_end before persisting it. Refresh after that dispatch completes.
 * Nothing the callback throws may leave the timer: an uncaught exception there would take Pi down.
 * Callers report their own failures; this guard is the backstop for the report failing too.
 */
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
      } catch {
        /* The caller's own report failed (a stale context, for one); nothing is left to do. */
      }
    });
  }

  cancel(): void {
    if (this.handle) clearImmediate(this.handle);
    this.handle = undefined;
    this.latest = undefined;
  }
}
