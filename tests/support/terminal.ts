import type { Terminal } from '@earendil-works/pi-tui';

/** Test-only terminal sink: render the real TUI without manipulating stdin/stdout. */
export class MemoryTerminal implements Terminal {
  columns = 140;
  rows = 60;
  kittyProtocolActive = false;
  output = '';
  private onInput: ((data: string) => void) | undefined;
  private onResize: (() => void) | undefined;
  start(onInput?: (data: string) => void, onResize?: () => void): void {
    this.onInput = onInput;
    this.onResize = onResize;
  }
  send(data: string): void {
    this.onInput?.(data);
  }
  resize(columns: number, rows: number): void {
    this.columns = columns;
    this.rows = rows;
    this.onResize?.();
  }
  stop(): void {
    this.onInput = undefined;
    this.onResize = undefined;
  }
  drainInput(): Promise<void> {
    return Promise.resolve();
  }
  write(data: string): void {
    this.output += data;
  }
  moveBy(): void {
    /* Renderer coordinates are not needed by the sink. */
  }
  hideCursor(): void {
    /* No physical cursor. */
  }
  showCursor(): void {
    /* No physical cursor. */
  }
  clearLine(): void {
    /* Captured component renders are asserted directly. */
  }
  clearFromCursor(): void {
    /* Captured component renders are asserted directly. */
  }
  clearScreen(): void {
    /* Captured component renders are asserted directly. */
  }
  setTitle(): void {
    /* No window. */
  }
  setProgress(): void {
    /* No window. */
  }
  setProgramStatus(): void {
    /* No shell integration. */
  }
}
