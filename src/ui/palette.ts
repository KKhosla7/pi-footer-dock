import type { Theme } from '@earendil-works/pi-coding-agent';

export type Tone = 'muted' | 'text' | 'yellow' | 'red' | 'green' | 'lavender' | 'cyan';
export type Paint = (text: string, tone?: Tone, emphasis?: 'bold' | 'underline') => string;

type ThemePaint = Pick<Theme, 'fg' | 'bold' | 'underline'>;

const token = {
  muted: 'dim',
  text: 'text',
  yellow: 'warning',
  red: 'error',
  green: 'success',
  lavender: 'accent',
  cyan: 'accent',
} as const;

/** Theme-native text with configurable quota lavender; never impose a background. */
export function createPaint(theme: ThemePaint): Paint {
  return (text, tone = 'text', emphasis) => {
    const colored =
      tone === 'lavender'
        ? `\u001b[38;2;180;160;229m${text}\u001b[39m`
        : theme.fg(token[tone], text);
    if (emphasis === 'bold') return theme.bold(colored);
    if (emphasis === 'underline') return theme.underline(colored);
    return colored;
  };
}
