import { formatDuration } from '../../duration.js';
import { formatPercent } from '../../model.js';
import type { Snapshot } from '../../model.js';
import { PROVIDER_QUOTA_INTERVAL_MS, QUOTA_MAX_AGE_MS } from '../../quota-limits.js';
import { paceOf, PACE_BAND } from '../../quota-pace.js';
import type { Pace } from '../../quota-pace.js';
import { quotaHelp } from '../../quota-freshness.js';
import type { RateLimitWindow } from '../../rate-limits.js';
import { safeLabel } from '../../model.js';
import { bullets, facts, gap, heading, meters, note, table } from '../blocks.js';
import type { Block, MeterRow, Tone } from '../blocks.js';
import type { ExplainContext, Explained, Explainer, Status } from '../explainer.js';

const LOW = 25;

function paceText(window: RateLimitWindow, pace: Pace): { text: string; tone: Tone } {
  switch (pace.verdict) {
    case 'blocked':
      return { text: `blocked: ${safeLabel(window.badge ?? '')}`, tone: 'error' };
    case 'out':
      return { text: 'used up', tone: 'error' };
    case 'ahead':
      return { text: 'ahead of pace', tone: 'warning' };
    case 'behind':
      return { text: 'behind pace', tone: 'success' };
    case 'on-pace':
      return { text: 'on pace', tone: 'accent' };
    case 'just-started':
      return { text: 'just started', tone: 'dim' };
    case 'reset-due':
      return { text: 'reset due', tone: 'dim' };
    case 'unknown':
      return { text: 'pace unknown', tone: 'dim' };
  }
}
const points = (delta: number | null): string =>
  delta === null ? '' : ` (${delta >= 0 ? '+' : '−'}${Math.round(Math.abs(delta))} pts)`;
const fillTone = (window: RateLimitWindow): Tone =>
  window.badge !== undefined || window.remainingPercent <= 0
    ? 'error'
    : window.remainingPercent <= LOW
      ? 'warning'
      : 'accent';

function meterRow(window: RateLimitWindow, pace: Pace): MeterRow {
  const verdict = paceText(window, pace);
  return {
    label: safeLabel(window.label),
    fraction: pace.used / 100,
    text: `${formatPercent(window.remainingPercent)} left · ${verdict.text}`,
    tone: fillTone(window),
    ...(pace.elapsed === null ? {} : { mark: pace.elapsed }),
  };
}
function tableRow(window: RateLimitWindow, pace: Pace, now: number): string[] {
  const verdict = paceText(window, pace);
  const toReset = window.resetAt * 1000 - now;
  const clock =
    pace.elapsed === null
      ? '—'
      : `${pace.approximate ? '≈' : ''}${Math.round(pace.elapsed * 100)}%`;
  return [
    safeLabel(window.label),
    formatPercent(window.remainingPercent),
    toReset > 0 ? formatDuration(toReset) : 'due',
    clock,
    verdict.text + points(pace.delta),
  ];
}
function projectionBullets(windows: readonly RateLimitWindow[], now: number) {
  return windows.flatMap((window) => {
    const pace = paceOf(window, now);
    const term = safeLabel(window.label);
    if (pace.runsOutBeforeResetMs !== null)
      return [
        {
          term,
          tone: 'warning' as const,
          text: `at this rate it runs out about ${formatDuration(pace.runsOutBeforeResetMs)} before it resets.`,
        },
      ];
    if (pace.projectedAtReset !== null)
      return [
        {
          term,
          text: `at this rate about ${Math.round(pace.projectedAtReset)}% would be used by the reset.`,
        },
      ];
    return [];
  });
}

