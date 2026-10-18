import { stripVTControlCharacters } from 'node:util';
import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';

interface View {
  render(width: number): string[];
  handleInput(data: string): void;
}
const theme = {
  fg: (_c: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

/** A fake Pi: the pieces a picker feature touches, recording what it calls. */
export function fakePi(options: {
  models?: { provider: string; id: string; name: string; reasoning?: boolean }[];
  current?: {
    provider: string;
    id: string;
    name: string;
    reasoning?: boolean;
    thinkingLevelMap?: Record<string, unknown>;
  };
  level?: string;
  settings?: Record<string, unknown>;
  setModelResult?: boolean;
}) {
  const calls = { setModel: [] as string[], setLevel: [] as string[], notices: [] as string[] };
  const state = { view: undefined as View | undefined, opened: 0 };
  const pi = {
    getSettings: () => options.settings ?? {},
    setModel: (model: { provider: string; id: string }) => {
      calls.setModel.push(`${model.provider}/${model.id}`);
      return Promise.resolve(options.setModelResult ?? true);
    },
    getThinkingLevel: () => options.level ?? 'medium',
    setThinkingLevel: (level: string) => {
      calls.setLevel.push(level);
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    model: options.current,
    modelRegistry: { getAvailable: () => options.models ?? [] },
    ui: {
      notify: (message: string) => calls.notices.push(message),
      custom: (factory: (...args: unknown[]) => View) =>
        new Promise((resolve) => {
          state.opened += 1;
          state.view = factory({ terminal: { rows: 30 } }, theme, undefined, resolve);
        }),
    },
  } as unknown as ExtensionContext;
  const screen = (): string => stripVTControlCharacters((state.view?.render(80) ?? []).join('\n'));
  const press = (...keys: string[]): void => {
    for (const key of keys) state.view?.handleInput(key);
  };
  return { pi, ctx, calls, screen, press, opened: () => state.opened };
}
