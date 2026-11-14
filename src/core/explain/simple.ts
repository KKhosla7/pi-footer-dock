import { facts } from './blocks.js';
import type { Fact } from './blocks.js';
import type { Explained, ExplainContext, Explainer } from './explainer.js';

export interface SimpleItem {
  id: string;
  title: string;
  reports: readonly string[];
  missingWhen: readonly string[];
  facts?: (context: ExplainContext) => Fact[];
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
