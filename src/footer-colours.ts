import type { Theme } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import type { FooterConfig } from './core/footer-config.js';
import type { SettingsController } from './settings-controller.js';
import { parseColor } from '@earendil-works/pi-tui';
import { contrast, createPaint, luminanceOf } from './ui/palette.js';
import type { Paint } from './ui/palette.js';
import { TerminalBackground } from './ui/terminal-background.js';

export class FooterColours {
  readonly background = new TerminalBackground();
  private tui: Pick<TUI, 'requestRender'> | undefined;

  paint(theme: Theme, settings: SettingsController, config: () => FooterConfig): Paint {
    return createPaint(
      theme,
      () => settings.paintSettings(config()),
      () => this.background.value,
    );
  }

  watch(tui: TUI): () => void {
    this.tui = tui;
    const stop = this.background.watch(tui, () => {
      tui.requestRender();
    });
    return () => {
      stop();
      if (this.tui === tui) this.tui = undefined;
    };
  }

  contrastOf = (hex: string): number | undefined => {
    const background = this.background.value;
    return background ? contrast(parseColor(hex), luminanceOf(background)) : undefined;
  };

  describeBackground = (): string => {
    const { r, g, b } = this.background.value ?? {};
    if (r === undefined || g === undefined || b === undefined)
      return "terminal background: not reported (Footer Dock follows your Pi theme's light or dark)";
    const hex = [r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('');
    return `terminal background: #${hex} (reported by your terminal)`;
  };

  redraw(): void {
    this.tui?.requestRender();
  }
}
