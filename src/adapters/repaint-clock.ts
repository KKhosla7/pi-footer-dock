/** Redraws on a slow timer so relative times (resets, ages) keep moving while nothing else happens. */
export class RepaintClock {
  private timer: ReturnType<typeof setInterval> | undefined;

  start(repaint: () => void, intervalMs = 60_000): void {
    this.stop();
    this.timer = setInterval(repaint, intervalMs);
    this.timer.unref();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
