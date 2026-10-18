import { costLabel, hasCost } from '../../api-cost.js';
import type { ApiCostEstimate, CostReason } from '../../api-cost.js';
import type { CostBreakdown, CostRow } from '../../cost-breakdown.js';
import { formatTokens, safeLabel } from '../../model.js';
import type { CostParts } from '../../response-price.js';
import { bullets, facts, gap, heading, note, stack, table } from '../blocks.js';
import type { Block, Fact } from '../blocks.js';
import type { Explained, Explainer, Status } from '../explainer.js';
import { costHistory, headlineFact } from './history-sections.js';
import { money } from './money.js';

const perMillion = (dollars: number, tokens: number): string =>
  tokens > 0 ? `${money((dollars / tokens) * 1_000_000)}/M` : '—';
const count = (value: number): string => value.toLocaleString('en-US');
const share = (part: number, whole: number): string =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
const sumOf = (parts: CostParts): number =>
  parts.input + parts.output + parts.cacheRead + parts.cacheWrite;

const CATEGORIES = [
  ['input', 'Uncached input', 'accent'],
  ['cacheRead', 'Cache read', 'success'],
  ['cacheWrite', 'Cache write', 'muted'],
  ['output', 'Output', 'warning'],
] as const;

const REASONS: Record<CostReason, string> = {
  'missing-model-price': "the model has no price in Pi's registry",
  'zero-price': 'a flat-rate or unpriced model (its price is zero, which is not the same as free)',
  'unassigned-model': 'a compaction or summary entry that carries tokens but no model',
  'missing-usage': 'a response with no usage recorded',
  'invalid-usage': 'a response with unusable usage',
  'duplicate-entry': 'a session entry that appears twice with different usage',
  'invalid-entry': 'a session entry without an identity',
  overflow: 'a total too large to add up safely',
};

function categoryTable(row: CostRow): Block {
  const total = sumOf(row.parts);
  const rows = CATEGORIES.filter(([key]) => row.tokens[key] > 0 || row.parts[key] > 0).map(
    ([key, name]) => [
      name,
      count(row.tokens[key]),
      perMillion(row.parts[key], row.tokens[key]),
      money(row.parts[key]),
      share(row.parts[key], total),
    ],
  );
  return table(['Category', 'Tokens', 'Per million', 'Dollars', 'Share'], rows, [1, 2, 3, 4]);
}
function modelTable(models: CostBreakdown['models'], total: number): Block {
  const rows = Object.entries(models)
    .map(([name, row]) => ({ name, row, dollars: sumOf(row.parts) }))
    .sort((a, b) => b.dollars - a.dollars)
    .map(({ name, row, dollars }) => [
      safeLabel(name),
      count(row.responses),
      formatTokens(
        row.tokens.input + row.tokens.cacheRead + row.tokens.cacheWrite + row.tokens.output,
        'decimal',
      ),
      money(dollars),
      share(dollars, total),
    ]);
  return table(['Model', 'Responses', 'Tokens', 'Dollars', 'Share'], rows, [1, 2, 3, 4]);
}
function workedExample(breakdown: CostBreakdown): Block[] {
  const latest = breakdown.latest;
  if (!latest) return [];
  const lines = CATEGORIES.filter(([key]) => latest.tokens[key] > 0).map(([key, name]) => ({
    text: `${count(latest.tokens[key])} ${name.toLowerCase()} × ${perMillion(latest.parts[key], latest.tokens[key])} = ${money(latest.parts[key])}`,
  }));
  const how =
    latest.basis === 'reported' ? 'the cost Pi recorded for it' : "repriced from Pi's registry";
  return [
    heading('Latest response'),
    note(`${safeLabel(latest.model)}: ${money(sumOf(latest.parts))} (${how}).`),
    bullets(...lines),
  ];
}
function leftOut(estimate: ApiCostEstimate): Block[] {
  const reasons = Object.entries(estimate.reasons ?? {}) as [CostReason, number][];
  if (estimate.unavailable === 0 || reasons.length === 0) return [];
  return [
    gap,
    heading('Left out'),
    note(
      `${estimate.unavailable} of ${estimate.responses} recorded entries could not be priced. They are not counted as free.`,
    ),
    bullets(...reasons.map(([reason, n]) => ({ term: String(n), text: REASONS[reason] }))),
  ];
}

