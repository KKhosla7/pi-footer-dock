import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { Key, matchesKey, truncateToWidth } from '@earendil-works/pi-tui';
import type { Component, TUI, TuiMouseEvent } from '@earendil-works/pi-tui';
import { PickerState } from '../core/picker/state.js';
import type { Choice } from '../core/picker/state.js';
import { PRODUCT } from '../core/product.js';
import { claimScreen } from './info-screen.js';
import { startLive } from './live.js';
import type { Refresh } from './live.js';

/** A choice with the way it is drawn: `row` is styled by the feature, so each list keeps its own look. */
export interface PickerChoice extends Choice {
  row: (theme: Theme, width: number) => string;
  /** A line under the list while this choice is under the cursor. */
  detail?: string;
}
export interface PickerSpec {
  /** Shown after the product name, for example `Models`. */
  title: string;
  /** A function is asked on every draw; return the same array while nothing changed. */
  choices: readonly PickerChoice[] | (() => readonly PickerChoice[]);
  /** Work repeated while the picker is open (re-reading files); true when something changed. */
  refresh?: Refresh;
  /** Typing narrows the list. */
  searchable?: boolean;
  /** The id the cursor starts on. */
  start?: string;
  /** Lines pinned above and below the list. */
  header?: (theme: Theme, width: number) => string[];
  footer?: (theme: Theme, width: number) => string[];
  /** What Enter does, said in the hint line. */
  action?: string;
  emptyText?: string;
}

const CHROME_ROWS = 6;
const RESERVED_ROWS = CHROME_ROWS + 6;
const MAX_ROWS = 12;
const MIN_ROWS = 4;
const WHEEL_STEP = 3;

interface Line {
  text: string;
  /** Index into the filtered items when this line is a choice. */
  item?: number;
}

/** Frames a list like Pi's own selectors: rules, a title, search, rows with a cursor, a hint. */
class PickerView implements Component {
  private readonly state: PickerState<PickerChoice>;
  private offset = 0;
  /** Set by every draw; the live loop clears it and stops when nothing draws the view any more. */
  drawn = false;
  private shown: readonly PickerChoice[] | undefined;
  constructor(
    private readonly spec: PickerSpec,
    private readonly theme: Theme,
    private readonly rows: () => number,
    private readonly finish: (id: string | undefined) => void,
  ) {
    this.state = new PickerState(this.choicesNow(), spec.start);
  }

  private choicesNow(): readonly PickerChoice[] {
    const { choices } = this.spec;
    this.shown = typeof choices === 'function' ? choices() : choices;
    return this.shown;
  }
  /** Takes up new choices when the feature handed over a different list. */
  private syncChoices(): void {
    if (typeof this.spec.choices !== 'function') return;
    const previous = this.shown;
    const next = this.choicesNow();
    if (next !== previous) this.state.replace(next);
  }
  private lines(width: number): Line[] {
    const out: Line[] = [];
    let section: string | undefined;
    this.state.items.forEach((choice, item) => {
      if (choice.section !== undefined && choice.section !== section) {
        section = choice.section;
        // A blank row separates one section from the one above it; the heading is bold, like a title.
        if (out.length > 0) out.push({ text: '' });
        const note = choice.sectionNote ? `  ${this.theme.fg('dim', choice.sectionNote)}` : '';
        out.push({ text: ` ${this.theme.bold(this.theme.fg('accent', choice.section))}${note}` });
      }
      const mark = item === this.state.selected ? this.theme.fg('accent', '→ ') : '  ';
      out.push({ text: truncateToWidth(mark + choice.row(this.theme, width - 2), width), item });
    });
    return out;
  }
  private pinned(width: number): { top: string[]; bottom: string[] } {
    return {
      top: this.spec.header?.(this.theme, width) ?? [],
      bottom: this.spec.footer?.(this.theme, width) ?? [],
    };
  }
  private windowRows(extra: number): number {
    return Math.max(MIN_ROWS, Math.min(MAX_ROWS, this.rows() - RESERVED_ROWS - extra));
  }
  private searchLine(): string[] {
    if (!this.spec.searchable) return [];
    const query = this.state.query;
    const cursor = this.theme.fg('accent', '▏');
    return [` ${this.theme.fg('muted', 'Search')}  ${query}${cursor}`, ''];
  }

