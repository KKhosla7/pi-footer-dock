import { isCollapsedRow } from './settings-collapse.js';
import { BOLD_ROW, isColorRow } from './settings-colors.js';
import type { IconKind } from './settings-colors.js';
import { groupText, wordFor } from './settings-labels.js';
import { layerItem } from './settings-layers.js';
import { menuRows } from './settings-menu.js';
import type { MenuRow } from './settings-menu.js';
import type { Settings } from './settings.js';

export interface MenuEntry extends MenuRow {
  children?: MenuEntry[];
}

export function findEntry(entries: readonly MenuEntry[], id: string): MenuEntry | undefined {
  for (const entry of entries) {
    const found = entry.id === id ? entry : findEntry(entry.children ?? [], id);
    if (found) return found;
  }
  return undefined;
}

interface GroupSpec {
  id: string;
  items: string[];
  rows?: string[];
}
const groups: GroupSpec[] = [
  { id: 'workspace', items: ['workspace', 'branch', 'changes', 'ahead'] },
  { id: 'model', items: ['model', 'thinking'] },
  {
    id: 'context',
    items: ['context', 'context-usage', 'compaction', 'input', 'output'],
    rows: ['unit'],
  },
  { id: 'usage', items: ['cache', 'speed', 'cost'], rows: ['period'] },
];

const changed = (rows: readonly MenuEntry[]): number =>
  rows.reduce(
    (total, entry) =>
      total +
      (entry.children
        ? changed(entry.children)
        : Number(entry.current !== (entry.default ?? entry.values[0]))),
    0,
  );
export const summary = (rows: readonly MenuEntry[]): string => {
  const count = changed(rows);
  return count === 0 ? 'all default' : `${count} changed`;
};

function group(id: string, children: MenuEntry[]): MenuEntry {
  return {
    id: `group:${id}`,
    label: groupText[id]?.label ?? id,
    description: groupText[id]?.note ?? '',
    values: [],
    current: summary(children),
    children,
  };
}

function collapseGroup(rows: MenuRow[]): MenuEntry {
  const children = rows.filter((row) => row.id === 'collapse' || isCollapsedRow(row.id));
  const mode = children.find((row) => row.id === 'collapse')?.current ?? '';
  return { ...group('collapse', children), current: wordFor('collapse', mode) };
}

export function menuEntries(
  settings: Settings,
  published: readonly string[],
  icons?: IconKind,
): MenuEntry[] {
  const rows = menuRows(settings, published, icons);
  const take = (match: (row: MenuRow) => boolean): MenuRow[] => rows.filter(match);
  const only = (id: string): MenuRow[] => take((row) => row.id === id);
  const entries = groups.map((spec) =>
    group(
      spec.id,
      take(
        (row) =>
          spec.items.some((item) => row.id === `item:${item}` || layerItem(row.id) === item) ||
          (spec.rows ?? []).includes(row.id),
      ),
    ),
  );
  const limits = [
    ...only('item:quota'),
    ...take((row) => row.id.startsWith('window:')),
    ...only('wording'),
    ...only('layer:quota:meter'),
    ...only('layer:quota:reset'),
    collapseGroup(rows),
    ...only('expanded'),
    ...only('animation'),
    ...only('limits'),
  ];
  const appearance = [
    ...only('glyphs'),
    ...only('meterStyle'),
    ...only(BOLD_ROW),
    group(
      'colors',
      take((row) => isColorRow(row.id) && row.id !== BOLD_ROW),
    ),
  ];
  return [group('appearance', appearance), ...entries, group('quota', limits), ...only('clicks')];
}
