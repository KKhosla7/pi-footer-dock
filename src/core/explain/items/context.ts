import { formatPercent, formatTokens } from '../../model.js';
import type { Snapshot } from '../../model.js';
import { reserveFor } from '../../compaction-help.js';
import { bullets, facts, gap, heading, meters, note, table } from '../blocks.js';
import type { Block, Tone } from '../blocks.js';
import type { Explained, Explainer, Status } from '../explainer.js';

const toneOf = (percent: number): Tone =>
  percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success';

function contextBuild({ snapshot }: { snapshot: Snapshot }): Explained {
  const { percent, tokens, capacity } = snapshot;
  const known = percent !== null && capacity !== null;
  return {
    headline: [
      meters({
        label: 'Context',
        fraction: known ? percent / 100 : null,
        text: known
          ? `${formatPercent(percent)} of ${formatTokens(capacity)}`
          : `unknown of ${formatTokens(capacity)}`,
        tone: known ? toneOf(percent) : 'dim',
      }),
    ],
    body: [
      facts(
        { label: 'In context', value: formatTokens(tokens, 'decimal'), note: 'tokens now' },
        { label: 'Window', value: formatTokens(capacity, 'decimal'), note: "the model's size" },
      ),
    ],
    status: known
      ? { available: true, text: 'available' }
      : {
          available: false,
          text: 'unknown until the next response (Pi reports no usage after a compaction)',
        },
  };
}

export const contextUsage: Explainer = {
  id: 'context-usage',
  title: 'Context usage',
  reports: [
    "How much of the model's context window the conversation fills right now: tokens in context, and the window size.",
    'It is the current size, not what the session has used in total (see Input and Output tokens).',
  ],
  missingWhen: [
    'Right after a compaction, until the next response: Pi reports the size as unknown.',
    'The model has no known context window.',
  ],
  build: contextBuild,
};

interface Compact {
  capacity: number;
  reserve: number;
  at: number;
}

function compactionFacts({ capacity, reserve, at }: Compact): Block[] {
  return [
    facts(
      { label: 'Window', value: formatTokens(capacity, 'decimal') },
      {
        label: 'Reserve',
        value: formatTokens(reserve, 'decimal'),
        note: "Pi's compaction.reserveTokens",
      },
      {
        label: 'Compacts at',
        value: `${at}% of the window`,
        note: `${formatTokens(capacity - reserve, 'decimal')} tokens`,
      },
    ),
    gap,
    heading('Choose a different point'),
    table(
      ['Compact at', 'Set reserveTokens to'],
      [50, 60, 70, 80, 90].map((percent) => [
        `${percent}%`,
        formatTokens(reserveFor(capacity, percent)),
      ]),
      [1],
    ),
    note(
      "Set it in Pi's settings.json as compaction.reserveTokens. Footer Dock cannot change it: Pi gives extensions no way to write its settings.",
    ),
  ];
}
function compactionState(snapshot: Snapshot): Compact | undefined {
  const { capacity, compactReserve, compactAt } = snapshot;
  return capacity === null ||
    compactReserve === undefined ||
    compactAt === undefined ||
    compactAt === null
    ? undefined
    : { capacity, reserve: compactReserve, at: compactAt };
}
function compactionStatus({ autoCompact, tokens }: Snapshot): Status {
  if (!autoCompact) return { available: false, text: 'auto-compaction is off' };
  return tokens === null
    ? { available: false, text: 'awaiting usage' }
    : { available: true, text: 'available' };
}

export const compaction: Explainer = {
  id: 'compaction',
  title: 'Compaction',
  reports: [
    'How far the context is from the point where Pi compacts it: tokens left, or the percent of the window where it happens.',
    'Pi compacts when the context passes the window minus its reserve. This is a distance, not a time.',
  ],
  missingWhen: [
    'Auto-compaction is off in Pi.',
    'No usage yet (after a compaction or at the start of a session): shown as awaiting usage.',
    'The model has no known context window, so no conversion can be shown.',
  ],
  build({ snapshot }): Explained {
    const state = compactionState(snapshot);
    const point = state ? state.capacity - state.reserve : 0;
    const { tokens } = snapshot;
    const headline =
      point > 0 && tokens !== null
        ? [
            meters({
              label: 'To compaction',
              fraction: tokens / point,
              text: `${formatTokens(Math.max(0, point - tokens))} left`,
              tone: toneOf((tokens / point) * 100),
            }),
          ]
        : [];
    const off = snapshot.autoCompact
      ? []
      : [
          bullets({
            text: 'Auto-compaction is off, so Pi will not compact by itself.',
            tone: 'warning',
          }),
        ];
    return {
      headline,
      body: [
        ...(state
          ? compactionFacts(state)
          : [note("The model's window is not known yet, so no conversion can be shown.")]),
        ...off,
      ],
      status: compactionStatus(snapshot),
    };
  },
};
