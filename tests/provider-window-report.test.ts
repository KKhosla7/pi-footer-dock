import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCodexUsage } from '../src/core/rate-limits.js';
import type { WindowReport } from '../src/core/window-report.js';
import { parseClinePassLimits } from '../src/quota-sources/clinepass.js';
import { parseOpenCodeGoUsage } from '../src/quota-sources/opencode-go.js';
import {
  CLINE,
  clineBody,
  context,
  goBody,
  harness,
  left,
  reply,
  until,
} from './support/provider-quota-harness.js';

/**
 * `/dock-debug` says what became of every window a
 * provider sent, so a dropped window is visible. Names and yes/no only, never provider text.
 */
const MARKER = 'PROVIDER-TEXT-MARKER';
const collect = <T>(run: (observe: (report: WindowReport) => void) => T) => {
  const reports: WindowReport[] = [];
  const result = run((report) => reports.push(report));
  return { reports, result };
};
const FUTURE = '2099-01-01T00:00:00.000Z';

await test('ClinePass: every window of a good reply is reported as kept', () => {
  const { reports } = collect((observe) => parseClinePassLimits(clineBody(Date.now()), observe));
  assert.deepEqual(reports, [
    { type: '5h', sent: true, share: true, reset: true, kept: true },
    { type: 'week', sent: true, share: true, reset: true, kept: true },
    { type: 'month', sent: true, share: true, reset: true, kept: true },
  ]);
});

await test('ClinePass: a window without a valid reset is reported with the reason, never with its values', () => {
  const body = {
    data: {
      limits: [
        { type: 'five_hour', percentUsed: 12, resetsAt: MARKER },
        { type: 'weekly', percentUsed: 150, resetsAt: FUTURE },
        { type: MARKER, percentUsed: 1, resetsAt: FUTURE },
        { type: 'monthly', percentUsed: 47, resetsAt: FUTURE },
      ],
    },
  };
  const { reports, result } = collect((observe) => parseClinePassLimits(body, observe));
  assert.deepEqual(reports, [
    { type: '5h', sent: true, share: true, reset: false, kept: false },
    { type: 'week', sent: true, share: false, reset: true, kept: false },
    { type: 'unrecognized', sent: true, kept: false },
    { type: 'month', sent: true, share: true, reset: true, kept: true },
  ]);
  assert.deepEqual(
    result?.map((window) => window.label),
    ['month'],
  );
  assert.ok(!JSON.stringify(reports).includes(MARKER), 'no provider text in the report');
});

await test('the parse result is the same with and without a report', () => {
  const body = clineBody(Date.now());
  assert.deepEqual(
    parseClinePassLimits(body),
    collect((observe) => parseClinePassLimits(body, observe)).result,
  );
  const go = goBody(Date.now());
  assert.deepEqual(
    parseOpenCodeGoUsage(go),
    collect((observe) => parseOpenCodeGoUsage(go, observe)).result,
  );
});

await test('OpenCode Go: a window the reply does not hold is reported as not sent', () => {
  const body = { usage: { rolling: { status: 'ok', percent: 3, resetsAt: FUTURE } } };
  const { reports } = collect((observe) => parseOpenCodeGoUsage(body, observe));
  assert.deepEqual(reports, [
    { type: '5h', sent: true, share: true, reset: true, kept: true },
    { type: 'week', sent: false, kept: false },
    { type: 'month', sent: false, kept: false },
  ]);
});

await test('Codex: each window reports its share, reset time and length; a missing one is not sent', () => {
  const reset = Math.floor(Date.now() / 1000) + 3600;
  const body = {
    rate_limit: {
      primary_window: { used_percent: 20, reset_at: reset, limit_window_seconds: 18_000 },
      secondary_window: { used_percent: 40, reset_at: MARKER, limit_window_seconds: 0 },
    },
  };
  const { reports } = collect((observe) => parseCodexUsage('openai-codex', '', body, observe));
  assert.deepEqual(reports, [
    { type: 'primary', sent: true, share: true, reset: true, span: true, kept: true },
    { type: 'secondary', sent: true, share: true, reset: false, span: false, kept: false },
  ]);
  const none = collect((observe) => parseCodexUsage('openai-codex', '', {}, observe)).reports;
  assert.deepEqual(none, [
    { type: 'primary', sent: false, kept: false },
    { type: 'secondary', sent: false, kept: false },
  ]);
  assert.ok(!JSON.stringify([reports, none]).includes(MARKER));
});

await test('/dock-debug data: the service keeps the report of the last reply it read', async (t) => {
  const h = harness(t, (_n, clock) =>
    reply({
      data: {
        limits: [
          { type: 'five_hour', percentUsed: 6, resetsAt: MARKER },
          {
            type: 'weekly',
            percentUsed: 52,
            resetsAt: new Date(clock + 286_960_000).toISOString(),
          },
        ],
      },
    }),
  );
  const service = h.service();
  assert.equal(service.diagnostics().windowReport, null, 'nothing before a request');
  service.refresh(context('clinepass', CLINE).ctx);
  await until(() => h.last()?.limits !== null && h.last()?.limits !== undefined);
  assert.deepEqual(left(h.last()), [48], 'only the valid window is shown');
  const { windowReport } = service.diagnostics();
  assert.deepEqual(windowReport?.windows, [
    { type: '5h', sent: true, share: true, reset: false, kept: false },
    { type: 'week', sent: true, share: true, reset: true, kept: true },
  ]);
  assert.equal(typeof windowReport.at, 'number');
  assert.ok(!JSON.stringify(service.diagnostics()).includes(MARKER));
});

await test('/dock-debug data: a failed request leaves no report, and a reply that holds no window reports each as dropped', async (t) => {
  const failing = harness(t, () => reply({}, { status: 500 }));
  const service = failing.service();
  service.refresh(context('clinepass', CLINE).ctx);
  await until(() => service.diagnostics().httpStatus === 500);
  assert.equal(service.diagnostics().windowReport, null);

  const empty = harness(t, () => reply({ data: { limits: [{ type: 'five_hour' }] } }));
  const second = empty.service();
  second.refresh(context('clinepass', CLINE).ctx);
  await until(() => second.diagnostics().failure === 'invalid-response');
  assert.deepEqual(second.diagnostics().windowReport?.windows, [
    { type: '5h', sent: true, share: false, reset: false, kept: false },
  ]);
});
