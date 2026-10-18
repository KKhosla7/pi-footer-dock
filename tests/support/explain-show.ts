import { compose } from '../../src/core/explain/explainer.js';
import type { Explainer } from '../../src/core/explain/explainer.js';
import { renderBlocks } from '../../src/core/explain/render.js';
import type { Snapshot } from '../../src/core/model.js';
import { plainStyle } from '../../src/ui/explain-style.js';

/** An explainer's screen as plain text, for assertions on what the reader sees. */
export function show(explainer: Explainer, snapshot: Snapshot, width = 100): string {
  const doc = compose(explainer, { snapshot, now: 0, value: '', ascii: false });
  return renderBlocks([...doc.headline, ...doc.body], plainStyle, width).join('\n');
}
