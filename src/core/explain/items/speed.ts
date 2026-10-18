import { formatTokens } from '../../model.js';
import { formatResponseRate } from '../../response-speed.js';
import type { Unmeasured } from '../../response-speed.js';
import { bullets, facts, gap, heading } from '../blocks.js';
import type { Fact } from '../blocks.js';
import type { Explained, Explainer } from '../explainer.js';

const WHY: Record<Unmeasured, string> = {
  'no-duration': 'the last response finished, but the provider reported no duration for it',
  'too-short': 'the last response was too short to time (under 20 ms)',
  'no-output': 'the last response reported no output tokens',
};

const seconds = (ms: number | null): string =>
  ms === null ? 'unavailable' : `${(ms / 1000).toFixed(2)} s`;

export const speed: Explainer = {
  id: 'speed',
  title: 'Tokens per second',
  reports: [
    'Output tokens of the last finished response divided by how long the SDK says the response took.',
    "It is the throughput you experienced, request wait included, not the model's decoding speed. Reasoning is counted as output, and so is tool-call output.",
    'Comparable between providers only roughly: networks, queues and reasoning differ. Footer Dock makes no estimate from text length.',
  ],
  missingWhen: [
    'A response is running: the figure is cleared when a turn starts and returns when the response finishes.',
    'No response has finished since Pi started or the model changed.',
    'The last response failed, was aborted or was deferred.',
    'The provider gave no duration, a duration under 20 ms, or no output tokens. Some providers never report a duration; then this stays empty, because Footer Dock would rather show nothing than a guess.',
  ],
  build({ snapshot }): Explained {
    const timing = snapshot.responseTiming;
    const rate = snapshot.outputTokensPerSecond;
    const rows: Fact[] = timing
      ? [
          { label: 'Output', value: `${formatTokens(timing.output, 'decimal')} tokens` },
          { label: 'Duration', value: seconds(timing.durationMs), note: 'as timed by the SDK' },
          {
            label: 'Reasoning',
            value:
              timing.reasoning === null
                ? 'unavailable'
                : `${formatTokens(timing.reasoning, 'decimal')} tokens`,
            note: 'already counted in the output',
          },
          {
            label: 'First content',
            value: seconds(timing.firstContentMs),
            note: 'after the turn started',
          },
          { label: 'First text', value: seconds(timing.firstTextMs) },
        ]
      : [];
    return {
      headline: [
        facts({
          label: 'Last response',
          value: typeof rate === 'number' ? `${formatResponseRate(rate)} tok/s` : 'not available',
        }),
      ],
      body: [
        ...(rows.length > 0 ? [heading('How it was measured'), facts(...rows), gap] : []),
        heading('Reading it'),
        bullets(
          {
            term: 'rate',
            text: 'output tokens ÷ duration. A long wait before the first token lowers it.',
          },
          {
            term: 'first content',
            text: 'when anything arrived; it includes preparing the turn, so it is not a server latency.',
          },
        ),
      ],
      status:
        typeof rate === 'number'
          ? { available: true, text: 'available' }
          : {
              available: false,
              text: snapshot.speedUnmeasured
                ? WHY[snapshot.speedUnmeasured]
                : 'no finished response with usable timing',
            },
    };
  },
};
