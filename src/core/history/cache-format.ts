import { GAP_BUCKETS } from './rows.js';
import type { GapBucket, HistoryRow, ProjectInfo } from './rows.js';
import type { FileState } from './scan.js';
import { record } from '../usage-values.js';

/** What the cache remembers about one log file. */
export interface FileEntry {
  path: string;
  size: number;
  mtimeMs: number;
  /** One-way hash of the log's first line: a different one means the file was replaced. */
  headerHash: string;
  project: ProjectInfo;
  state: FileState;
}
export interface CacheFile {
  version: 1;
  files: FileEntry[];
}
export const CACHE_VERSION = 1;
const MAX_FILES = 2000;
const MAX_ROWS_PER_FILE = 20_000;
const SAFE = /^[\w./:()-]{1,128}$/u;

const whole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const instant = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e15;
const money = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e12;

function parseRow(value: unknown): HistoryRow | undefined {
  const row = record(value);
  if (!row) return undefined;
  const { day, project, provider, model, api, gap } = row;
  const labels = [project, provider, model, api];
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(day)) return undefined;
  if (!labels.every((label) => typeof label === 'string' && SAFE.test(label))) return undefined;
  if (typeof gap !== 'string' || !GAP_BUCKETS.includes(gap as GapBucket)) return undefined;
  const counts = [row.responses, row.input, row.output, row.read, row.write, row.unpriced];
  if (!counts.every(whole) || !money(row.cost)) return undefined;
  return value as HistoryRow;
}

function parseProject(value: unknown): ProjectInfo | undefined {
  const project = record(value);
  if (typeof project?.key !== 'string' || !SAFE.test(project.key)) return undefined;
  return typeof project.label === 'string'
    ? { key: project.key, label: project.label.slice(0, 40) }
    : undefined;
}
function parseState(value: unknown): FileState | undefined {
  const state = record(value);
  if (!state || !Array.isArray(state.rows) || state.rows.length > MAX_ROWS_PER_FILE)
    return undefined;
  if (!whole(state.offset) || !whole(state.skipped)) return undefined;
  if (state.prevEnd !== null && !instant(state.prevEnd)) return undefined;
  const rows = state.rows.map(parseRow);
  if (!rows.every((row) => row !== undefined)) return undefined;
  return {
    offset: state.offset,
    prevEnd: state.prevEnd,
    skipped: state.skipped,
    rows: new Map(rows.map((row) => [rowId(row), row])),
  };
}
function parseEntry(value: unknown): FileEntry | undefined {
  const entry = record(value);
  if (!entry || typeof entry.path !== 'string' || entry.path.length > 4096) return undefined;
  if (!whole(entry.size) || !instant(entry.mtimeMs) || typeof entry.headerHash !== 'string')
    return undefined;
  const project = parseProject(entry.project);
  const state = parseState(entry.state);
  if (!project || !state) return undefined;
  return {
    path: entry.path,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    headerHash: entry.headerHash,
    project,
    state,
  };
}
const rowId = (row: HistoryRow): string =>
  [row.day, row.project, row.provider, row.model, row.api, row.gap].join('|');

/** Strict: a cache that is not exactly what this version writes is ignored whole and rebuilt. */
export function parseCache(value: unknown): CacheFile | undefined {
  const cache = record(value);
  if (
    cache?.version !== CACHE_VERSION ||
    !Array.isArray(cache.files) ||
    cache.files.length > MAX_FILES
  )
    return undefined;
  const files = cache.files.map(parseEntry);
  return files.every((file) => file !== undefined) ? { version: CACHE_VERSION, files } : undefined;
}
export function serializeCache(files: readonly FileEntry[]): string {
  return JSON.stringify({
    version: CACHE_VERSION,
    files: files.map((file) => ({
      ...file,
      state: { ...file.state, rows: [...file.state.rows.values()] },
    })),
  });
}
