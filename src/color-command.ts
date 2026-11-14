import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  COLOR_TONES,
  colorWords,
  effectiveColors,
  isColorTone,
  isHexColor,
  withColor,
} from './core/colors.js';
import type { DockRuntime } from './runtime.js';
import { withoutSetting } from './core/settings.js';
import type { Settings } from './core/settings.js';
import type { SettingsController } from './settings-controller.js';
import { say } from './notify.js';
import { nerdGlyphs } from './ui/glyphs.js';
import { FLOOR } from './ui/palette.js';

const NERD_BOLD =
  'Bold does not show on Nerd Font icons (their symbols have one weight); it applies to the plain icons, /dock-glyphs.';

const USAGE = `Usage: /dock-color <${COLOR_TONES.join('|')}> <#rrggbb|default|word>, /dock-color bold <on|off>, /dock-color reset`;

function describe(settings: SettingsController, background: string): string {
  const colors = effectiveColors(settings.current, settings.current.slots.quota?.meterColor);
  const lines = COLOR_TONES.map(
    (tone) => `${tone}: ${colors[tone] ?? 'default'}  (${colorWords(tone).join(', ')} or #rrggbb)`,
  );
  const bold = `icons bold: ${settings.current.iconBold === false ? 'off' : 'on'}`;
  return [...lines, bold, background, USAGE].join('\n');
}

type Outcome = { next: Settings; message: string } | { refused: string };

function planBold(value: string, settings: Settings): Outcome {
  if (value !== 'on' && value !== 'off') return { refused: USAGE };
  const rest = withoutSetting(settings, 'iconBold');
  return {
    next: value === 'on' ? rest : { ...rest, iconBold: false },
    message: `Bold icons: ${value}.`,
  };
}

function planTone(tone: string, value: string, settings: Settings): Outcome {
  if (!isColorTone(tone)) return { refused: `unknown colour "${tone.slice(0, 32)}". ${USAGE}` };
  try {
    const colors = withColor(settings.colors ?? {}, tone, value);
    const rest = withoutSetting(settings, 'colors');
    const next = Object.keys(colors).length > 0 ? { ...rest, colors } : rest;
    return { next, message: `${tone} colour: ${colors[tone] ?? 'default'}.` };
  } catch (error) {
    return { refused: (error as Error).message };
  }
}

function plan(args: string[], settings: Settings): Outcome {
  const [first, second, ...extra] = args;
  if (first === 'reset')
    return {
      next: withoutSetting(settings, 'colors'),
      message: 'Colours are back to their defaults.',
    };
  if (first === undefined || second === undefined || extra.length > 0) return { refused: USAGE };
  return first === 'bold' ? planBold(second, settings) : planTone(first, second, settings);
}

function hardToRead(
  words: string[],
  contrastOf: (hex: string) => number | undefined,
): string | undefined {
  const [tone, value] = words;
  if (tone === undefined || value === undefined || !isColorTone(tone) || !isHexColor(value)) return;
  const ratio = contrastOf(value);
  if (ratio === undefined || ratio >= FLOOR[tone]) return;
  return `That colour is hard to read on your terminal background (contrast ${ratio.toFixed(1)}:1; ${FLOOR[tone]}:1 or more reads well). It is saved; /dock-color ${tone} default undoes it.`;
}

export function runColor(
  args: string,
  ctx: ExtensionContext,
  settings: SettingsController,
  footer: {
    redraw: () => void;
    contrastOf: (hex: string) => number | undefined;
    describeBackground: () => string;
  },
): void {
  const words = args.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    say(ctx, describe(settings, footer.describeBackground()), 'info');
    return;
  }
  const outcome = plan(words, settings.current);
  if ('refused' in outcome) {
    say(ctx, `Not changed: ${outcome.refused}`, 'warning');
    return;
  }
  const failure = settings.update(outcome.next);
  footer.redraw();
  say(ctx, outcome.message, 'info');
  if (words[0] === 'bold' && words[1] === 'on' && settings.glyphs === nerdGlyphs)
    say(ctx, NERD_BOLD, 'info');
  if (failure) say(ctx, failure, 'warning');
  const hard = hardToRead(words, footer.contrastOf);
  if (hard) say(ctx, hard, 'warning');
}

export function registerColorCommand(pi: ExtensionAPI, runtime: DockRuntime): void {
  pi.registerCommand('dock-color', {
    description:
      'Footer colours: /dock-color accent #b4a0e5, /dock-color bold on, /dock-color reset (no arguments lists them)',
    handler: (args, ctx) => {
      runColor(args, ctx, runtime.settings, runtime.colours);
      return Promise.resolve();
    },
  });
}
