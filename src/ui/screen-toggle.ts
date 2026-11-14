import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { closeInfoScreen } from './info-screen.js';

export class ScreenToggle {
  private open: string | undefined;

  async toggle(
    key: string,
    action: (ctx: ExtensionContext) => Promise<void>,
    ctx: ExtensionContext,
  ): Promise<void> {
    const wasOpen = this.open;
    if (wasOpen !== undefined) closeInfoScreen();
    if (wasOpen === key) return;
    this.open = key;
    try {
      await action(ctx);
    } finally {
      if (this.open === key) this.open = undefined;
    }
  }
}