  render(width: number): string[] {
    this.drawn = true;
    this.syncChoices();
    const { top, bottom } = this.pinned(width);
    const search = this.searchLine();
    const rows = this.windowRows(top.length + bottom.length + search.length + 2);
    const all = this.lines(width);
    const at = all.findIndex((line) => line.item === this.state.selected);
    if (at >= 0) {
      if (at < this.offset) this.offset = at;
      if (at >= this.offset + rows) this.offset = at - rows + 1;
    }
    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, all.length - rows)));
    const shown = all.slice(this.offset, this.offset + rows).map((line) => line.text);
    const size = this.state.items.length;
    const empty =
      size === 0 ? [` ${this.theme.fg('muted', this.spec.emptyText ?? 'No matches')}`] : [];
    const position =
      size > 0 ? this.theme.fg('muted', `  (${this.state.selected + 1}/${size})`) : '';
    const detail = this.state.current?.detail;
    const rule = this.theme.fg('border', '─'.repeat(Math.max(1, width)));
    const hint = `  ↑/↓ move · ${this.spec.action ?? 'Enter choose'} · Esc to close`;
    return [
      rule,
      this.theme.bold(
        this.theme.fg('accent', truncateToWidth(` ${PRODUCT} › ${this.spec.title}`, width)),
      ),
      '',
      ...top.map((line) => truncateToWidth(line, width)),
      ...search.map((line) => truncateToWidth(line, width)),
      ...shown,
      ...empty,
      ...(detail ? ['', ` ${this.theme.fg('muted', truncateToWidth(detail, width - 2))}`] : []),
      ...bottom.map((line) => truncateToWidth(line, width)),
      '',
      truncateToWidth(this.theme.fg('dim', hint) + position, width),
      rule,
    ];
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, 'ctrl+c')) this.finish(undefined);
    else if (matchesKey(data, Key.enter)) this.finish(this.state.current?.id);
    else if (matchesKey(data, Key.up)) this.state.move(-1);
    else if (matchesKey(data, Key.down)) this.state.move(1);
    else if (matchesKey(data, Key.pageUp)) this.state.jump(-this.windowRows(0));
    else if (matchesKey(data, Key.pageDown)) this.state.jump(this.windowRows(0));
    else if (matchesKey(data, Key.home)) this.state.home();
    else if (matchesKey(data, Key.end)) this.state.end();
    else this.text(data);
  }
  /** Printable input edits the search; with no search box a few letters work like in a pager. */
  private text(data: string): void {
    if (!this.spec.searchable) {
      if (data === 'q') this.finish(undefined);
      else if (data === 'k') this.state.move(-1);
      else if (data === 'j') this.state.move(1);
      return;
    }
    if (data === '\u007f' || data === '\b') this.state.backspace();
    else if (!data.startsWith('\u001b') && !/\p{Cc}/u.test(data)) this.state.type(data);
  }
  handleMouse(event: TuiMouseEvent): { handled: boolean } | undefined {
    if (event.type !== 'wheel' || !event.wheelDelta) return undefined;
    this.state.jump(event.wheelDelta < 0 ? -WHEEL_STEP : WHEEL_STEP);
    return { handled: true };
  }
  invalidate(): void {
    /* Drawn from the state on every render. */
  }
}

/** Opens the picker in place of the text area; resolves with the chosen id, or nothing on Esc. */
export async function openPicker(
  ctx: ExtensionContext,
  spec: PickerSpec,
): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>((tui: TUI, theme, _keys, done) => {
    let release = (): void => undefined;
    let stop = (): void => undefined;
    const finish = (id: string | undefined): void => {
      release();
      stop();
      done(id);
    };
    release = claimScreen(() => {
      finish(undefined);
    });
    const view = new PickerView(spec, theme, () => tui.terminal.rows, finish);
    if (spec.refresh) stop = startLive(tui, view, spec.refresh);
    return view;
  });
}
