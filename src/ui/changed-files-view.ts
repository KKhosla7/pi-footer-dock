import { stripTerminalSequences, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { MAX_ROWS, summarize } from '../core/changed-files.js';
import type {
  ChangedFile,
  ChangedFilesState,
  FileSize,
  FileStatus,
} from '../core/changed-files.js';
import { statSquares } from '../core/diff-stat.js';
import { safeLabel } from '../core/model.js';

type Colour = 'accent' | 'success' | 'error' | 'warning' | 'muted' | 'dim';
/** The part of Pi's theme the screen uses, so it can be drawn and tested without a terminal. */
export interface Styler {
  fg(colour: Colour, text: string): string;
  bold(text: string): string;
}
interface Cell {
  text: string;
  width: number;
}

const BADGE_COLOUR: Record<FileStatus, Colour> = {
  M: 'warning',
  A: 'success',
  D: 'error',
  R: 'accent',
  '?': 'muted',
  U: 'error',
};
/** What the user reads: git's `?` (untracked) means nothing to most people, so it reads as a new file. */
const SHOWN: Record<FileStatus, string> = { M: 'M', A: 'A', D: 'D', R: 'R', '?': 'A', U: 'U' };
const MEANING: Record<string, string> = {
  M: 'modified',
  A: 'new',
  D: 'deleted',
  R: 'renamed',
  U: 'conflict',
};
const MIN_PATH = 12;
const GAP = '  ';
const number = (value: number): string => value.toLocaleString('en-US');
const pad = (text: string, width: number): string =>
  ' '.repeat(Math.max(0, width - visibleWidth(text))) + text;
const segments = (text: string): string[] =>
  Array.from(new Intl.Segmenter().segment(text), (part) => part.segment);

function take(parts: string[], budget: number): string {
  let used = 0;
  let out = '';
  for (const part of parts) {
    used += visibleWidth(part);
    if (used > budget) break;
    out += part;
  }
  return out;
}

/** Fits a path by cutting out its middle; the file name stays visible when it can. */
export function fitPath(path: string, max: number): string {
  if (visibleWidth(path) <= max) return path;
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (visibleWidth(name) + 2 <= max) {
    return take(segments(path), max - 1 - visibleWidth(name)) + '…' + name;
  }
  const head = Math.floor((max - 1) / 2);
  const tail = take(segments(path).reverse(), max - 1 - head);
  return take(segments(path), head) + '…' + segments(tail).reverse().join('');
}

function sizeText(size: FileSize): string {
  if (size.kind === 'lines') return `${number(size.lines)} ${size.lines === 1 ? 'line' : 'lines'}`;
  return size.kind === 'skipped' ? '—' : size.kind;
}

function changeCell(file: ChangedFile, theme: Styler): Cell {
  const { added, removed } = file;
  if (added === null || removed === null) return { text: '', width: 0 };
  const parts: string[] = [];
  const plain: string[] = [];
  if (added > 0) {
    plain.push(`+${number(added)}`);
    parts.push(theme.fg('success', `+${number(added)}`));
  }
  if (removed > 0) {
    plain.push(`−${number(removed)}`);
    parts.push(theme.fg('error', `−${number(removed)}`));
  }
  const bar = ` ${squares(added, removed, theme)}`;
  if (!parts.length) return { text: theme.fg('dim', '±0') + bar, width: 2 + 6 };
  return { text: parts.join(' ') + bar, width: visibleWidth(plain.join(' ')) + 6 };
}

/** Five squares in the proportion of added to removed lines, like a pull request's diffstat. */
function squares(added: number, removed: number, theme: Styler): string {
  const { green, red, neutral } = statSquares(added, removed);
  return (
    theme.fg('success', '■'.repeat(green)) +
    theme.fg('error', '■'.repeat(red)) +
    theme.fg('dim', '■'.repeat(neutral))
  );
}

const clean = (path: string): string => safeLabel(stripTerminalSequences(path));

function header(files: readonly ChangedFile[], theme: Styler): string {
  const totals = summarize(files);
  const noun = totals.files === 1 ? 'file' : 'files';
  const counts = `${theme.fg('success', `+${number(totals.added)}`)} ${theme.fg('error', `−${number(totals.removed)}`)} ${squares(totals.added, totals.removed, theme)}`;
  const note = totals.partial ? theme.fg('dim', ' · some untracked files not counted') : '';
  return ` ${theme.bold(`${number(totals.files)} ${noun}`)} · ${counts}${note}`;
}

/** One line per file, aligned with the others, as drawn in the list. */
export function fileRows(files: readonly ChangedFile[], theme: Styler, width: number): string[] {
  const sizes = files.map((file) => sizeText(file.size));
  const changes = files.map((file) => changeCell(file, theme));
  let sizeWidth = Math.max(0, ...sizes.map(visibleWidth));
  const changeWidth = Math.max(0, ...changes.map((cell) => cell.width));
  const room = (size: number): number =>
    width - (4 + (size ? size + GAP.length : 0) + GAP.length + changeWidth);
  if (room(sizeWidth) < MIN_PATH) sizeWidth = 0;
  // The columns sit right after the longest name instead of at the far edge of a wide terminal.
  const longest = Math.max(4, ...files.map((file) => visibleWidth(clean(file.path))));
  const pathWidth = Math.min(longest, Math.max(4, room(sizeWidth)));
  return files.map((file, index) => {
    const path = fitPath(clean(file.path), pathWidth);
    const gap = ' '.repeat(Math.max(0, pathWidth - visibleWidth(path)));
    const badge = theme.fg(BADGE_COLOUR[file.status], SHOWN[file.status]);
    const size = sizeWidth ? GAP + theme.fg('muted', pad(sizes[index] ?? '', sizeWidth)) : '';
    const change = changes[index] ?? { text: '', width: 0 };
    return ` ${badge} ${path}${gap}${size}${GAP}${' '.repeat(changeWidth - change.width)}${change.text}`;
  });
}

/** What each letter means, only for the letters on screen. */
function legend(files: readonly ChangedFile[], theme: Styler, width: number): string {
  const letters = [...new Set(files.map((file) => SHOWN[file.status]))];
  const words = letters.map((letter) => `${letter} ${MEANING[letter] ?? ''}`);
  return theme.fg('dim', truncateToWidth(` ${words.join('  ·  ')}`, width));
}

const MESSAGES = {
  'not-repository': 'Not inside a Git work tree.',
  'git-missing': 'Git could not be started (is it installed?).',
  failed: 'Git could not be read (it timed out or reported too much).',
} as const;

/** The screen in three parts: a summary and a legend that stay put, and the rows that scroll. */
export interface ChangedFilesParts {
  header: string[];
  rows: string[];
  footer: string[];
}

export function changedFilesParts(
  state: ChangedFilesState,
  theme: Styler,
  width: number,
): ChangedFilesParts {
  if (state.kind !== 'files')
    return { header: [], rows: [theme.fg('warning', ` ${MESSAGES[state.kind]}`)], footer: [] };
  if (!state.files.length)
    return { header: [], rows: [theme.fg('dim', ' No changes')], footer: [] };
  const shown = state.files.slice(0, MAX_ROWS);
  const list = fileRows(shown, theme, width);
  const more = state.files.length - shown.length;
  if (more > 0) list.push(theme.fg('dim', ` … ${number(more)} more`));
  return {
    header: [header(state.files, theme), ''],
    rows: list,
    footer: ['', legend(shown, theme, width)],
  };
}

/** Everything as one list (a summary, one row per file at most 300, what was left out, a legend). */
export function changedFilesLines(
  state: ChangedFilesState,
  theme: Styler,
  width: number,
): string[] {
  const parts = changedFilesParts(state, theme, width);
  return [...parts.header, ...parts.rows, ...parts.footer];
}

/** ` M path  +12 −3 ■■■■□`: the one-line summary above a file's diff. */
export function fileSummary(file: ChangedFile, theme: Styler, width: number): string {
  const badge = theme.fg(BADGE_COLOUR[file.status], SHOWN[file.status]);
  const change = changeCell(file, theme);
  const room = Math.max(8, width - 4 - change.width);
  return ` ${badge} ${fitPath(clean(file.path), room)}  ${change.text}`.trimEnd();
}
