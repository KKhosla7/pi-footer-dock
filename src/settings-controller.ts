import { formatProblems } from './core/problems.js';
import type { Problem } from './core/problems.js';
import { PRODUCT } from './core/product.js';
import { effectiveColors } from './core/colors.js';
import { autoGlyphs } from './core/glyph-auto.js';
import { defaultSettings } from './core/settings.js';
import { nerdGlyphs, portableGlyphs } from './ui/glyphs.js';
import type { PaintSettings } from './ui/palette.js';
import type { Glyphs } from './ui/glyphs.js';
import type { FooterConfig } from './core/footer-config.js';
import type { Settings } from './core/settings.js';
import type { SettingsLoad } from './adapters/settings-file.js';

const GLYPH_HINT = `${PRODUCT}: if the icons look like empty boxes, your terminal font has no Nerd Font symbols. Run /dock-glyphs for plain symbols, or install a Nerd Font.`;

export interface SettingsStore {
  load: () => SettingsLoad;
  save: (settings: Settings) => void;
}

export class SettingsController {
  current: Settings = defaultSettings();
  problems: readonly Problem[] = [];
  private toggled: Glyphs | undefined;
  constructor(
    private readonly store: SettingsStore,
    private readonly env: Readonly<Record<string, string | undefined>> = process.env,
  ) {}

  private painting:
    { source: Settings; meter: string | undefined; value: PaintSettings } | undefined;
  paintSettings(config: Pick<FooterConfig, 'slots'>): PaintSettings {
    const meter = config.slots.quota?.meterColor;
    const iconBold = this.current.iconBold !== false && this.glyphs !== nerdGlyphs;
    if (
      this.painting?.source !== this.current ||
      this.painting.meter !== meter ||
      this.painting.value.iconBold !== iconBold
    )
      this.painting = {
        source: this.current,
        meter,
        value: { colors: effectiveColors(this.current, meter), iconBold },
      };
    return this.painting.value;
  }
  get glyphs(): Glyphs {
    const saved = this.current.glyphs ?? autoGlyphs(this.env);
    return this.toggled ?? (saved === 'portable' ? portableGlyphs : nerdGlyphs);
  }
  get iconKind(): 'nerd' | 'portable' {
    return this.glyphs === portableGlyphs ? 'portable' : 'nerd';
  }
  toggleGlyphs(): void {
    this.toggled = this.glyphs === nerdGlyphs ? portableGlyphs : nerdGlyphs;
  }
  followSavedGlyphs(): void {
    this.toggled = undefined;
  }
  private ignored = false;
  load(report: (message: string) => void): void {
    const { settings, problem, problems } = this.store.load();
    this.current = settings;
    this.problems = problems ?? [];
    this.ignored = problem !== undefined;
    if (problems && problems.length > 0)
      report(
        formatProblems(
          `${PRODUCT} did not apply your settings file and runs on its defaults, nothing in the file was changed`,
          problems,
        ),
      );
    else if (problem) report(`${PRODUCT} settings ignored: ${problem}.`);
  }
  announceGlyphs(report: (message: string) => void): void {
    const { glyphs, glyphHintShown } = this.current;
    if (this.ignored || glyphs !== undefined || glyphHintShown) return;
    if (autoGlyphs(this.env) !== 'nerd') return;
    report(GLYPH_HINT);
    this.update({ ...this.current, glyphHintShown: true });
  }
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
