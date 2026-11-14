import type { TUI } from '@earendil-works/pi-tui';
import type { Background } from './palette.js';

type Asker = Partial<Pick<TUI, 'queryTerminalColors' | 'onTerminalColorSchemeChange'>>;

const byte = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;

export class TerminalBackground {
  private known: Background | undefined;
  private asked = false;

  get value(): Background | undefined {
    return this.known;
  }

  watch(source: Asker, redraw: () => void): () => void {
    const ask = (): void => {
      if (typeof source.queryTerminalColors !== 'function') return;
      const learn = (colors: { background?: Partial<Background> | undefined }): void => {
        this.learn(colors.background, redraw);
      };
      source
        .queryTerminalColors({ timeoutMs: 250, onLateReply: learn })
        .then(learn, () => undefined);
    };
    if (!this.asked) {
      this.asked = true;
      ask();
    }
    const stop =
      typeof source.onTerminalColorSchemeChange === 'function'
        ? source.onTerminalColorSchemeChange(ask)
        : undefined;
    return () => {
      stop?.();
    };
  }

  private learn(colour: Partial<Background> | undefined, redraw: () => void): void {
    if (!colour || !byte(colour.r) || !byte(colour.g) || !byte(colour.b)) return;
    const { r, g, b } = this.known ?? {};
    if (r === colour.r && g === colour.g && b === colour.b) return;
    this.known = { r: colour.r, g: colour.g, b: colour.b };
    redraw();
  }
}
