import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { showAhead } from './features/ahead.js';
import { showBranches } from './features/branches.js';
import { showChangedFiles } from './features/changed-files.js';
import { pickModel } from './features/pickers/model-picker.js';
import { pickThinking } from './features/pickers/thinking-picker.js';

type Action = (ctx: ExtensionContext) => Promise<void>;

/**
 * What clicking an item's icon does, besides the folder (which needs the user's opener setting).
 * This is the only place an icon is bound to an action: when Pi offers its own model or thinking
 * screens to extensions, replacing those two entries is the whole change.
 */
export function createIconActions(pi: ExtensionAPI): ReadonlyMap<string, Action> {
  return new Map<string, Action>([
    ['model', (ctx) => pickModel(pi, ctx)],
    ['thinking', (ctx) => pickThinking(pi, ctx)],
    ['branch', showBranches],
    ['changes', showChangedFiles],
    ['ahead', showAhead],
  ]);
}
