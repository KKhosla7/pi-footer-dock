import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { renderBlocks } from './core/explain/render.js';
import type { Block } from './core/explain/blocks.js';
import { problemBlocks, problemsHeader } from './core/problems-view.js';
import type { ProblemState } from './problem-state.js';
import { themeStyle } from './ui/explain-style.js';
import { openInfoScreen } from './ui/info-screen.js';

/**
 * The screen that lists every configuration problem. Opening it is what stops the marker from
 * blinking. `r` reads the settings file again and applies it if it is now valid.
 */
export async function openProblemsScreen(
  ctx: ExtensionContext,
  deps: {
    state: ProblemState;
    reread: (ctx: ExtensionContext) => void;
    ascii: () => boolean;
    redraw: () => void;
  },
): Promise<void> {
  deps.state.acknowledge();
  deps.redraw();
  const draw =
    (pick: () => Block[]) =>
    (theme: Parameters<typeof themeStyle>[0], width: number): string[] =>
      renderBlocks(pick(), themeStyle(theme), width, deps.ascii());
  await openInfoScreen(ctx, {
    title: 'Settings problems',
    live: true,
    header: draw(() => problemsHeader(deps.state.problems)),
    lines: draw(() => problemBlocks(deps.state.problems)),
    keys: {
      r: () => {
        deps.reread(ctx);
      },
    },
    hint: 'r apply the fixed file',
  });
}
