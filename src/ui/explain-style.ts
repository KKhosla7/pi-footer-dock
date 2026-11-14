import type { Theme } from '@earendil-works/pi-coding-agent';
import type { Style } from '../core/explain/render.js';

export function themeStyle(theme: Pick<Theme, 'fg' | 'bold'>): Style {
  return { fg: (tone, text) => theme.fg(tone, text), bold: (text) => theme.bold(text) };
}
export const plainStyle: Style = { fg: (_tone, text) => text, bold: (text) => text };
