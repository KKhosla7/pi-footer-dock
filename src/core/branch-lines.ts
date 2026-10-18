import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { Branch, BranchList, BranchResult } from './branches.js';
import { relativeAge } from './relative-age.js';

/** The part of Pi's theme this screen uses, so lines can be built and tested without a terminal. */
export interface Palette {
  fg: (
    colour: 'accent' | 'success' | 'error' | 'warning' | 'muted' | 'dim' | 'text',
    text: string,
  ) => string;
  bold: (text: string) => string;
}

/** Entries shown per section; the rest is summarised as `… N more`. */
export const SECTION_LIMIT = 100;
const MIN_NAME = 8;

interface Columns {
  name: number;
  hash: number;
  age: number;
}

function fit(text: string, size: number): string {
  const cut = truncateToWidth(text, size, '…');
  return cut + ' '.repeat(Math.max(0, size - visibleWidth(cut)));
}

function columns(shown: Branch[], ages: string[], width: number): Columns {
  const widest = (items: string[]): number => Math.max(0, ...items.map((i) => visibleWidth(i)));
  const wanted = widest(shown.map((b) => b.name));
  return {
    name: Math.max(MIN_NAME, Math.min(wanted, Math.floor(width * 0.4))),
    hash: widest(shown.map((b) => b.hash)),
    age: widest(ages),
  };
}

function upstreamText(branch: Branch, theme: Palette): string {
  const upstream = branch.upstream;
  if (!upstream) return '';
  if (upstream.gone) return `${theme.fg('dim', upstream.name)} ${theme.fg('error', '(gone)')}`;
  const ahead = theme.fg(upstream.ahead > 0 ? 'success' : 'dim', `↑${upstream.ahead}`);
  const behind = theme.fg(upstream.behind > 0 ? 'warning' : 'dim', `↓${upstream.behind}`);
  return `${theme.fg('muted', upstream.name)}  ${ahead} ${behind}`;
}

function row(branch: Branch, age: string, cols: Columns, theme: Palette): string {
  const name = fit(branch.name, cols.name);
  const styled = branch.current ? theme.bold(theme.fg('accent', name)) : theme.fg('text', name);
  const marker = branch.current ? theme.fg('accent', '*') : ' ';
  const parts = [
    ` ${marker} ${styled}`,
    theme.fg('muted', fit(branch.hash, cols.hash)),
    theme.fg('muted', fit(age, cols.age)),
    upstreamText(branch, theme),
  ];
  return parts.join('  ').trimEnd();
}

interface Section {
  title: string;
  note: string;
  all: Branch[];
  empty: string;
}
interface Context {
  theme: Palette;
  width: number;
  now: number;
}

function section({ title, note, all, empty }: Section, ctx: Context): string[] {
  const { theme, width, now } = ctx;
  const head = theme.bold(theme.fg('accent', `${title} (${all.length})`));
  const lines = [note === '' ? head : `${head}  ${theme.fg('dim', note)}`];
  if (all.length === 0) return [...lines, theme.fg('dim', `  ${empty}`)];
  const shown = all.slice(0, SECTION_LIMIT);
  const ages = shown.map((b) => relativeAge(b.time, now));
  const cols = columns(shown, ages, width);
  shown.forEach((branch, index) => lines.push(row(branch, ages[index] ?? '', cols, theme)));
  if (all.length > shown.length)
    lines.push(theme.fg('dim', `  … ${all.length - shown.length} more`));
  return lines;
}

function listLines(list: BranchList, theme: Palette, width: number, now: number): string[] {
  if (list.locals.length === 0 && list.remotes.length === 0)
    return [theme.fg('dim', 'No branches yet: this repository has no commits.')];
  const ctx = { theme, width, now };
  const lines = list.detached
    ? [theme.fg('warning', 'HEAD is detached: no local branch is checked out.'), '']
    : [];
  const local = {
    title: 'Local branches',
    note: '',
    all: list.locals,
    empty: 'No local branches.',
  };
  const remote = {
    title: 'Remote branches',
    note: 'as of last fetch, no network',
    all: list.remotes,
    empty: 'No remote branches: no remote is configured or nothing was fetched yet.',
  };
  lines.push(...section(local, ctx), '', ...section(remote, ctx));
  return lines;
}

/** The screen body: every line is at most `width` columns wide. */
export function branchLines(
  result: BranchResult,
  theme: Palette,
  width: number,
  now: number,
): string[] {
  const lines = result.ok
    ? listLines(result.list, theme, width, now)
    : [theme.fg('error', result.message)];
  return lines.map((line) => truncateToWidth(line, Math.max(1, width), '…'));
}

/** The rows of one list of branches, aligned with each other, as drawn in the branches list. */
export function branchRows(
  branches: readonly Branch[],
  theme: Palette,
  width: number,
  now: number,
): string[] {
  const ages = branches.map((branch) => relativeAge(branch.time, now));
  const cols = columns([...branches], ages, width);
  return branches.map((branch, index) => row(branch, ages[index] ?? '', cols, theme));
}
