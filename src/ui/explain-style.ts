import type { Theme } from '@earendil-works/pi-coding-agent';
import type { Style } from '../core/explain/render.js';

/** Pi's theme as the explain renderer's style: the same tones, drawn in the user's colours. */
export function themeStyle(theme: Pick<Theme, 'fg' | 'bold'>): Style {
  return { fg: (tone, text) => theme.fg(tone, text), bold: (text) => theme.bold(text) };
}
/** No colour at all, for the text form used by notices and tests. */
export const plainStyle: Style = { fg: (_tone, text) => text, bold: (text) => text };
