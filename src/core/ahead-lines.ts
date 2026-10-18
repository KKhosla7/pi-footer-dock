import type { Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import { relativeTime } from './ahead-parse.js';
import type { AheadReport, CommitInfo, CommitStat } from './ahead-parse.js';

/** What drawing needs: the theme, the width, and "now" (so tests are deterministic). */
export interface AheadView {
  theme: Pick<Theme, 'fg' | 'bold'>;
  width: number;
  now: number;
}
export const AHEAD_LIMIT = 100;
export const SIDE_LIMIT = 10;

const fit = (text: string, view: AheadView): string => truncateToWidth(text, view.width, '…');
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

function statText(commit: CommitInfo, view: AheadView): string {
  const { theme } = view;
  const stat: CommitStat | undefined = commit.stat;
  if (!stat) return theme.fg('dim', commit.parents > 1 ? 'merge' : 'no text changes');
  return (
    theme.fg('muted', plural(stat.files, 'file')) +
    ' ' +
    theme.fg('success', `+${stat.added}`) +
    ' ' +
    theme.fg('error', `−${stat.deleted}`)
  );
}

/** One commit: `hash  subject`, then author, date and stat under the subject. */
function commitLines(commit: CommitInfo, view: AheadView): string[] {
  const { theme } = view;
  const prefix = `  ${commit.hash}  `;
  const subject = truncateToWidth(
    commit.subject || '(no subject)',
    Math.max(1, view.width - prefix.length),
    '…',
  );
  const meta = [
    theme.fg('muted', commit.author || 'unknown author'),
    theme.fg('dim', relativeTime(view.now, commit.when)),
    statText(commit, view),
  ].join(theme.fg('dim', ' · '));
  return [
    fit(theme.fg('accent', prefix.trimEnd()) + '  ' + theme.fg('text', subject), view),
    fit(' '.repeat(prefix.length) + meta, view),
  ];
}

function field(label: string, value: string, view: AheadView): string {
  return fit(`  ${view.theme.fg('muted', label.padEnd(13))}${value}`, view);
}
function commitSummary(commit: CommitInfo | undefined, view: AheadView): string {
  if (!commit) return view.theme.fg('dim', 'none');
  const when = view.theme.fg('dim', ` · ${relativeTime(view.now, commit.when)}`);
  return `${view.theme.fg('accent', commit.hash)}  ${commit.subject || '(no subject)'}${when}`;
}

function position(report: AheadReport, view: AheadView): string {
  const { theme } = view;
  if (!report.counts) return theme.fg('warning', 'ahead unknown (not zero)');
  const { ahead, behind } = report.counts;
  return `${theme.fg(ahead > 0 ? 'success' : 'dim', `ahead ${ahead}`)} · ${theme.fg(behind > 0 ? 'warning' : 'dim', `behind ${behind}`)}`;
}

function branchText(report: AheadReport): string {
  if (report.branch) return report.branch;
  return report.head ? `detached HEAD at ${report.head.hash}` : 'detached HEAD';
}

function upstreamText(report: AheadReport, view: AheadView): string {
  const { upstream } = report;
  if (upstream) {
    return upstream.tip ? upstream.name : `${upstream.name} ${view.theme.fg('warning', '[gone]')}`;
  }
  return view.theme.fg('warning', 'no upstream configured');
}

function whereBlock(report: AheadReport, view: AheadView): string[] {
  const { theme } = view;
  const lines = [
    fit(theme.bold(theme.fg('accent', 'Where git is')), view),
    field('Branch', branchText(report), view),
    field('Upstream', upstreamText(report, view), view),
    field('HEAD', commitSummary(report.head, view), view),
  ];
  if (report.upstream?.tip)
    lines.push(field('Upstream tip', commitSummary(report.upstream.tip, view), view));
  lines.push(field('Position', position(report, view), view));
  lines.push(
    fit(theme.fg('dim', '  As of the last fetch (no network); run git fetch to refresh.'), view),
  );
  if (report.shallow)
    lines.push(
      fit(theme.fg('warning', '  Shallow clone: history is cut, counts may be too high.'), view),
    );
  return lines;
}

function heading(text: string, view: AheadView): string {
  return fit(view.theme.bold(view.theme.fg('accent', text)), view);
}
const note = (text: string, view: AheadView): string =>
  fit(`  ${view.theme.fg('dim', text)}`, view);

function commitList(commits: CommitInfo[], total: number, view: AheadView): string[] {
  const lines = commits.flatMap((commit) => commitLines(commit, view));
  if (total > commits.length) lines.push(note(`… ${total - commits.length} more`, view));
  return lines;
}

function whyUnknown(report: AheadReport): string {
  if (!report.head) return 'No commits yet.';
  if (report.upstream) return `Upstream ${report.upstream.name} is gone (deleted on the remote).`;
  return report.branch ? 'This branch has no upstream configured.' : 'HEAD is detached.';
}

function sections(report: AheadReport, view: AheadView): string[][] {
  const { counts, upstream } = report;
  if (!counts || !upstream) {
    const unknown = [
      heading('Ahead: unknown', view),
      note(`${whyUnknown(report)} Ahead is unknown, not zero.`, view),
    ];
    return report.recent.length
      ? [
          unknown,
          [
            heading('Recent local commits (context, not a count)', view),
            ...commitList(report.recent, report.recent.length, view),
          ],
        ]
      : [unknown];
  }
  const ahead = [heading(`Commits ahead of ${upstream.name} (${counts.ahead})`, view)];
  ahead.push(
    ...(counts.ahead
      ? commitList(report.ahead, counts.ahead, view)
      : [note('Nothing to push.', view)]),
  );
  if (!counts.behind) return [ahead];
  const behind = [heading(`Behind ${upstream.name} (${counts.behind})`, view)];
  return [ahead, [...behind, ...commitList(report.behind, counts.behind, view)]];
}

/** The whole screen body for one width. */
export function aheadLines(report: AheadReport, view: AheadView): string[] {
  return [whereBlock(report, view), ...sections(report, view)].flatMap((block, index) =>
    index ? ['', ...block] : block,
  );
}
