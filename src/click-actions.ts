import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { showAhead } from './features/ahead.js';
import { showBranches } from './features/branches.js';
import { showChangedFiles } from './features/changed-files.js';
import { pickModel } from './features/pickers/model-picker.js';
import { pickThinking } from './features/pickers/thinking-picker.js';

type Action = (ctx: ExtensionContext) => Promise<void>;

export function createIconActions(pi: ExtensionAPI): ReadonlyMap<string, Action> {
  return new Map<string, Action>([
    ['model', (ctx) => pickModel(pi, ctx)],
    ['thinking', (ctx) => pickThinking(pi, ctx)],
    ['branch', showBranches],
    ['changes', showChangedFiles],
    ['ahead', showAhead],
  ]);
}
