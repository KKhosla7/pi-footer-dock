import type { Period } from '../history/period.js';
import type { Snapshot } from '../model.js';
import { bullets, facts, gap, heading, note } from './blocks.js';
import type { Block } from './blocks.js';

export interface ExplainContext {
  snapshot: Snapshot;
  now: number;
  value: string;
  ascii: boolean;
  quotaLabel?: string;
  quotaShows?: 'left' | 'used';
  layers?: Record<string, boolean>;
  period?: Period;
}
export interface Status {
  available: boolean;
  text: string;
}
export interface Explained {
  headline: Block[];
  body: Block[];
  status: Status;
}
export interface Explainer {
  id: string;
  title: string;
  reports: readonly string[];
  missingWhen: readonly string[];
  periods?: boolean;
  build(context: ExplainContext): Explained;
}
export interface ExplainDoc {
  title: string;
  periods?: boolean;
  value: string;
  headline: Block[];
  body: Block[];
}

export function compose(explainer: Explainer, context: ExplainContext): ExplainDoc {
  const { headline, body, status } = explainer.build(context);
  const now = note(`Now: ${status.text}`, status.available ? 'success' : 'warning');
  return {
    title: explainer.title,
    ...(explainer.periods ? { periods: true } : {}),
    value: context.value,
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

export function fallbackDoc(title: string, context: ExplainContext, help: string): ExplainDoc {
  return {
    title,
    value: context.value,
    headline: [facts({ label: 'Shows', value: context.value || 'not currently available' })],
    body: [note(help)],
  };
}
