export const MAX_LINE_BYTES = 4 * 1024 * 1024;

/**
 * Cuts a byte stream into complete lines. A partial line stays buffered until its newline
 * arrives; a line that grows past the cap is dropped (and counted) without being buffered.
 */
export class LineSplitter {
  private pending = Buffer.alloc(0);
  private discarding = false;
  /** Bytes that belong to lines already handed out or dropped. */
  consumed: number;
  tooLong = 0;

  constructor(start: number) {
    this.consumed = start;
  }

  push(chunk: Buffer, onLine: (line: string) => void): void {
    this.pending = Buffer.concat([this.pending, chunk]);
    for (let end = this.pending.indexOf(10); end >= 0; end = this.pending.indexOf(10)) {
      if (!this.discarding) onLine(this.pending.subarray(0, end).toString('utf8'));
      this.discarding = false;
      this.consumed += end + 1;
      this.pending = this.pending.subarray(end + 1);
    }
    if (this.pending.length > MAX_LINE_BYTES) this.drop();
  }
  private drop(): void {
    if (!this.discarding) this.tooLong += 1;
    this.discarding = true;
    this.consumed += this.pending.length;
    this.pending = Buffer.alloc(0);
  }
}
