import { cacheKind } from '../../cache-class.js';
import type { CacheKind } from '../../cache-class.js';
import { formatCacheReuse } from '../../cache-presentation.js';
import { formatTokens } from '../../model.js';
import type { Snapshot } from '../../model.js';
import { bullets, facts, gap, heading, meters, note, stack } from '../blocks.js';
import type { Block, MeterRow, Tone } from '../blocks.js';
import type { Explained, Explainer, Status } from '../explainer.js';
import { cacheHistory } from './history-sections.js';
import { idleFact, lifetimeFact, readFact, tokens, writeFact } from './cache-facts.js';

const toneOf = (percent: number): Tone =>
  percent >= 80 ? 'success' : percent >= 40 ? 'warning' : 'error';

/** Reuse over the whole session: every recorded response, as read ÷ (uncached + read + written). */
export function sessionShare(snapshot: Snapshot): number | null {
  const { input, cacheRead, cacheWrite } = snapshot.totals;
  if (input === null || cacheRead === null || cacheWrite === null) return null;
  const prompt = input + cacheRead + cacheWrite;
  return prompt > 0 ? (cacheRead / prompt) * 100 : null;
}

function lastRow(snapshot: Snapshot, kind: CacheKind): MeterRow {
  const percent = snapshot.cacheUsage?.reusePercent ?? null;
  if (kind === 'pending')
    return { label: 'Last response', fraction: null, text: 'waiting for a response', tone: 'dim' };
  if (kind === 'unreported')
    return { label: 'Last response', fraction: null, text: 'not reported', tone: 'dim' };
  const share = kind === 'none' ? 0 : (percent ?? 0);
  return {
    label: 'Last response',
    fraction: share / 100,
    text: `${formatCacheReuse(share) === '—' ? '0%' : formatCacheReuse(share)} reused`,
    tone: toneOf(share),
  };
}
function sessionRow(snapshot: Snapshot): MeterRow {
  const share = sessionShare(snapshot);
  if (share === null || snapshot.totals.cacheRead === 0)
    return {
      label: 'Session',
      fraction: null,
      text:
        share === null
          ? snapshot.totals.input === null
            ? 'unknown'
            : 'nothing recorded yet'
          : 'not reported',
      tone: 'dim',
    };
  return {
    label: 'Session',
    fraction: share / 100,
    text: `${formatCacheReuse(share)} reused`,
    tone: toneOf(share),
  };
}

function lastBlocks(snapshot: Snapshot, kind: CacheKind): Block[] {
  const cache = snapshot.cacheUsage;
  if (!cache)
    return [
      note(
        'No response has finished since Pi started or the model changed, so there is nothing to show yet.',
      ),
    ];
  return [
    stack(
      {
        label: 'read',
        amount: cache.read ?? 0,
        tone: 'success',
        text: formatTokens(cache.read, 'decimal'),
      },
      {
        label: 'uncached',
        amount: cache.input ?? 0,
        tone: 'warning',
        text: formatTokens(cache.input, 'decimal'),
      },
      {
        label: 'written',
        amount: cache.write ?? 0,
        tone: 'accent',
        text: formatTokens(cache.write, 'decimal'),
      },
    ),
    facts(
      { label: 'Prompt', value: tokens(cache.prompt), note: 'uncached + read + written' },
      readFact(kind, cache.read),
      writeFact(snapshot),
      idleFact(snapshot),
      lifetimeFact(snapshot),
    ),
  ];
}
function sessionBlocks(snapshot: Snapshot): Block[] {
  const { input, cacheRead, cacheWrite } = snapshot.totals;
  const share = sessionShare(snapshot);
  if (input === null || cacheRead === null || cacheWrite === null)
    return [note('The session total is unknown: a recorded response had unusable usage.')];
  if (share === null) return [note('Nothing has been recorded in this session yet.')];
  const prompt = input + cacheRead + cacheWrite;
  return [
    facts(
      {
        label: 'Reuse',
        value: cacheRead === 0 ? 'not reported' : formatCacheReuse(share),
        note: `${formatTokens(cacheRead, 'decimal')} read of ${formatTokens(prompt, 'decimal')} prompt tokens`,
      },
      ...(cacheWrite > 0 ? [{ label: 'Written', value: tokens(cacheWrite) }] : []),
    ),
  ];
}
const legend = bullets(
  {
    term: 'reused',
    text: 'the share of the prompt the provider served from its cache. Higher is cheaper and faster.',
  },
  {
    term: 'a miss',
    text: 'zero after earlier reads means the cache expired or the start of the prompt changed. After a long pause this is normal.',
  },
  {
    term: 'not reported',
    text: 'the provider never sent a cache read in this session, so a zero may only mean the counter is not sent.',
  },
  {
    term: 'written',
    text: 'tokens the provider stored for later reuse. Only some providers say so; most do not.',
  },
);

function status(kind: CacheKind): Status {
  if (kind === 'pending') return { available: false, text: 'no finished response yet' };
  if (kind === 'unreported')
    return { available: false, text: 'the provider has not reported cache reads in this session' };
  return { available: true, text: 'available' };
}

export const cache: Explainer = {
  id: 'cache',
  title: 'Cache',
  reports: [
    'Tokens of the last finished response that the provider served from its prompt cache (read), billed as new input (uncached) and stored for later (written).',
    'Reuse = read ÷ (uncached + read + written). The session figure is the same sum over every recorded response, so one cold start does not dominate it.',
    'Counts are tokens, not bytes. They say nothing about money (see Cost) or about how long the cache will last.',
  ],
  missingWhen: [
    'No response has finished since Pi started or the model changed.',
    'The provider does not send cache counters: the footer then says not reported.',
    'The last response failed, was aborted or was deferred: it never replaces the previous figures.',
    'Writes: only Anthropic and Bedrock report them reliably; OpenAI-style APIs usually do not.',
  ],
  periods: true,
  build({ snapshot, now, period }): Explained {
    const kind = cacheKind(snapshot.cacheUsage, snapshot.totals.cacheRead);
    return {
      headline: [meters(lastRow(snapshot, kind), sessionRow(snapshot))],
      body: [
        heading('Last response'),
        ...lastBlocks(snapshot, kind),
        gap,
        heading('This session'),
        ...sessionBlocks(snapshot),
        ...(snapshot.history
          ? cacheHistory(snapshot.history, period ?? 'month', new Date(now))
          : []),
        gap,
        heading('How to read it'),
        legend,
      ],
      status: status(kind),
    };
  },
};
