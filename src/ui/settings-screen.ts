import { getSettingsListTheme } from '@earendil-works/pi-coding-agent';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { SettingsList } from '@earendil-works/pi-tui';
import type { Component, SettingItem } from '@earendil-works/pi-tui';
import { isExtensionRow } from '../core/ext/menu.js';
import { PRODUCT } from '../core/product.js';
import { findEntry, menuEntries } from '../core/settings-groups.js';
import type { MenuEntry } from '../core/settings-groups.js';
import { choose } from '../core/settings-menu.js';
import type { MenuRow } from '../core/settings-menu.js';
import type { Settings } from '../core/settings.js';
import { StableList, tallest, withEscape } from './stable-list.js';

const VISIBLE_ROWS = 14;
const TITLE = `${PRODUCT} settings`;
interface Page {
  escape: string;
  /** The groups above this list: its breadcrumb, and its depth. */
  crumbs: string[];
  onCancel: () => void;
}
type Lines = (width: number) => string[];
export interface SettingsModel {
  current: () => Settings;
  /** Quota window labels the provider publishes right now. */
  windows: () => readonly string[];
  change: (next: Settings) => void;
  /** Settings groups other extensions registered, and what happens when a value in one is picked. */
  extensions?: { entries: () => MenuEntry[]; pick: (id: string, value: string) => void };
}

/** Applies a pick; a group closing reports its summary through here too, which changes nothing. */
function apply(model: SettingsModel, id: string, value: string): void {
  if (isExtensionRow(id)) {
    model.extensions?.pick(id, value);
    return;
  }
  const next = choose(model.current(), id, value, model.windows());
  if (next !== model.current()) model.change(next);
}

const item = (row: MenuRow, extra: Partial<SettingItem> = {}): SettingItem => ({
  id: row.id,
  label: row.label,
  description: row.description,
  currentValue: row.current,
  ...(row.values.length > 0 ? { values: row.values } : {}),
  ...extra,
});

/** One open menu. Each list keeps its own height, the tallest it ever has, so nothing moves on arrow keys. */
class Menu {
  private readonly theme = getSettingsListTheme();
  /** The groups open right now, outermost first; a list covered by an open group draws nothing. */
  private readonly open: string[] = [];
  constructor(
    private readonly model: SettingsModel,
    private readonly pi: Theme,
  ) {}

  private entries(): MenuEntry[] {
    return [
      ...menuEntries(this.model.current(), this.model.windows()),
      ...(this.model.extensions?.entries() ?? []),
    ];
  }
  /** Pi's own rule and title styles, taken from the theme Pi hands to the screen. */
  private rule = (width: number): string => this.pi.fg('border', '─'.repeat(Math.max(1, width)));
  /** Framed like Pi's own menus, between two rules; inside a group the title is a breadcrumb. */
  private frame(page: Page): { header: Lines; footer: Lines } {
    const covered = (): boolean => this.open.length > page.crumbs.length;
    const title = [TITLE, ...page.crumbs].join(' › ');
    return {
      header: (width) =>
        covered() ? [] : [this.rule(width), this.pi.bold(this.pi.fg('accent', ` ${title}`))],
      footer: (width) => (covered() ? [] : [this.rule(width)]),
    };
  }
  private list(items: SettingItem[], page: Page): Component {
    const list = new SettingsList(
      items,
      VISIBLE_ROWS,
      withEscape(this.theme, page.escape),
      (id, value) => {
        apply(this.model, id, value);
      },
      page.onCancel,
    );
    const options = { theme: this.theme, visible: VISIBLE_ROWS };
    const height = (width: number): number =>
      this.open.length > page.crumbs.length ? 0 : tallest([items], width, options);
    const { header, footer } = this.frame(page);
    return new StableList(list, height, header, footer);
  }
  /** A row, which opens a list of its own when it is a group. */
  private entryItem(entry: MenuEntry, crumbs: string[]): SettingItem {
    return item(
      entry,
      entry.children ? { submenu: (_c, done) => this.group(entry, crumbs, done) } : {},
    );
  }
  private group(entry: MenuEntry, crumbs: string[], done: (summary?: string) => void): Component {
    this.open.push(entry.id);
    const inside = [...crumbs, entry.label];
    const rows = (): MenuEntry[] => findEntry(this.entries(), entry.id)?.children ?? [];
    return this.list(
      rows().map((row) => this.entryItem(row, inside)),
      {
        escape: 'go back',
        crumbs: inside,
        onCancel: () => {
          this.open.pop();
          done(findEntry(this.entries(), entry.id)?.current);
        },
      },
    );
  }
  top(close: () => void): Component {
    const items = this.entries().map((entry) => this.entryItem(entry, []));
    return this.list(items, { escape: 'close', crumbs: [], onCancel: close });
  }
}

/** Pi's own settings list over the pure menu model; every change is applied as it is made. */
export async function openSettingsScreen(
  ctx: ExtensionContext,
  model: SettingsModel,
): Promise<void> {
  await ctx.ui.custom<boolean>((_tui, theme, _keys, done) =>
    new Menu(model, theme).top(() => {
      done(true);
    }),
  );
}
