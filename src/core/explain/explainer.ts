import type { Period } from '../history/period.js';
import type { Snapshot } from '../model.js';
import { bullets, facts, gap, heading, note } from './blocks.js';
import type { Block } from './blocks.js';

/** Everything an explainer may look at: data already held, never a file, command or request. */
export interface ExplainContext {
  snapshot: Snapshot;
  /** Epoch milliseconds, injected so a test controls time. */
  now: number;
  /** The item as the footer draws it, as plain text; empty when it is not drawn. */
  value: string;
  /** True with the portable glyph set. */
  ascii: boolean;
  /** The name of the provider's quota source, when the provider has one. */
  quotaLabel?: string;
  /** The period a screen with a period switch is showing; the month when absent. */
  period?: Period;
}
/** The live line `Now: ...`: whether the value exists right now, and if not, why. */
export interface Status {
  available: boolean;
  text: string;
}
export interface Explained {
  /** Pinned above the scrolling part; keep it to a row or two. */
  headline: Block[];
  body: Block[];
  status: Status;
}
/** One footer item's explanation. `reports` and `missingWhen` are required for every item. */
export interface Explainer {
  id: string;
  title: string;
  /** What kind of data the value is: its unit, source and scope. */
  reports: readonly string[];
  /** Every condition that makes the value absent or unknown. */
  missingWhen: readonly string[];
  /** The screen has a period switch (d, w, m). */
  periods?: boolean;
  build(context: ExplainContext): Explained;
}
export interface ExplainDoc {
  title: string;
  /** The screen has a period switch (d, w, m). */
  periods?: boolean;
  /** The item as the footer draws it, as plain text. */
  value: string;
  headline: Block[];
  body: Block[];
}

/** The standard frame around an item's own blocks: the `Now:` line, what it reports, when missing. */
export function compose(explainer: Explainer, context: ExplainContext): ExplainDoc {
  const { headline, body, status } = explainer.build(context);
  const now = note(`Now: ${status.text}`, status.available ? 'success' : 'warning');
  return {
    title: explainer.title,
    ...(explainer.periods ? { periods: true } : {}),
    value: context.value,
    // Air above and below the status line, so the value, the status and the detail read apart.
    headline: [...headline, gap, now, gap],
    body: [
      ...body,
      ...(body.length > 0 ? [gap] : []),
      heading('What it reports'),
      bullets(...explainer.reports.map((text) => ({ text }))),
      gap,
      heading('Can be missing when'),
      bullets(...explainer.missingWhen.map((text) => ({ text }))),
    ],
  };
}

/** For a slot the extension has no explainer for (a custom one): its value and its help text. */
export function fallbackDoc(title: string, context: ExplainContext, help: string): ExplainDoc {
  return {
    title,
    value: context.value,
    headline: [facts({ label: 'Shows', value: context.value || 'not currently available' })],
    body: [note(help)],
  };
}
