import { getSettingsListTheme } from '@earendil-works/pi-coding-agent';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { SettingsList } from '@earendil-works/pi-tui';
import type { Component, SettingItem } from '@earendil-works/pi-tui';
import { isExtensionRow } from '../core/ext/menu.js';
import { colorTone, offered } from '../core/settings-colors.js';
import type { ColorTone } from '../core/colors.js';
import { keyFor, wordFor } from '../core/settings-labels.js';
import { PRODUCT } from '../core/product.js';
import { findEntry, menuEntries } from '../core/settings-groups.js';
import type { MenuEntry } from '../core/settings-groups.js';
import { choose } from '../core/settings-menu.js';
import type { MenuRow } from '../core/settings-menu.js';
import type { Settings } from '../core/settings.js';
import { ColourPicker } from './colour-picker.js';
import { createPaint } from './palette.js';
import type { Background } from './palette.js';
import { StableList, tallest, withEscape } from './stable-list.js';

const VISIBLE_ROWS = 14;
const TITLE = `${PRODUCT} settings`;
interface PickerSpec {
  entry: MenuEntry;
  tone: ColorTone;
  inside: string[];
  shown: (key: string) => string;
}
interface Page {
  escape: string;
  crumbs: string[];
  onCancel: () => void;
}
type Lines = (width: number) => string[];
export interface SettingsModel {
  current: () => Settings;
  windows: () => readonly string[];
  change: (next: Settings) => void;
  extensions?: { entries: () => MenuEntry[]; pick: (id: string, value: string) => void };
  icons?: () => 'nerd' | 'portable';
  colours?: { background: () => Background | undefined };
}

function apply(model: SettingsModel, id: string, value: string): void {
  if (isExtensionRow(id)) {
    model.extensions?.pick(id, value);
    return;
  }
  const next = choose(model.current(), id, keyFor(id, value), model.windows());
  if (next !== model.current()) model.change(next);
}

const item = (
  row: MenuRow,
  icons: 'nerd' | 'portable' | undefined,
  extra: Partial<SettingItem> = {},
): SettingItem => ({
  id: row.id,
  label: row.label,
  description: row.description,
  currentValue: wordFor(row.id, row.current, icons),
  ...(row.values.length > 0
    ? { values: row.values.map((key) => wordFor(row.id, key, icons)) }
    : {}),
  ...extra,
});

class Menu {
  private readonly theme = getSettingsListTheme();
  private readonly open: string[] = [];
  constructor(
    private readonly model: SettingsModel,
    private readonly pi: Theme,
  ) {}

  private entries(): MenuEntry[] {
    return [
      ...menuEntries(this.model.current(), this.model.windows(), this.model.icons?.()),
      ...(this.model.extensions?.entries() ?? []),
    ];
  }
  private rule = (width: number): string => this.pi.fg('border', '─'.repeat(Math.max(1, width)));
  private frame(page: Page): { header: Lines; footer: Lines } {
    const covered = (): boolean => this.open.length > page.crumbs.length;
    const title = [TITLE, ...page.crumbs].join(' › ');
    return {
      header: (width) =>
        covered() ? [] : [this.rule(width), this.pi.bold(this.pi.fg('accent', ` ${title}`))],
      footer: (width) => (covered() ? [] : [this.rule(width)]),
    };
  }
  private list(items: SettingItem[], page: Page, rebuild: () => SettingItem[]): Component {
    const list: SettingsList = new SettingsList(
      items,
      VISIBLE_ROWS,
      withEscape(this.theme, page.escape),
      (id, value) => {
        apply(this.model, id, value);
        items.splice(0, items.length, ...rebuild());
        list.selectItem(id);
      },
      page.onCancel,
    );
    const options = { theme: this.theme, visible: VISIBLE_ROWS };
    const height = (width: number): number =>
      this.open.length > page.crumbs.length ? 0 : tallest([items], width, options);
    const { header, footer } = this.frame(page);
    return new StableList(list, height, header, footer);
  }
  private swatch(tone: ColorTone, key: string): string {
    const colors = key === 'default' ? {} : { [tone]: key };
    const background = this.model.colours?.background ?? ((): undefined => undefined);
    return createPaint(this.pi, () => ({ colors, iconBold: false }), background)('██', tone);
  }
  private colourItem(entry: MenuEntry, tone: ColorTone, crumbs: string[]): SettingItem {
    const shown = (key: string): string => `${this.swatch(tone, key)} ${wordFor(entry.id, key)}`;
    return {
      ...item(entry, this.model.icons?.()),
      currentValue: shown(entry.current),
      submenu: (_current, done) =>
        this.picker({ entry, tone, inside: [...crumbs, entry.label], shown }, done),
    };
  }
  private picker(
    { entry, tone, inside, shown }: PickerSpec,
    done: (summary?: string) => void,
  ): Component {
    this.open.push(entry.id);
    const leave = (key?: string): void => {
      this.open.pop();
      done(key === undefined ? undefined : shown(key));
    };
    const { header, footer } = this.frame({ escape: 'go back', crumbs: inside, onCancel: leave });
    const current = findEntry(this.entries(), entry.id)?.current ?? entry.current;
    return new ColourPicker({
      id: entry.id,
      tone,
      choices: offered(tone, current),
      current,
      theme: this.theme,
      swatch: (key) => this.swatch(tone, key),
      background: this.model.colours?.background ?? ((): undefined => undefined),
      header,
      footer,
      choose: (key) => {
        apply(this.model, entry.id, key);
      },
      leave,
    });
  }
  private entryItem(entry: MenuEntry, crumbs: string[]): SettingItem {
    const tone = colorTone(entry.id);
    if (tone && this.model.colours) return this.colourItem(entry, tone, crumbs);
    return item(
      entry,
      this.model.icons?.(),
      entry.children ? { submenu: (_c, done) => this.group(entry, crumbs, done) } : {},
    );
  }
  private group(entry: MenuEntry, crumbs: string[], done: (summary?: string) => void): Component {
    this.open.push(entry.id);
    const inside = [...crumbs, entry.label];
    const rows = (): MenuEntry[] => findEntry(this.entries(), entry.id)?.children ?? [];
    const build = (): SettingItem[] => rows().map((row) => this.entryItem(row, inside));
    return this.list(
      build(),
      {
        escape: 'go back',
        crumbs: inside,
        onCancel: () => {
          this.open.pop();
          done(findEntry(this.entries(), entry.id)?.current);
        },
      },
      build,
    );
  }
  top(close: () => void): Component {
    const items = this.entries().map((entry) => this.entryItem(entry, []));
    return this.list(items, { escape: 'close', crumbs: [], onCancel: close }, () =>
      this.entries().map((entry) => this.entryItem(entry, [])),
    );
  }
}

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
