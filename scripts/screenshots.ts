/**
 * Draws the pictures in README.md from the real code: the footer, the explanation screens, the
 * lists. Nothing here is a mock-up; change the code and run `npm run screenshots` to redraw them.
 * The pictures are SVG text, so they stay sharp and are reviewed like any other file.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { estimateApiCost } from '../src/core/api-cost.js';
import { readCacheUsage } from '../src/core/cache-usage.js';
import { compose } from '../src/core/explain/explainer.js';
import type { Explainer } from '../src/core/explain/explainer.js';
import { cache } from '../src/core/explain/items/cache.js';
import { cost } from '../src/core/explain/items/cost.js';
import { quota } from '../src/core/explain/items/quota.js';
import { renderBlocks } from '../src/core/explain/render.js';
import { periodCostsOf } from '../src/core/history/costs.js';
import type { HistoryRow } from '../src/core/history/rows.js';
import type { Snapshot } from '../src/core/model.js';
import type { ChangedFile } from '../src/core/changed-files.js';
import { changedFilesParts } from '../src/ui/changed-files-view.js';
import { themeStyle } from '../src/ui/explain-style.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { openPicker } from '../src/ui/list-picker.js';
import { createPaint } from '../src/ui/palette.js';
import { diffLine } from '../src/core/diff-lines.js';
import { changeRanges, formatRanges, numberLines } from '../src/core/diff-numbers.js';

const OUT = join(import.meta.dirname, '..', 'docs', 'images');
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const HOUR = 3_600_000;

/** A dark terminal palette; the tones are the ones Pi's themes have. */
const COLOURS: Record<string, [number, number, number]> = {
  accent: [180, 160, 229],
  success: [126, 211, 139],
  warning: [229, 192, 123],
  error: [240, 113, 120],
  muted: [160, 166, 176],
  dim: [105, 112, 124],
  text: [212, 214, 218],
  border: [72, 78, 90],
};
const rgb = (name: string): string =>
  `\u001b[38;2;${(COLOURS[name] ?? COLOURS.text ?? [212, 214, 218]).join(';')}m`;
const theme = {
  fg: (name: string, text: string) => `${rgb(name)}${text}\u001b[39m`,
  bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
  underline: (text: string) => `\u001b[4m${text}\u001b[24m`,
} as unknown as Theme;

// ---- ANSI text to SVG ------------------------------------------------------------------------
interface Run {
  text: string;
  colour: string;
  bold: boolean;
}
function runs(line: string): Run[] {
  const out: Run[] = [];
  let colour = '#d4d6da';
  let bold = false;
  let rest = line;
  for (;;) {
    const at = rest.indexOf('\u001b[');
    const text = at < 0 ? rest : rest.slice(0, at);
    if (text) out.push({ text, colour, bold });
    if (at < 0) return out;
    const end = rest.indexOf('m', at);
    const codes = rest
      .slice(at + 2, end)
      .split(';')
      .map(Number);
    if (codes[0] === 38 && codes[1] === 2) colour = `rgb(${codes[2]},${codes[3]},${codes[4]})`;
    else if (codes[0] === 39 || codes[0] === 0) {
      colour = '#d4d6da';
      if (codes[0] === 0) bold = false;
    } else if (codes[0] === 1) bold = true;
    else if (codes[0] === 22) bold = false;
    rest = rest.slice(end + 1);
  }
}
const escape = (text: string): string =>
  text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

function svg(lines: readonly string[], columns: number, title: string): string {
  const cell = 8.7;
  const height = 20;
  const pad = 18;
  const width = Math.ceil(columns * cell + pad * 2);
  const total = lines.length * height + pad * 2 + 26;
  const body = lines
    .map((line, index) => {
      const spans = runs(line)
        .map(
          (run) =>
            `<tspan fill="${run.colour}"${run.bold ? ' font-weight="bold"' : ''}>${escape(run.text)}</tspan>`,
        )
        .join('');
      return `<text x="${pad}" y="${pad + 26 + (index + 1) * height - 5}" xml:space="preserve">${spans}</text>`;
    })
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" role="img" aria-label="${escape(title)}">
  <title>${escape(title)}</title>
  <rect width="${width}" height="${total}" rx="10" fill="#14161a"/>
  <circle cx="22" cy="19" r="5" fill="#f07178"/><circle cx="40" cy="19" r="5" fill="#e5c07b"/><circle cx="58" cy="19" r="5" fill="#7ed38b"/>
  <g font-family="'DejaVu Sans Mono','JetBrains Mono',Menlo,Consolas,monospace" font-size="14">
  ${body}
  </g>
</svg>
`;
}
function save(name: string, lines: readonly string[], columns: number, title: string): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.svg`), svg(lines, columns, title));
  process.stdout.write(`${name}.svg\n`);
}

