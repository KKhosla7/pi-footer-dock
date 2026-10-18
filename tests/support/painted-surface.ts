import assert from 'node:assert/strict';

/** Check every printable character, including padding between styled spans. */
export function assertPaintedSurface(row: string, background: string | string[]): void {
  const allowed = new Set(typeof background === 'string' ? [background] : background);
  let painted = false;
  for (const segment of row.split('\u001b[')) {
    if (!segment) continue;
    const sequence = /^([\d;]*)m(.*)$/su.exec(segment);
    assert.ok(sequence, 'unexpected terminal sequence or unpainted leading content');
    const code = sequence[1];
    if (code?.startsWith('48;')) painted = allowed.has(code);
    if (code === '49' || code === '0') painted = false;
    if (sequence[2]) assert.ok(painted, 'text or padding has terminal-default background');
  }
}
