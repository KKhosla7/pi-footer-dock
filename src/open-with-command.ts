import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { defaultOpener, parseOpenWith, splitCommand } from './core/open-folder.js';
import type { SettingsController } from './settings-controller.js';
import { say } from './notify.js';

/** `/dock-open-with`: show, set (`thunar {path}`) or clear (`default`) the app that opens the folder. */
export function runOpenWith(
  args: string,
  ctx: ExtensionContext,
  settings: SettingsController,
): void {
  const text = args.trim();
  const { openWith: current, ...rest } = settings.current;
  const tell = (message: string): void => {
    say(ctx, message, 'info');
  };
  if (text === '') {
    tell(`The project folder opens with: ${current?.join(' ') ?? defaultOpener(process.platform)}`);
    return;
  }
  try {
    const next =
      text === 'default' ? rest : { ...rest, openWith: parseOpenWith(splitCommand(text)) };
    const failure = settings.update(next);
    tell(
      text === 'default'
        ? `The project folder opens with ${defaultOpener(process.platform)} again.`
        : `The project folder opens with: ${splitCommand(text).join(' ')}`,
    );
    if (failure) say(ctx, failure, 'warning');
  } catch (error) {
    say(ctx, `Not changed: ${(error as Error).message}`, 'warning');
  }
}
