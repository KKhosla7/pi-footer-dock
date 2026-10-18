import { SettingsList } from '@earendil-works/pi-tui';
import type {
  Component,
  SettingItem,
  SettingsListTheme,
  TuiMouseEvent,
} from '@earendil-works/pi-tui';

const FOOTER_LINES = 2;
const noop = (): void => undefined;

/** The theme with the hint's "Esc to cancel" reworded for where the list sits (go back, close). */
export function withEscape(theme: SettingsListTheme, wording: string): SettingsListTheme {
  return {
    ...theme,
    hint: (text) => theme.hint(text.replace('Esc to cancel', `Esc to ${wording}`)),
  };
}

/** The tallest this set of lists ever renders, over every row being selected in turn. */
export function tallest(
  lists: SettingItem[][],
  width: number,
  options: { theme: SettingsListTheme; visible: number },
): number {
  let height = 0;
  for (const items of lists) {
    const probe = new SettingsList(items, options.visible, options.theme, noop, noop);
    for (const item of items) {
      probe.selectItem(item.id);
      height = Math.max(height, probe.render(width).length);
    }
  }
  return height;
}

/**
 * Keeps a list the same height whichever row is selected, so nothing above or below it moves on
 * arrow keys. The padding goes before the list's own blank line and hint, so the hint stays put too.
 */
export class StableList implements Component {
  constructor(
    private readonly list: SettingsList,
    private readonly height: (width: number) => number,
    /** Lines drawn above the list (a title); they are not part of the padded height. */
    private readonly header: (width: number) => string[] = () => [],
    /** Lines drawn below the list (a closing rule). */
    private readonly footer: (width: number) => string[] = () => [],
  ) {}

  render(width: number): string[] {
    return [...this.header(width), ...this.body(width), ...this.footer(width)];
  }
  private body(width: number): string[] {
    const lines = this.list.render(width);
    const missing = this.height(width) - lines.length;
    if (missing <= 0) return lines;
    return [
      ...lines.slice(0, -FOOTER_LINES),
      ...Array<string>(missing).fill(''),
      ...lines.slice(-FOOTER_LINES),
    ];
  }
  handleInput(data: string): void {
    this.list.handleInput(data);
  }
  handleMouse(event: TuiMouseEvent) {
    // Rows are drawn below the header, so a click's row is counted from the first line under it.
    return this.list.handleMouse({ ...event, y: event.y - this.header(event.width).length });
  }
  invalidate(): void {
    this.list.invalidate();
  }
}