// ---- A believable session --------------------------------------------------------------------
const day = (offset: number): string => {
  const date = new Date(NOW - offset * 24 * HOUR);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};
const row = (
  offset: number,
  project: string,
  model: string,
  dollars: number,
  gap: HistoryRow['gap'],
  read: number,
): HistoryRow => ({
  day: day(offset),
  project,
  provider: 'opencode-go',
  model,
  api: 'openai-completions',
  gap,
  responses: 40,
  input: 100_000,
  output: 9_000,
  read,
  write: 0,
  cost: dollars,
  unpriced: 0,
});
const history: HistoryRow[] = Array.from({ length: 14 }, (_, index) => [
  row(13 - index, 'a', 'deepseek-v4.1-flash', 2 + ((index * 7) % 9), '1m', 3_900_000),
  row(13 - index, 'b', 'kimi-k3', 0.4 + (index % 4) * 0.3, '5m', 700_000),
]).flat();
const showcase: Snapshot = {
  cwd: '/home/you/Projects/my-app',
  home: '/home/you',
  git: { branch: 'feature/login', changed: 3, ahead: 2 },
  tokens: 148_000,
  capacity: 200_000,
  percent: 74,
  compactRemaining: 38_000,
  compactAt: 90,
  compactReserve: 20_000,
  autoCompact: true,
  totals: { input: 1_840_000, output: 96_000, cacheRead: 21_400_000, cacheWrite: 0, cost: 12.4 },
  provider: 'opencode-go',
  model: 'deepseek-v4.1-flash',
  thinking: 'high',
  api: 'openai-completions',
  rateLimits: {
    provider: 'opencode-go',
    model: 'deepseek-v4.1-flash',
    windows: [
      { label: '5h', remainingPercent: 41, resetAt: (NOW + 2.5 * HOUR) / 1000 },
      { label: 'week', remainingPercent: 72, resetAt: (NOW + 84 * HOUR) / 1000 },
      { label: 'month', remainingPercent: 55, resetAt: (NOW + 300 * HOUR) / 1000 },
    ],
  },
  quotaFreshness: { ageMs: 0, receivedMono: 0, observedAt: NOW - 35_000 },
  outputTokensPerSecond: 62.4,
  cacheUsage: readCacheUsage({ input: 2_400, cacheRead: 146_000, cacheWrite: 0 }),
  cacheIdleMs: 25_000,
  cachePolicy: { short: null, long: null },
  apiCostEstimate: estimateApiCost([
    {
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
      usage: {
        input: 120_000,
        output: 9_000,
        cacheRead: 3_400_000,
        cacheWrite: 0,
        totalTokens: 3_529_000,
        cost: { input: 0.12, output: 0.25, cacheRead: 0.51, cacheWrite: 0, total: 0.88 },
      },
    },
  ]),
  historyCosts: periodCostsOf(history, new Date(NOW)),
  history: { rows: history, projects: { a: 'my-app', b: 'docs-site' } },
};

// ---- Pictures --------------------------------------------------------------------------------
function footer(name: string, width: number, title: string): void {
  const layout = layoutFooter(showcase, width, {
    paint: createPaint(theme),
    glyphs: portableGlyphs,
    now: NOW,
  });
  save(name, layout.lines, width, title);
}
footer('footer-wide', 150, 'The Footer Dock footer on a wide terminal');
footer('footer-narrow', 70, 'The Footer Dock footer on a narrow terminal');

function screen(
  name: string,
  title: string,
  explainer: Explainer,
  period: 'day' | 'week' | 'month',
  rows: number,
): void {
  const columns = 112;
  const doc = compose(explainer, {
    snapshot: showcase,
    now: NOW,
    value: '',
    ascii: false,
    period,
    quotaLabel: 'OpenCode Go',
  });
  const style = themeStyle(theme);
  const rule = theme.fg('border', '─'.repeat(columns));
  const body = renderBlocks(doc.body, style, columns - 1).slice(0, rows);
  const lines = [
    rule,
    theme.bold(theme.fg('accent', ` Footer Dock › About ${doc.title}`)),
    '',
    ...renderBlocks(doc.headline, style, columns - 1),
    ...body,
    '',
    theme.fg('dim', '  ↑/↓ scroll · d/w/m period · Esc to close  (1-12/36)'),
    rule,
  ];
  save(name, lines, columns, title);
}
screen('explain-cache', 'The cache explanation', cache, 'month', 16);
screen('explain-limits', 'The limit usage explanation with pace', quota, 'month', 14);
screen('explain-cost', 'The cost explanation with the chart', cost, 'day', 24);

