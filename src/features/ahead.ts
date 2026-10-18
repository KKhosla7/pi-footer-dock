import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import { aheadFailure, readAhead } from '../adapters/git-ahead.js';
import { aheadLines } from '../core/ahead-lines.js';
import type { AheadReport } from '../core/ahead-parse.js';
import { openInfoScreen } from '../ui/info-screen.js';

/** Click on the ahead icon: where the branch is, and the commits ahead of its upstream. */
export async function showAhead(ctx: ExtensionContext): Promise<void> {
  const now = Date.now();
  let report: AheadReport | undefined;
  let failure = '';
  try {
    report = await readAhead(ctx.cwd, AbortSignal.timeout(5000));
  } catch (error) {
    failure = aheadFailure(error);
  }
  await openInfoScreen(ctx, {
    title: 'Ahead of upstream',
    lines: (theme, width) =>
      report
        ? aheadLines(report, { theme, width, now })
        : [truncateToWidth(theme.fg('error', failure), width, '…')],
  });
}
