import type { Terminal } from '@earendil-works/pi-tui';

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
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
  setProgramStatus(): void {}
}
