import { facts } from './blocks.js';
import type { Fact } from './blocks.js';
import type { Explained, ExplainContext, Explainer } from './explainer.js';

/** An explainer for a value that is a few facts and a status; the catalogue is a table of these. */
export interface SimpleItem {
  id: string;
  title: string;
  reports: readonly string[];
  missingWhen: readonly string[];
  /** The facts to show, or none; computed from the snapshot. */
  facts?: (context: ExplainContext) => Fact[];
  /** The reason the value is missing right now, or undefined when it is available. */
  missing?: (context: ExplainContext) => string | undefined;
}

export function simpleExplainer(item: SimpleItem): Explainer {
  return {
    id: item.id,
    title: item.title,
    reports: item.reports,
    missingWhen: item.missingWhen,
    build(context): Explained {
      const reason = item.missing?.(context);
      const rows = item.facts?.(context) ?? [];
      return {
        headline: [facts({ label: 'Shows', value: context.value || 'nothing right now' })],
        body: rows.length > 0 ? [facts(...rows)] : [],
        status: reason
          ? { available: false, text: reason }
          : { available: true, text: 'available' },
      };
    },
  };
}
