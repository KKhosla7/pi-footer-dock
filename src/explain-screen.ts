import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { renderBlocks } from './core/explain/render.js';
import type { Block } from './core/explain/blocks.js';
import type { ExplainDoc } from './core/explain/explainer.js';
import type { Period } from './core/history/period.js';
import { openInfoScreen } from './ui/info-screen.js';
import { plainStyle, themeStyle } from './ui/explain-style.js';

const TEXT_WIDTH = 100;
const GONE: ExplainDoc = {
  title: 'Item',
  value: '',
  headline: [],
  body: [{ kind: 'note', text: 'This item is no longer in the footer.' }],
};

/** The explanation as text, for a notice (the keyboard path) and for tests. */
export function explainText(doc: ExplainDoc, ascii = false): string {
  return renderBlocks([...doc.headline, ...doc.body], plainStyle, TEXT_WIDTH, ascii)
    .map((line) => line.trimEnd())
    .join('\n');
}

/**
 * The explanation as a live screen: `current` is asked on every repaint, so times and values move
 * while it is open. The headline stays pinned; the body scrolls. A screen with a period switch
 * (cost, cache) gets the keys d, w and m, and shows what they do in its hint.
 */
export async function openExplainScreen(
  ctx: ExtensionContext,
  screen: {
    title: string;
    current: (period: Period) => ExplainDoc | undefined;
    ascii: () => boolean;
    /** The period shown first by a screen with a period switch. */
    initial?: Period;
  },
): Promise<void> {
  const { title, current, ascii } = screen;
  let period: Period = screen.initial ?? 'month';
  const draw =
    (pick: (doc: ExplainDoc) => Block[]) =>
    (theme: Parameters<typeof themeStyle>[0], width: number) =>
      renderBlocks(pick(current(period) ?? GONE), themeStyle(theme), width, ascii());
  const choose = (next: Period) => () => {
    period = next;
  };
  const switchable = current(period)?.periods === true;
  await openInfoScreen(ctx, {
    title: `About ${title}`,
    live: true,
    header: draw((doc) => doc.headline),
    lines: draw((doc) => doc.body),
    ...(switchable
      ? { keys: { d: choose('day'), w: choose('week'), m: choose('month') }, hint: 'd/w/m period' }
      : {}),
  });
}
