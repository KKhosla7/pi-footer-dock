import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { slotHelp, slotOptions } from './core/footer-config.js';
import type { FooterConfig } from './core/footer-config.js';
import type { Snapshot } from './core/model.js';
import { extensionExplainer } from './core/ext/explain.js';
import type { ExtensionRegistry } from './core/ext/registry.js';
import { compose, fallbackDoc } from './core/explain/explainer.js';
import type { ExplainContext, ExplainDoc } from './core/explain/explainer.js';
import { explainerFor } from './core/explain/registry.js';
import { quotaSourceFor } from './quota-sources/registry.js';
import { itemText } from './core/settings-text.js';
import { portableGlyphs } from './ui/glyphs.js';
import type { Period } from './core/history/period.js';
import type { Glyphs } from './ui/glyphs.js';
import { renderSegment } from './ui/segments.js';

interface DocContext {
  config: FooterConfig;
  snapshot: Snapshot;
  glyphs: Glyphs;
  now?: number;
  period?: Period;
  extensions?: ExtensionRegistry;
}

/** What an explainer may look at: the item as the footer draws it, the snapshot, the time. */
function explainContext(id: string, context: DocContext): ExplainContext {
  const { config, snapshot, glyphs } = context;
  const value = renderSegment(
    id,
    snapshot,
    // An explanation lists everything: a collapsed quota would leave its last window out.
    {
      paint: (text) => text,
      glyphs,
      quotaExpanded: true,
      ...(context.extensions ? { extensions: context.extensions } : {}),
    },
    { config, look: 'xl' },
  );
  return {
    snapshot,
    now: context.now ?? Date.now(),
    ...(context.period ? { period: context.period } : {}),
    value: stripTerminalSequences(value.text).trim(),
    ascii: glyphs.folder === portableGlyphs.folder,
    ...quotaLabelOf(snapshot),
  };
}

/**
 * The item's explanation as blocks, for the current snapshot and time; undefined for an item that
 * is not in the footer. A slot with its own configured help keeps that text.
 */
export function explainDoc(id: string, context: DocContext): ExplainDoc | undefined {
  const { config } = context;
  const external = context.extensions?.find(id);
  if (!external && !config.rows.some((row) => [...row.left, ...row.right].includes(id)))
    return undefined;
  const at = explainContext(id, context);
  if (external) return compose(extensionExplainer(external), at);
  const custom = slotOptions(config, id).help;
  const explainer = custom === undefined ? explainerFor(id) : undefined;
  if (explainer) return compose(explainer, at);
  const help =
    custom ??
    slotHelp.get(id) ??
    'Custom footer slot. Its text and action binding are configured for this session.';
  return fallbackDoc(itemText.get(id)?.label ?? id, at, help);
}

function quotaLabelOf(snapshot: Snapshot): { quotaLabel?: string } {
  const label = quotaSourceFor(snapshot.provider)?.label;
  return label === undefined ? {} : { quotaLabel: label };
}
