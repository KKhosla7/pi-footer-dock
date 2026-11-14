import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { noop } from '../core/noop.js';
import { PRODUCT } from '../core/product.js';
import { startLive } from './live.js';
import type { Refresh } from './live.js';
import { Key, matchesKey, truncateToWidth } from '@earendil-works/pi-tui';
import type { Component, TUI, TuiMouseEvent } from '@earendil-works/pi-tui';

export interface InfoScreen {
  title: string;
  lines: (theme: Theme, width: number) => string[];
  header?: (theme: Theme, width: number) => string[];
  footer?: (theme: Theme, width: number) => string[];
  live?: boolean;
  refresh?: Refresh;
  keys?: Readonly<Record<string, () => void>>;
  hint?: string;
}

const CHROME_ROWS = 6;
const RESERVED_ROWS = CHROME_ROWS + 6;
const MAX_ROWS = 12;
const MIN_ROWS = 4;
const WHEEL_STEP = 3;

class InfoView implements Component {
  private offset = 0;
  private lastWidth = 80;
  drawn = false;
  constructor(
    private readonly screen: InfoScreen,
    private readonly theme: Theme,
    private readonly rows: () => number,
    private readonly close: () => void,
  ) {}

  private pinned(width: number): { top: string[]; bottom: string[] } {
    return {
      top: this.screen.header?.(this.theme, width) ?? [],
      bottom: this.screen.footer?.(this.theme, width) ?? [],
    };
  }
  private visibleRows(pinned = 0): number {
    return Math.max(MIN_ROWS, Math.min(MAX_ROWS, this.rows() - RESERVED_ROWS - pinned));
  }
  private body(width: number): string[] {
    return this.screen.lines(this.theme, width);
  }
  private windowRows(): number {
    const { top, bottom } = this.pinned(this.lastWidth);
    return this.visibleRows(top.length + bottom.length);
  }
  private scroll(by: number, total: number, rows = this.windowRows()): void {
    this.offset = Math.max(0, Math.min(Math.max(0, total - rows), this.offset + by));
  }

  private bar(rows: number, shown: number, total: number): string[] {
    if (total <= rows) return Array.from({ length: shown }, () => '');
    const thumb = Math.max(1, Math.round((rows * rows) / total));
    const start = Math.round((this.offset / (total - rows)) * (rows - thumb));
    return Array.from({ length: shown }, (_, row) =>
      row >= start && row < start + thumb
        ? this.theme.fg('accent', '┃')
        : this.theme.fg('dim', '│'),
    );
  }

  render(width: number): string[] {
    this.lastWidth = width;
    this.drawn = true;
    const all = this.body(width);
    const { top, bottom } = this.pinned(width);
    const rows = this.visibleRows(top.length + bottom.length);
    this.scroll(0, all.length, rows);
    const scrolls = all.length > rows;
    const room = scrolls ? width - 1 : width;
    const visible = all.slice(this.offset, this.offset + rows);
    const bar = this.bar(rows, visible.length, all.length);
    const shown = visible.map((line, row) => {
      const cut = truncateToWidth(line, room, '', scrolls);
      return scrolls ? cut + (bar[row] ?? '') : cut;
    });
    const rule = this.theme.fg('border', '─'.repeat(Math.max(1, width)));
    const position = scrolls
      ? `  (${this.offset + 1}-${this.offset + shown.length}/${all.length})`
      : '';
    return [
      rule,
      this.theme.bold(
        this.theme.fg('accent', truncateToWidth(` ${PRODUCT} › ${this.screen.title}`, width)),
      ),
      '',
      ...top.map((line) => truncateToWidth(line, width)),
      ...shown,
      ...bottom.map((line) => truncateToWidth(line, width)),
      '',
      this.theme.fg(
        'dim',
        truncateToWidth(
          `  ↑/↓ scroll · ${this.screen.hint ? `${this.screen.hint} · ` : ''}Esc to close${position}`,
          width,
        ),
      ),
      rule,
    ];
  }
  handleInput(data: string): void {
    const action = this.screen.keys?.[data];
    if (action) action();
    else if (matchesKey(data, Key.escape) || matchesKey(data, 'ctrl+c') || data === 'q')
      this.close();
    else this.scrollKey(data);
  }
  private scrollKey(data: string): void {
    const total = this.body(this.lastWidth).length;
    const page = this.windowRows();
    if (matchesKey(data, Key.up) || data === 'k') this.scroll(-1, total);
    else if (matchesKey(data, Key.down) || data === 'j') this.scroll(1, total);
    else if (matchesKey(data, Key.pageUp)) this.scroll(-page, total);
    else if (matchesKey(data, Key.pageDown)) this.scroll(page, total);
    else if (matchesKey(data, Key.home)) this.scroll(-total, total);
    else if (matchesKey(data, Key.end)) this.scroll(total, total);
  }
  handleMouse(event: TuiMouseEvent): { handled: boolean } | undefined {
    if (event.type !== 'wheel' || !event.wheelDelta) return undefined;
    this.scroll(event.wheelDelta < 0 ? -WHEEL_STEP : WHEEL_STEP, this.body(event.width).length);
    return { handled: true };
  }
  readonly invalidate = noop;
}

export function claimScreen(close: () => void): () => void {
  closeOpen = close;
  return () => {
    if (closeOpen === close) closeOpen = undefined;
  };
}

let closeOpen: (() => void) | undefined;
let closedFromOutside = 0;
export const outsideCloses = (): number => closedFromOutside;
export function closeInfoScreen(): void {
  if (closeOpen) closedFromOutside += 1;
  closeOpen?.();
}

export async function openInfoScreen(ctx: ExtensionContext, screen: InfoScreen): Promise<void> {
  await ctx.ui.custom<boolean>((tui: TUI, theme, _keys, done) => {
    let stop = (): void => undefined;
    const close = (): void => {
      if (closeOpen === close) closeOpen = undefined;
      stop();
      done(true);
    };
    closeOpen = close;
    const view = new InfoView(screen, theme, () => tui.terminal.rows, close);
    if (screen.live === true || screen.refresh) stop = startLive(tui, view, screen.refresh);
    return view;
  });
}