function status(estimate: ApiCostEstimate | undefined, history: boolean): Status {
  if (!estimate || estimate.responses === 0)
    return history
      ? { available: true, text: 'nothing in this session yet; the history below is shown' }
      : { available: false, text: 'no recorded usage yet' };
  if (hasCost(estimate))
    return estimate.coverage === 'partial'
      ? {
          available: true,
          text: `partial: ${estimate.pricedResponses ?? 0} of ${estimate.responses} entries priced`,
        }
      : { available: true, text: 'available' };
  if (estimate.coverage === 'partial')
    return {
      available: false,
      text: 'the priced part is under one cent, so the footer shows nothing',
    };
  return { available: false, text: 'no entry could be priced' };
}

function sessionFact(estimate: ApiCostEstimate | undefined, priced: boolean): Fact {
  const partial = estimate?.coverage === 'partial';
  const label = partial
    ? `at least ${money(estimate.pricedAmount ?? 0)}`
    : hasCost(estimate)
      ? costLabel(estimate)
      : 'nothing to show';
  return { label: 'This session', value: label, note: priced ? 'at API prices' : '' };
}
function categoryBar(breakdown: CostBreakdown): Block {
  return stack(
    ...CATEGORIES.map(([key, name, tone]) => ({
      label: name.toLowerCase(),
      amount: breakdown.total.parts[key],
      tone,
      text: money(breakdown.total.parts[key]),
    })),
  );
}
function pricedBody(breakdown: CostBreakdown): Block[] {
  return [
    heading('Where it goes'),
    categoryTable(breakdown.total),
    gap,
    heading('By model'),
    modelTable(breakdown.models, sumOf(breakdown.total.parts)),
    gap,
    ...workedExample(breakdown),
  ];
}
function priceSources(estimate: ApiCostEstimate | undefined): Block {
  const by = estimate?.pricedBy ?? { reported: 0, registry: 0 };
  return facts({
    label: 'Priced from',
    value: `Pi's recorded cost for ${by.reported}, registry for ${by.registry}`,
    note: 'responses',
  });
}

export const cost: Explainer = {
  id: 'cost',
  title: 'Cost',
  reports: [
    "What the tokens of this session would cost at API prices: uncached input, cache reads, cache writes and output, each at the model's own price.",
    "Not what you were charged: a subscription or flat-rate plan bills differently. The prices are Pi's: the cost Pi recorded for each response, or its registry price when Pi recorded none.",
    'Footer: ≈$3.14 is the whole session; ≈$3.14+ is a lower bound because some entries could not be priced; nothing is shown while the priced part is under one cent.',
  ],
  missingWhen: [
    'No response has been recorded yet.',
    "The model has no price in Pi's registry, or its price is zero (flat-rate plans): those responses are left out, not counted as free.",
    'Compaction and summary entries carry tokens but no model, so they cannot be priced.',
  ],
  periods: true,
  build({ snapshot, now, period }): Explained {
    const estimate = snapshot.apiCostEstimate;
    const breakdown = estimate?.breakdown;
    const priced = breakdown !== undefined && breakdown.total.responses > 0;
    return {
      headline: [
        facts(
          sessionFact(estimate, priced),
          ...headlineFact(snapshot.history, period ?? 'month', new Date(now)),
        ),
        ...(priced ? [categoryBar(breakdown)] : []),
      ],
      body: [
        ...(priced ? pricedBody(breakdown) : []),
        ...(priced ? [priceSources(estimate)] : []),
        ...(estimate ? leftOut(estimate) : []),
        ...(snapshot.history
          ? costHistory(snapshot.history, period ?? 'month', new Date(now))
          : []),
      ],
      status: status(estimate, snapshot.history !== undefined),
    };
  },
};