function changedFiles(): void {
  const file = (
    path: string,
    status: ChangedFile['status'],
    added: number | null,
    removed: number | null,
    lines: number,
  ): ChangedFile => ({ path, status, added, removed, size: { kind: 'lines', lines } });
  const files = [
    file('src/auth/login.ts', 'M', 142, 9, 310),
    file('src/auth/session.ts', 'M', 37, 21, 120),
    file('tests/login.test.ts', 'A', 88, 0, 88),
    file('docs/auth.md', 'M', 14, 2, 60),
  ];
  const parts = changedFilesParts({ kind: 'files', files }, theme, 100);
  const lines = [
    '',
    ...parts.header,
    ...parts.rows.map(
      (line, index) => (index === 0 ? theme.fg('accent', '→ ') : '  ') + line.slice(1),
    ),
    ...parts.footer,
  ];
  save(
    'changed-files',
    [
      theme.fg('border', '─'.repeat(100)),
      theme.bold(theme.fg('accent', ' Footer Dock › Changed files')),
      ...lines,
      '',
      theme.fg('dim', '  ↑/↓ move · Enter diff · Esc to close  (1/4)'),
      theme.fg('border', '─'.repeat(100)),
    ],
    100,
    'Changed files with a diffstat',
  );
}
changedFiles();

function diff(): void {
  const raw = [
    'diff --git a/src/auth/login.ts b/src/auth/login.ts',
    '--- a/src/auth/login.ts',
    '+++ b/src/auth/login.ts',
    '@@ -40,7 +40,9 @@ export async function login(',
    ' ) {',
    '   const user = await find(email);',
    '-  if (user.password === password) {',
    '+  if (!user) return fail("unknown user");',
    '+  if (await verify(password, user.hash)) {',
    '     return session(user);',
    '   }',
    '   return fail("bad password");',
    ' }',
  ];
  const numbered = numberLines(raw);
  const style = {
    fg: (name: 'accent' | 'success' | 'error' | 'muted' | 'dim', text: string) =>
      theme.fg(name, text),
  };
  const body = numbered.map((line) =>
    diffLine(
      line.raw,
      style,
      100,
      line.newNo === undefined ? '   ' : String(line.newNo).padStart(3),
    ),
  );
  save(
    'diff',
    [
      theme.fg('border', '─'.repeat(100)),
      theme.bold(theme.fg('accent', ' Footer Dock › Changed files › Diff')),
      '',
      ` ${theme.fg('warning', 'M')} src/auth/login.ts  ${theme.fg('success', '+142')} ${theme.fg('error', '−9')}`,
      theme.fg('muted', ` Changed lines: ${formatRanges(changeRanges(numbered))}`),
      theme.fg('dim', ' First change: src/auth/login.ts:42'),
      '',
      ...body,
      '',
      theme.fg('dim', '  ↑/↓ scroll · Esc to close'),
      theme.fg('border', '─'.repeat(100)),
    ],
    100,
    'A diff with line numbers',
  );
}
diff();

function picker(): void {
  const choices = ['deepseek-v4.1-flash', 'deepseek-v4-pro', 'gpt-6', 'kimi-k3', 'glm-5.3'].map(
    (id, index) => ({
      id,
      search: id,
      row: (t: Theme) =>
        `${index === 0 ? t.fg('accent', '✓ ') : '  '}${id} ${t.fg('muted', `[${index < 2 ? 'opencode-go' : index === 2 ? 'openai-codex' : 'clinepass'}]`)}${index === 2 ? t.fg('muted', ' · default') : ''}`,
      ...(index === 0 ? { detail: 'Model name: DeepSeek V4.1 Flash' } : {}),
    }),
  );
  let lines: string[] = [];
  const ctx = {
    ui: {
      custom: (factory: (...args: unknown[]) => { render(width: number): string[] }) => {
        lines = factory({ terminal: { rows: 30 } }, theme, undefined, () => undefined).render(100);
        return new Promise(() => undefined);
      },
    },
  } as unknown as ExtensionContext;
  openPicker(ctx, { title: 'Models', searchable: true, action: 'Enter select', choices }).catch(
    () => undefined,
  );
  save('model-picker', lines, 100, 'Choosing a model');
}
picker();
