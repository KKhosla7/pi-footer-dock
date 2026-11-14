export class ProblemBlink {
  bright = true;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly redraw: () => void) {}

  update(active: boolean): void {
    if (!active) {
      this.stop();
      return;
    }
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.bright = !this.bright;
      this.redraw();
    }, 500);
    this.timer.unref();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.bright = true;
  }
}
