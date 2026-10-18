import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { parseHeader } from '../../core/history/entry.js';
import type { FileEntry } from '../../core/history/cache-format.js';
import { addRow } from '../../core/history/rows.js';
import type { HistoryRow } from '../../core/history/rows.js';
import { emptyState, feedLine } from '../../core/history/scan.js';
import type { FileState } from '../../core/history/scan.js';
import type { PriceSource } from '../../core/price-source.js';
import { discoverLogs, statLog } from './files.js';
import type { LogFile } from './files.js';
import { loadCache, saveCache } from './cache.js';
import { ProjectResolver } from './project.js';
import { readLines } from './read-lines.js';

/** Log versions this reader understands; a newer Pi's file is skipped, not guessed at. */
const SUPPORTED_VERSIONS = { min: 1, max: 10 };
const HEADER_BYTES = 8192;

export interface ScanOptions {
  /** Pi's `sessions` directory. */
  root: string;
  cachePath: string;
  prices: () => PriceSource;
  /** Milliseconds of work between turns of the event loop. */
  sliceMs?: number;
  now?: () => number;
}
export interface History {
  rows: HistoryRow[];
  /** Project key to folder name, for the keys that appear in the rows. */
  projects: Record<string, string>;
  files: number;
  /** Lines or files passed over because they could not be read as usage. */
  skipped: number;
}

const hash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The log's first line, when it is a header this reader understands. */
async function readHeader(path: string): Promise<{ hash: string; cwd: string } | undefined> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => undefined);
  if (!handle) return undefined;
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    const end = buffer.subarray(0, bytesRead).indexOf(10);
    const line = end < 0 ? undefined : buffer.subarray(0, end).toString('utf8');
    const header = line === undefined ? undefined : parseHeader(line);
    const known =
      header &&
      header.version >= SUPPORTED_VERSIONS.min &&
      header.version <= SUPPORTED_VERSIONS.max;
    return header && known && line !== undefined
      ? { hash: hash(line), cwd: header.cwd }
      : undefined;
  } finally {
    await handle.close();
  }
}
/** A copy to feed: if the read fails half way, the saved state must stay as it was. */
function cloneState(state: FileState): FileState {
  return { ...state, rows: new Map([...state.rows].map(([key, row]) => [key, { ...row }])) };
}

/** Rolls Pi's session logs up into rows, reading only what was appended since the last scan. */
export class UsageScanner {
  private readonly resolver = new ProjectResolver();
  private entries = new Map<string, FileEntry>();
  private loaded = false;
  constructor(private readonly options: ScanOptions) {}

  private pauser(): () => Promise<void> {
    const now = this.options.now ?? (() => performance.now());
    const budget = this.options.sliceMs ?? 8;
    let sliceStart = now();
    return async () => {
      if (now() - sliceStart < budget) return;
      await new Promise<void>((accept) => setImmediate(accept));
      sliceStart = now();
    };
  }
  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    this.entries = new Map(
      (await loadCache(this.options.cachePath)).map((entry) => [entry.path, entry]),
    );
  }

  /** Every log: new and grown files are read from where they were left; unchanged ones cost nothing. */
  async scan(signal: AbortSignal): Promise<History> {
    await this.load();
    const pause = this.pauser();
    const next = new Map<string, FileEntry>();
    for (const log of await discoverLogs(this.options.root)) {
      if (signal.aborted) return this.merge();
      const entry = await this.update(log, this.entries.get(log.path), pause, signal);
      if (entry) next.set(log.path, entry);
    }
    this.entries = next;
    await this.save();
    return this.merge();
  }
  /** One log, after it grew (the session in use): only the appended lines are read. */
  async refresh(path: string, signal: AbortSignal): Promise<History> {
    await this.load();
    const log = await statLog(path);
    const entry = log && (await this.update(log, this.entries.get(path), this.pauser(), signal));
    if (entry) this.entries.set(path, entry);
    return this.merge();
  }
  async save(): Promise<void> {
    await saveCache(this.options.cachePath, [...this.entries.values()]).catch(() => undefined);
  }

  private merge(): History {
    const rows = new Map<string, HistoryRow>();
    const projects: Record<string, string> = {};
    let skipped = 0;
    for (const entry of this.entries.values()) {
      skipped += entry.state.skipped;
      projects[entry.project.key] = entry.project.label;
      for (const row of entry.state.rows.values()) addRow(rows, row);
    }
    return { rows: [...rows.values()], projects, files: this.entries.size, skipped };
  }

  private async update(
    log: LogFile,
    saved: FileEntry | undefined,
    pause: () => Promise<void>,
    signal: AbortSignal,
  ): Promise<FileEntry | undefined> {
    const header = await readHeader(log.path);
    if (!header) return undefined;
    const base =
      saved?.headerHash === header.hash && saved.state.offset <= log.size ? saved : undefined;
    if (base?.size === log.size && base.mtimeMs === log.mtimeMs) return base;
    const project = base ? base.project : await this.resolver.resolve(header.cwd, signal);
    const state = base ? cloneState(base.state) : emptyState();
    const context = { project, prices: this.options.prices() };
    const read = await readLines({
      path: log.path,
      from: state.offset,
      to: log.size,
      onLine: (line) => {
        feedLine(state, line, context);
      },
      pause,
      signal,
    }).catch(() => undefined);
    if (!read || signal.aborted) return saved;
    state.offset = read.offset;
    state.skipped += read.tooLong;
    return {
      path: log.path,
      size: log.size,
      mtimeMs: log.mtimeMs,
      headerHash: header.hash,
      project,
      state,
    };
  }
}