function legend(windows: readonly RateLimitWindow[]): Block {
  const statuses = [
    ...new Set(windows.flatMap((window) => (window.badge ? [safeLabel(window.badge)] : []))),
  ];
  return bullets(
    {
      term: 'fill',
      text: 'the share of the window already used. The bar is yellow at 25% left or less, red when blocked or used up.',
    },
    {
      term: '┃ mark',
      text: 'how far through the window the clock is. Fill beyond the mark means use is running ahead of the clock.',
    },
    {
      term: 'ahead of pace',
      text: `use is more than ${PACE_BAND} points ahead of the clock: at this rate the window runs out before it resets.`,
      tone: 'warning',
    },
    {
      term: 'behind pace',
      text: `use is more than ${PACE_BAND} points behind the clock: room to spare.`,
      tone: 'success',
    },
    { term: 'on pace', text: `use is within ${PACE_BAND} points of the clock.` },
    { term: 'used up', text: 'nothing is left until the window resets.', tone: 'error' },
    {
      term: 'blocked',
      text: `the provider itself reports a status for the window, such as rate-limited${statuses.length > 0 ? ` (now: ${statuses.join(', ')})` : ''}. Requests may be refused until it resets.`,
      tone: 'error',
    },
    { term: 'just started', text: 'less than 2% of the window has passed, too early to compare.' },
    {
      term: 'reset due',
      text: 'the reset time has passed; the next check will bring the new window.',
    },
    { term: '≈', text: 'the length is assumed, not reported (a month is taken as 30 days).' },
    {
      term: 'stale',
      text: 'the last check failed; the numbers are kept and shown with their age. After five minutes they are hidden.',
    },
    {
      term: '›  ‹',
      text: 'in the footer: show the windows that are collapsed, or collapse them again.',
    },
  );
}

function observationFacts(snapshot: Snapshot, now: number, label: string | undefined): Block {
  const at = snapshot.quotaFreshness?.observedAt;
  return facts(
    { label: 'Source', value: label ?? 'response headers' },
    {
      label: 'Observed',
      value: at === undefined ? 'unknown' : `${formatDuration(Math.max(0, now - at))} ago`,
      ...(snapshot.quotaStatus === 'quota stale' ? { tone: 'warning' as const } : {}),
    },
    {
      label: 'Checked',
      value: `at most every ${PROVIDER_QUOTA_INTERVAL_MS / 1000} s`,
      note: 'one request shared by every Pi window',
    },
    {
      label: 'Hidden after',
      value: formatDuration(QUOTA_MAX_AGE_MS),
      note: 'without a successful check',
    },
  );
}

function status(snapshot: Snapshot, windows: readonly RateLimitWindow[]): Status {
  if (windows.length > 0)
    return snapshot.quotaStatus === 'quota stale'
      ? { available: true, text: 'showing the last check (stale)' }
      : { available: true, text: 'available' };
  return { available: false, text: snapshot.quotaStatus ?? 'no limit windows reported' };
}

export const quota: Explainer = {
  id: 'quota',
  title: 'Limit usage',
  reports: [
    'For each limit window the provider publishes (5h, week, month): the share left, when it resets, and whether use is ahead of or behind the clock.',
    "The numbers are the provider's own, fetched with your sign-in at most every 30 seconds for all Pi windows together; Footer Dock never estimates a percentage.",
    'Pace compares use with the time passed in the window. It is a comparison, not a forecast.',
  ],
  missingWhen: [
    'The provider has no limit source yet: the footer says quota unsupported.',
    'The first reply has not arrived (quota loading), or the sign-in was rejected (quota auth rejected).',
    'The last successful check is older than five minutes, or the endpoint changed shape: windows are hidden rather than guessed.',
    'A window the provider does not report is simply not listed.',
  ],
  build({ snapshot, now, quotaLabel }: ExplainContext): Explained {
    const windows = snapshot.rateLimits?.windows ?? [];
    const rows = windows.map((window) => ({ window, pace: paceOf(window, now) }));
    const heads =
      windows.length > 0 ? [meters(...rows.map(({ window, pace }) => meterRow(window, pace)))] : [];
    return {
      headline: heads,
      body:
        windows.length === 0
          ? [note(quotaHelp(snapshot, quotaLabel))]
          : [
              heading('Pace'),
              table(
                ['Window', 'Left', 'Resets in', 'Clock', 'Pace'],
                rows.map(({ window, pace }) => tableRow(window, pace, now)),
                [1, 2, 3],
              ),
              bullets(...projectionBullets(windows, now)),
              gap,
              heading('Observation'),
              observationFacts(snapshot, now, quotaLabel),
              gap,
              heading('What the markers mean'),
              legend(windows),
            ],
      status: status(snapshot, windows),
    };
  },
};
