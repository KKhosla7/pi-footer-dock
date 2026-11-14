import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import type { Problem } from './core/problems.js';
import { say } from './notify.js';
import { ProblemState } from './problem-state.js';
import { openProblemsScreen } from './problems-screen.js';
import type { Settings } from './core/settings.js';
import type { SettingsController } from './settings-controller.js';
import { portableGlyphs } from './ui/glyphs.js';
import { closeInfoScreen } from './ui/info-screen.js';

export interface ProblemsHost {
  readonly state: ProblemState;
  load(): void;
  open(ctx: ExtensionContext): Promise<void>;
}

export class ProblemsController implements ProblemsHost {
  private readonly current = new ProblemState();
  private seen: readonly Problem[] | undefined;

  constructor(
    private readonly deps: {
      settings: SettingsController;
      interactions: () => { settingsChanged: (before: Settings) => void };
      tui: () => TUI | undefined;
    },
  ) {}

  get state(): ProblemState {
    this.load();
    return this.current;
  }
  load(): void {
    const { problems } = this.deps.settings;
    if (problems === this.seen) return;
    this.seen = problems;
    this.current.set(problems);
  }
  open(ctx: ExtensionContext): Promise<void> {
    const { settings, tui } = this.deps;
    return openProblemsScreen(ctx, {
      state: this.current,
      reread: (current) => {
        this.reread(current);
      },
      ascii: () => settings.glyphs.folder === portableGlyphs.folder,
      redraw: () => tui()?.requestRender(),
    });
  }
  reread(ctx: ExtensionContext): void {
    const { settings, interactions } = this.deps;
    const before = settings.current;
    settings.load(() => undefined);
    this.load();
    interactions().settingsChanged(before);
    if (this.current.count > 0) return;
    closeInfoScreen();
    say(ctx, 'Footer Dock applied your settings file.', 'info');
  }
}
