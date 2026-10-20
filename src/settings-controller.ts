import { PRODUCT } from './core/product.js';
import { defaultSettings } from './core/settings.js';
import { nerdGlyphs, portableGlyphs } from './ui/glyphs.js';
import type { Glyphs } from './ui/glyphs.js';
import type { Settings } from './core/settings.js';
import type { SettingsLoad } from './adapters/settings-file.js';

const GLYPH_HINT = `${PRODUCT}: if the icons look like empty boxes, your terminal font has no Nerd Font symbols. Run /dock-glyphs for plain symbols, or install a Nerd Font.`;

export interface SettingsStore {
  load: () => SettingsLoad;
  save: (settings: Settings) => void;
}

/** Holds the global settings in memory and keeps the file in step; knows nothing about the footer. */
export class SettingsController {
  current: Settings = defaultSettings();
  /** The /dock-glyphs toggle overrides the saved icon preference until the menu changes it. */
  private toggled: Glyphs | undefined;
  constructor(private readonly store: SettingsStore) {}

  get glyphs(): Glyphs {
    return this.toggled ?? (this.current.glyphs === 'portable' ? portableGlyphs : nerdGlyphs);
  }
  toggleGlyphs(): void {
    this.toggled = this.glyphs === nerdGlyphs ? portableGlyphs : nerdGlyphs;
  }
  followSavedGlyphs(): void {
    this.toggled = undefined;
  }
  /** Set while the file on disk was ignored: it must not be overwritten with defaults. */
  private ignored = false;
  /** Re-reads the file; says why through `report` if it had to be ignored. */
  load(report: (message: string) => void): void {
    const { settings, problem } = this.store.load();
    this.current = settings;
    this.ignored = problem !== undefined;
    if (problem) report(`${PRODUCT} settings ignored: ${problem}.`);
  }
  /**
   * Once, for a user who never chose an icon set: what to do if the icons are not drawn (a
   * terminal cannot tell us its font). Never touches a file that was ignored; a failed save only
   * means the note may come again.
   */
  announceGlyphs(report: (message: string) => void): void {
    const { glyphs, glyphHintShown } = this.current;
    if (this.ignored || glyphs !== undefined || glyphHintShown) return;
    report(GLYPH_HINT);
    this.update({ ...this.current, glyphHintShown: true });
  }
  /** Applies a change in memory first, so the footer follows even if saving fails. */
  update(next: Settings): string | undefined {
    this.current = next;
    try {
      this.store.save(next);
      return undefined;
    } catch {
      return 'Settings are applied for this session but could not be saved.';
    }
  }
}
