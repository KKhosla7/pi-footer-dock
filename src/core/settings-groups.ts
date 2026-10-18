import { isCollapsedRow } from './settings-collapse.js';
import { menuRows } from './settings-menu.js';
import type { MenuRow } from './settings-menu.js';
import { quotaText } from './settings-text.js';
import type { Settings } from './settings.js';

/** A top-level menu entry: a plain row, or a group whose `children` open as a sub-menu. */
export interface MenuEntry extends MenuRow {
  children?: MenuEntry[];
}

/** The entry with this id at any depth. */
export function findEntry(entries: readonly MenuEntry[], id: string): MenuEntry | undefined {
  for (const entry of entries) {
    const found = entry.id === id ? entry : findEntry(entry.children ?? [], id);
    if (found) return found;
  }
  return undefined;
}

interface GroupSpec {
  id: string;
  label: string;
  note: string;
  items: string[];
  /** Extra rows that belong with the items (by row id). */
  rows?: string[];
}
const groups: GroupSpec[] = [
  {
    id: 'workspace',
    label: 'Project and Git',
    note: 'Folder, branch, changed files, commits ahead.',
    items: ['workspace', 'branch', 'changes', 'ahead'],
  },
  {
    id: 'model',
    label: 'Model',
    note: 'The model and its thinking level.',
    items: ['model', 'thinking'],
  },
  {
    id: 'context',
    label: 'Context and tokens',
    note: 'Context, compaction notice, input and output.',
    items: ['context', 'context-usage', 'compaction', 'input', 'output'],
    rows: ['unit'],
  },
  {
    id: 'usage',
    label: 'Cache, speed and cost',
    note: 'Cache, speed and estimated cost.',
    items: ['cache', 'speed', 'cost'],
    rows: ['period'],
  },
];
const QUOTA_ROWS = ['limits', 'wording', 'collapse', 'expanded', 'animation', 'meter'];

/** The first value of every row is its default, so a row is changed when it is not on it. */
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

function group(spec: Pick<GroupSpec, 'id' | 'label' | 'note'>, children: MenuEntry[]): MenuEntry {
  return {
    id: `group:${spec.id}`,
    label: spec.label,
    description: spec.note,
    values: [],
    current: summary(children),
    children,
  };
}

/** "Limit windows": when to collapse, and a row per window for what stays. Shows the mode. */
function collapseGroup(take: (match: (row: MenuRow) => boolean) => MenuRow[]): MenuEntry {
  const children = take((row) => row.id === 'collapse' || isCollapsedRow(row.id));
  return {
    id: 'group:collapse',
    label: 'Limit windows',
    description: quotaText.collapse,
    values: [],
    current: children.find((row) => row.id === 'collapse')?.current ?? '',
    children,
  };
}

/** The menu as the user sees it: related rows clubbed into sub-menus, the icon set on top level. */
export function menuEntries(settings: Settings, published: readonly string[]): MenuEntry[] {
  const rows = menuRows(settings, published);
  const take = (match: (row: MenuRow) => boolean) => rows.filter(match);
  const entries = groups.map((spec) =>
    group(
      spec,
      take(
        (row) =>
          spec.items.some((item) => row.id === `item:${item}`) ||
          (spec.rows ?? []).includes(row.id),
      ),
    ),
  );
  const limits = take(
    (row) =>
      row.id === 'item:quota' ||
      row.id.startsWith('window:') ||
      QUOTA_ROWS.includes(row.id) ||
      isCollapsedRow(row.id),
  ).flatMap((row): MenuEntry[] => {
    if (isCollapsedRow(row.id)) return [];
    return row.id === 'collapse' ? [collapseGroup(take)] : [row];
  });
  return [
    ...entries,
    group(
      { id: 'quota', label: 'Limit usage', note: 'Visibility, windows, collapse, wording, meter.' },
      limits,
    ),
    ...take((row) => row.id === 'clicks' || row.id === 'glyphs'),
  ];
}
