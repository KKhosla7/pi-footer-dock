import { writeSupport } from '../../cache-class.js';
import type { CacheKind } from '../../cache-class.js';
import { formatDuration } from '../../duration.js';
import { formatTokens } from '../../model.js';
import type { Snapshot } from '../../model.js';
import type { Fact } from '../blocks.js';

export const tokens = (value: number | null): string => `${formatTokens(value, 'decimal')} tokens`;

export function readFact(kind: CacheKind, read: number | null): Fact {
  if (kind === 'none')
    return {
      label: 'Read',
      value: '0 tokens',
      tone: 'error',
      note: 'a miss: earlier responses in this session did report reads',
    };
  if (kind === 'unreported')
    return {
      label: 'Read',
      value: '0 tokens',
      note: 'this provider has not reported any cache reads in this session',
    };
  return { label: 'Read', value: tokens(read), tone: 'success' };
}
export function writeFact(snapshot: Snapshot): Fact {
  const written = snapshot.cacheUsage?.write ?? null;
  if (written !== null && written > 0)
    return { label: 'Written', value: tokens(written), tone: 'accent' };
  const support = writeSupport(snapshot.api);
  const aside = {
    reports: 'measured: nothing was stored this time',
    sometimes: 'only some services behind this API send writes',
    never: 'this API does not report cache writes',
    unknown: 'whether this API reports writes is not known',
  }[support];
  return {
    label: 'Written',
    value: support === 'reports' ? '0 tokens' : 'not reported',
    note: aside,
  };
}
export function idleFact(snapshot: Snapshot): Fact {
  const idle = snapshot.cacheIdleMs;
  return idle === null || idle === undefined
    ? {
        label: 'Idle before',
        value: 'unknown',
        note: 'first response since Pi started, or since the model changed',
      }
    : {
        label: 'Idle before',
        value: formatDuration(idle),
        note: 'since the previous response ended',
      };
}
export function lifetimeFact(snapshot: Snapshot): Fact {
  const { short, long } = snapshot.cachePolicy ?? { short: null, long: null };
  const parts = [
    short ? `short ~${formatDuration(short * 1000)}` : '',
    long ? `long ~${formatDuration(long * 1000)}` : '',
  ].filter(Boolean);
  return parts.length > 0
    ? {
        label: 'Lifetime',
        value: parts.join(', '),
        note: 'declared by the model; the real one is not reported',
      }
    : { label: 'Lifetime', value: 'not declared', note: 'this model gives no cache lifetime' };
}
