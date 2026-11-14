import { Input, getKeybindings, parseColor } from '@earendil-works/pi-tui';
import type { Component, SettingsListTheme } from '@earendil-works/pi-tui';
import { isHexColor } from '../core/colors.js';
import type { ColorTone } from '../core/colors.js';
import { colourNotes, wordFor } from '../core/settings-labels.js';
import { FLOOR, contrast, luminanceOf } from './palette.js';
import type { Background } from './palette.js';

export interface PickerDeps {
  id: string;
  tone: ColorTone;
  choices: string[];
  current: string;
  theme: SettingsListTheme;
  swatch: (key: string) => string;
  background: () => Background | undefined;
  header: (width: number) => string[];
  footer: (width: number) => string[];
  choose: (key: string) => void;
  leave: (key?: string) => void;
}

const TYPE = 'type';
const HELP = 'Use # and six hex digits, like #b4a0e5.';

export function typedColour(text: string): string | undefined {
  const value = text.trim();
  const full = /^[0-9a-fA-F]{6}$/u.test(value) ? `#${value}` : value;
  return isHexColor(full) ? full : undefined;
}

export class ColourPicker implements Component {
  private index = 0;
  private typing = false;
  private readonly input: Input;

  constructor(private readonly deps: PickerDeps) {
    this.input = new Input({
      prompt: '  Colour as #rrggbb:  ',
      placeholder: '#b4a0e5',
      placeholderStyle: (text) => deps.theme.hint(text),
    });
    this.index = Math.max(0, deps.choices.indexOf(deps.current));
    this.input.onSubmit = (text) => {
      this.submit(text);
    };
    this.input.onEscape = () => {
      this.typing = false;
    };
  }

  private rows(): string[] {
    return [...this.deps.choices, TYPE];
  }
  private submit(text: string): void {
    const colour = typedColour(text);
    if (!colour) return;
    this.deps.choose(colour);
    this.deps.leave(colour);
  }
  private reads(colour: string): string {
    const background = this.deps.background();
    const preview = `${this.deps.swatch(colour)} preview   `;
    if (!background)
      return `${preview}contrast unknown: your terminal did not report its background`;
    const ratio = contrast(parseColor(colour), luminanceOf(background));
    const floor = FLOOR[this.deps.tone];
    const text = `contrast ${ratio.toFixed(1)}:1 on your terminal background`;
    return ratio >= floor
      ? `${preview}${text}`
      : `${preview}${text}: hard to read (${floor}:1 or more reads well). It is saved anyway.`;
  }

  render(width: number): string[] {
    const { theme } = this.deps;
    if (this.typing) {
      this.input.focused = true;
      const colour = typedColour(this.input.getValue());
      return [
        ...this.deps.header(width),
        ...this.input.render(width),
        `  ${colour ? this.reads(colour) : theme.hint(HELP)}`,
        '',
        theme.hint('  Enter to save · Esc to cancel'),
        ...this.deps.footer(width),
      ];
    }
    const rows = this.rows().map((key, at) => {
      const selected = at === this.index;
      const typeRow = key === TYPE;
      const word = typeRow
        ? '   Type a colour…'
        : `${this.deps.swatch(key)} ${wordFor(this.deps.id, key)}`;
      const tag =
        key === 'default'
          ? 'default'
          : key === this.deps.current && key.startsWith('#')
            ? 'yours'
            : '';
      return `${selected ? theme.cursor : '  '}${theme.label(word, selected)}  ${theme.value(tag, selected)}`;
    });
    const key = this.rows()[this.index] ?? '';
    const note = colourNotes[`${this.deps.tone}:${key}`];
    return [
      ...this.deps.header(width),
      ...rows,
      ...(note ? ['', theme.description(`  ${note}`)] : ['']),
      theme.hint('  Enter to choose · Esc to go back'),
      ...this.deps.footer(width),
    ];
  }

  handleInput(data: string): void {
    if (this.typing) {
      this.input.handleInput(data);
      return;
    }
    const keys = getKeybindings();
    const count = this.rows().length;
    if (keys.matches(data, 'tui.select.up')) this.index = (this.index + count - 1) % count;
    else if (keys.matches(data, 'tui.select.down')) this.index = (this.index + 1) % count;
    else if (keys.matches(data, 'tui.select.cancel')) this.deps.leave();
    else if (keys.matches(data, 'tui.select.confirm') || data === ' ') this.pick();
  }
  private pick(): void {
    const key = this.rows()[this.index];
    if (key === undefined) return;
    if (key === TYPE) {
      this.typing = true;
      this.input.setValue('');
      return;
    }
    this.deps.choose(key);
    this.deps.leave(key);
  }
  invalidate(): void {
    this.input.invalidate();
  }
}
