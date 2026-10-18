import { stripVTControlCharacters } from 'node:util';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';

interface View {
  render(width: number): string[];
  handleInput(data: string): void;
}
const theme = {
  fg: (_c: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

/** A fake Pi context that keeps each opened screen so the test can press keys in it. */
export function fakeContext(cwd: string, editor = '') {
  const screens: View[] = [];
  const done: ((value: unknown) => void)[] = [];
  const log = { notices: [] as string[], editor, set: [] as string[] };
  const ctx = {
    cwd,
    ui: {
      notify: (message: string) => log.notices.push(message),
      getEditorText: () => log.editor,
      setEditorText: (text: string) => log.set.push(text),
      custom: (factory: (...args: unknown[]) => View) =>
        new Promise((resolve) => {
          done.push(resolve);
          screens.push(
            factory(
              { terminal: { rows: 40 }, requestRender: () => undefined },
              theme,
              undefined,
              resolve,
            ),
          );
        }),
    },
  } as unknown as ExtensionContext;
  const text = (index = screens.length - 1) =>
    stripVTControlCharacters((screens[index]?.render(100) ?? []).join('\n'));
  const press = async (...keys: string[]): Promise<void> => {
    for (const key of keys) screens.at(-1)?.handleInput(key);
    await new Promise((resolve) => setTimeout(resolve, 60));
  };
  return { ctx, screens, log, text, press };
}
