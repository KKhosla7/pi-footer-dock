import { quietExtensions } from './quiet-extensions.js';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ExtensionBus } from '../../src/adapters/ext-bus.js';
import type { OpenResult } from '../../src/adapters/folder-opener.js';
import { defaultSettings } from '../../src/core/settings.js';
import type { Settings } from '../../src/core/settings.js';
import { FooterInteractions } from '../../src/footer-interactions.js';
import { portableGlyphs } from '../../src/ui/glyphs.js';
import { demoSnapshot } from '../reference.js';

/** Footer interactions over fakes: the folder opener, the notices, and a session context. */
export function harness(
  settings: Settings = defaultSettings(),
  result: OpenResult = { ok: true },
  extensions: ExtensionBus = quietExtensions(),
) {
  const opened: string[] = [];
  const notices: { message: string; level: string }[] = [];
  const pi = {
    events: { on: () => () => undefined, emit: () => undefined },
    appendEntry: () => undefined,
  };
  const interactions = new FooterInteractions(
    pi as unknown as ExtensionAPI,
    () => demoSnapshot,
    () => undefined,
    {
      redraw: () => undefined,
      extensions,
      glyphs: () => portableGlyphs,
      settings: () => settings,
      openFolder: (directory) => {
        opened.push(directory);
        return Promise.resolve(result);
      },
    },
  );
  const ctx = {
    mode: 'tui',
    cwd: '/work/project',
    sessionManager: { getBranch: () => [] },
    ui: {
      notify: (message: string, level: string) => notices.push({ message, level }),
      select: () => Promise.resolve(undefined),
    },
  } as unknown as ExtensionContext;
  interactions.start(ctx);
  return { interactions, ctx, opened, notices };
}

interface Rendered {
  render(width: number): string[];
}
/** The harness with custom screens counted and kept, so a test can see what each one shows. */
export function screensHarness(
  settings: Settings = defaultSettings(),
  extensions: ExtensionBus = quietExtensions(),
) {
  const made = harness(settings, { ok: true }, extensions);
  const log = { opened: 0, closed: 0, views: [] as Rendered[] };
  const theme = { fg: (_colour: string, text: string) => text, bold: (text: string) => text };
  (made.ctx.ui as unknown as { custom: unknown }).custom = (
    factory: (...args: unknown[]) => Rendered,
  ) =>
    new Promise<void>((resolve) => {
      log.opened += 1;
      log.views.push(
        factory({ terminal: { rows: 20 } }, theme, undefined, () => {
          log.closed += 1;
          resolve();
        }),
      );
    });
  /** What screen number `index` shows, without terminal codes. */
  const shown = (index: number, width = 80): string =>
    (log.views[index]?.render(width) ?? []).join('\n');
  return { ...made, log, shown };
}
