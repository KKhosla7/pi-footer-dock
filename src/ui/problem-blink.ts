/**
 * Makes the problem marker blink (bright, then dim) until the user has opened the problems screen.
 * Our own timer, not the terminal's blink attribute, which many terminals ignore: 1 Hz, unref'd,
 * alive only while there is something to alert about, and stopped on dispose.
 */
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
