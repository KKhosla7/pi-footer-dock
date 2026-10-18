import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ExtensionRegistry } from './core/ext/registry.js';
import type { FooterConfig } from './core/footer-config.js';
import type { Period } from './core/history/period.js';
import type { Snapshot } from './core/model.js';
import { explainDoc } from './explain-item.js';
import { explainText, openExplainScreen } from './explain-screen.js';
import { portableGlyphs } from './ui/glyphs.js';
import type { Glyphs } from './ui/glyphs.js';
import { say } from './notify.js';

/** Shows the explanation of a footer item, as a live screen (a click) or as a notice (a command). */
export class ExplainPresenter {
  constructor(
    private readonly source: {
      config: () => FooterConfig;
      snapshot: () => Snapshot;
      glyphs: () => Glyphs;
      extensions: () => ExtensionRegistry;
    },
  ) {}

  private ascii(): boolean {
    return this.source.glyphs().folder === portableGlyphs.folder;
  }
  private doc(id: string, period?: Period) {
    return explainDoc(id, {
      config: this.source.config(),
      snapshot: this.source.snapshot(),
      glyphs: this.source.glyphs(),
      extensions: this.source.extensions(),
      ...(period ? { period } : {}),
    });
  }
  /** The explanation as a notice: the keyboard path, `/dock-info`. */
  notice(id: string, ctx: ExtensionContext): void {
    if (ctx.mode !== 'tui') return;
    const found = this.doc(id);
    if (!found) {
      say(ctx, 'Unknown/hidden slot. Use /dock-info with a visible slot ID.', 'info');
      return;
    }
    say(
      ctx,
      `${id}: ${found.value || 'not currently available'}\n${explainText(found, this.ascii())}`,
      'info',
    );
  }
  /** The explanation as a live screen, like the ones the icons open; the same click closes it. */
  async screen(id: string, ctx: ExtensionContext): Promise<void> {
    const found = this.doc(id);
    if (!found) {
      this.notice(id, ctx);
      return;
    }
    const chosen = this.source.config().slots.cost?.period;
    await openExplainScreen(ctx, {
      title: found.title,
      current: (period) => this.doc(id, period),
      ascii: () => this.ascii(),
      ...(id === 'cost' && chosen && chosen !== 'session' ? { initial: chosen } : {}),
    });
  }
}
