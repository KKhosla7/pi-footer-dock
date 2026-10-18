import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { PRODUCT } from '../core/product.js';
import { startLive } from './live.js';
import type { Refresh } from './live.js';
import { Key, matchesKey, truncateToWidth } from '@earendil-works/pi-tui';
import type { Component, TUI, TuiMouseEvent } from '@earendil-works/pi-tui';

/** A read-only screen: a title and lines the feature builds from Pi's theme. */
export interface InfoScreen {
  /** Shown after "Footer", for example `Branches`. */
  title: string;
  /** The body, already styled; called on every render so it can adapt to the width. */
  lines: (theme: Theme, width: number) => string[];
  /** Lines that stay above the scrolling body (a summary). */
  header?: (theme: Theme, width: number) => string[];
  /** Lines that stay below it (a legend), so they are never scrolled out of sight. */
  footer?: (theme: Theme, width: number) => string[];
  /** Repaint once a second while open, for a body that depends on time or on data that changes. */
  live?: boolean;
  /** Work repeated while the screen is open, for a body that depends on files that can change. */
  refresh?: Refresh;
  /** Keys that do something in this screen (a period switch), by the key as typed. */
  keys?: Readonly<Record<string, () => void>>;
  /** Said in the hint line for those keys, for example `d/w/m period`. */
  hint?: string;
}

/** Rows the screen draws besides the list: two rules, the title, a blank, a blank and the hint. */
const CHROME_ROWS = 6;
/** Rows that stay on screen under the screen (the footer) plus room for Pi's own lines above. */
const RESERVED_ROWS = CHROME_ROWS + 6;
/** Like Pi's own lists: a fixed window of this many rows, scrolled, never most of the terminal. */
const MAX_ROWS = 12;
const MIN_ROWS = 4;
const WHEEL_STEP = 3;

/** Frames and scrolls the lines like Pi's own menus; Esc, q or Ctrl+C closes it. */
class InfoView implements Component {
  private offset = 0;
  private lastWidth = 80;
  /** Set by every render; the live timer clears it, and stops itself if nothing sets it again. */
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
  /** The scrolling window: fixed, and smaller on a short terminal by what is pinned around it. */
  private visibleRows(pinned = 0): number {
    return Math.max(MIN_ROWS, Math.min(MAX_ROWS, this.rows() - RESERVED_ROWS - pinned));
  }
  private body(width: number): string[] {
    return this.screen.lines(this.theme, width);
  }
  /** Rows of the scrolling window at the width last drawn. */
  private windowRows(): number {
    const { top, bottom } = this.pinned(this.lastWidth);
    return this.visibleRows(top.length + bottom.length);
  }
  private scroll(by: number, total: number, rows = this.windowRows()): void {
    this.offset = Math.max(0, Math.min(Math.max(0, total - rows), this.offset + by));
  }

  /** The last column of each body row: a track with a thumb, only when the body scrolls. */
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
  invalidate(): void {
    /* No cached state: the body is rebuilt on every render. */
  }
}

/** The screen open now registers how to close it, so the same icon click closes any kind of screen. */
export function claimScreen(close: () => void): () => void {
  closeOpen = close;
  return () => {
    if (closeOpen === close) closeOpen = undefined;
  };
}

/** Closes the screen that is open, if any (a click on the icon that opened it, for example). */
let closeOpen: (() => void) | undefined;
/** How many times a screen was closed from outside (a click on its icon): a flow that opened one can tell Esc from that. */
let closedFromOutside = 0;
export const outsideCloses = (): number => closedFromOutside;
export function closeInfoScreen(): void {
  if (closeOpen) closedFromOutside += 1;
  closeOpen?.();
}

/** Opens the screen in place of the text area, as Pi's own menus do, and resolves when closed. */
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
