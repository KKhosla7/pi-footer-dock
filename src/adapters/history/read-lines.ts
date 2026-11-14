import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { LineSplitter } from './line-splitter.js';

const CHUNK = 64 * 1024;

export interface ReadResult {
  offset: number;
  tooLong: number;
}
export interface ReadOptions {
  path: string;
  from: number;
  to: number;
  onLine: (line: string) => void;
  pause: () => Promise<void>;
  signal: AbortSignal;
}

export async function readLines(options: ReadOptions): Promise<ReadResult> {
  const handle = await open(options.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const buffer = Buffer.alloc(CHUNK);
    const lines = new LineSplitter(options.from);
    let position = options.from;
    while (position < options.to && !options.signal.aborted) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(CHUNK, options.to - position),
        position,
      );
      if (bytesRead === 0) break;
      position += bytesRead;
      lines.push(buffer.subarray(0, bytesRead), options.onLine);
      await options.pause();
    }
    return { offset: lines.consumed, tooLong: lines.tooLong };
  } finally {
    await handle.close();
  }
}
