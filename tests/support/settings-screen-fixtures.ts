import { stripVTControlCharacters } from 'node:util';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';

export const flat = (lines: string[]) =>
  lines.map((line) => stripVTControlCharacters(line)).join('\n');

export interface Input {
  handleInput(data: string): void;
}
/** A context whose custom screen hands back the component and lets the test close it. */
export function fakeContext() {
  const colours: string[] = [];
  /** Stands in for Pi's theme: text unchanged, but every colour asked for is recorded. */
  const theme = {
    fg: (colour: string, text: string) => {
      colours.push(colour);
      return text;
    },
    bold: (text: string) => text,
  };
  const state: {
    component?: Component & Input;
    closed: boolean;
    theme: unknown;
    colours: string[];
  } = {
    closed: false,
    theme,
    colours,
  };
  const ctx = {
    ui: {
      custom: (factory: (...args: unknown[]) => Component & Input) =>
        new Promise<void>((resolve) => {
          state.component = factory(undefined, state.theme, undefined, () => {
            state.closed = true;
            resolve();
          });
        }),
    },
  } as unknown as ExtensionContext;
  return { ctx, state };
}

/** Moves down until the selected row (marked with an arrow) is the one called `label`. */
export function selectRow(component: Component & Input, label: string, width = 100): void {
  for (let step = 0; step < 30; step += 1) {
    const selected = flat(component.render(width))
      .split('\n')
      .find((line) => line.trimStart().startsWith('→'));
    if (selected?.includes(label)) return;
    component.handleInput('\u001b[B');
  }
  throw new Error(`no row called ${label}`);
}
