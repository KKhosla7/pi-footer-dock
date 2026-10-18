import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { demoSnapshot } from './reference.js';
import { DockFooter } from '../src/ui/footer.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { createPaint } from '../src/ui/palette.js';

const paint = createPaint({
  fg: (_color, text) => `\u001b[37m${text}\u001b[39m`,
  bold: (text) => `\u001b[1m${text}\u001b[22m`,
  underline: (text) => `\u001b[4m${text}\u001b[24m`,
});
const options = { paint, glyphs: portableGlyphs, now: 4_000_000_000_000 };
const plain = stripVTControlCharacters;

await test('screenshot fixture preserves exactly two rows, order and values', () => {
  const layout = layoutFooter(demoSnapshot, 220, options);
  assert.equal(layout.lines.length, 2);
  assert.match(
    plain(layout.lines[0] ?? ''),
    /~\/Projects\/fedora-hyprland-workstation.*main.*2.*1/u,
  );
  assert.match(
    plain(layout.lines[1] ?? ''),
    /87% of 1.0M.*compacts in 112k.*77.0M.*2.3M.*cache pending/u,
  );
  assert.doesNotMatch(plain(layout.lines[1] ?? ''), /▾|▴/u);
  assert.ok(!(layout.lines[1] ?? '').includes('\u001b[4m'));
  assert.ok(!(layout.lines[1] ?? '').includes('\u001b[48;'));
});

await test('wide reference adds model, thinking and quota meters without cost or orchestration', () => {
  const layout = layoutFooter(demoSnapshot, 220, options);
  const first = plain(layout.lines[0] ?? '');
  const second = plain(layout.lines[1] ?? '');
  assert.match(first, /opencode-go\/deepseek-v4\.1-flash.*high/u);
  assert.doesNotMatch(first, /alt\+i/u);
  assert.match(second, /5h [▰▱]{7} 34%.*week [▰▱]{7} 48%.*month [▰▱]{7} 18%/u);
  assert.doesNotMatch(second, /\$/u);
  assert.doesNotMatch(first + second, /trace|away|decision/u);
  assert.equal(visibleWidth(first.trimEnd()), 220);
  assert.equal(visibleWidth(second.trimEnd()), 220);
});

await test('brain and robot glyphs share the live theme accent while thinking text stays muted', () => {
  const themed = createPaint({
    fg: (color, text) => `\u001b[${color === 'accent' ? '36' : '90'}m${text}\u001b[39m`,
    bold: (text) => text,
    underline: (text) => text,
  });
  const layout = layoutFooter({ ...demoSnapshot, thinking: 'medium' }, 220, {
    ...options,
    paint: themed,
  });
  const first = layout.lines[0] ?? '';
  assert.ok(first.includes(`\u001b[36m${portableGlyphs.robot} \u001b[39m`));
  assert.ok(
    first.includes(`\u001b[36m${portableGlyphs.reasoning} \u001b[39m\u001b[90mmedium\u001b[39m`),
  );
});

await test('missing quotas show a clear status, not fabricated time windows', () => {
  const layout = layoutFooter({ ...demoSnapshot, rateLimits: null }, 140, options);
  const line = plain(layout.lines[1] ?? '');
  assert.match(line, /quota unavailable/u);
  assert.doesNotMatch(line, /\$/u);
  assert.doesNotMatch(line, /5h —|week —|month —/u);
});

await test('footer uses the terminal theme without imposing a background panel', () => {
  const { lines } = layoutFooter(demoSnapshot, 140, options);
  for (const line of lines) {
    assert.ok(!line.includes('\u001b[48;'));
    assert.equal(visibleWidth(line), 140);
  }
});

await test('all widths and wide/control-containing paths fit terminal columns', () => {
  for (let width = 0; width <= 180; width += 1) {
    const layout = layoutFooter(
      { ...demoSnapshot, cwd: '/tmp/项目/é\u001b\n名称' },
      width,
      options,
    );
    assert.equal(layout.lines.length, 2);
    for (const line of layout.lines) assert.equal(visibleWidth(line), width);
    assert.ok(!plain(layout.lines[0] ?? '').includes('\n'));
  }
});

await test('small nonzero context is never presented as an empty 0% session', () => {
  const cases = [
    [0, '0%'],
    [0.001, '<0.1%'],
    [0.2, '0.2%'],
    [0.8, '0.8%'],
    [87, '87%'],
  ] as const;
  for (const [percent, label] of cases) {
    const layout = layoutFooter({ ...demoSnapshot, percent }, 140, options);
    assert.ok(plain(layout.lines[1] ?? '').includes(`${label} of`));
  }
});

await test('unknown usage is unknown, not a zero percent or zero compaction countdown', () => {
  const layout = layoutFooter(
    { ...demoSnapshot, tokens: null, percent: null, compactRemaining: null },
    220,
    options,
  );
  const line = plain(layout.lines[1] ?? '');
  assert.match(line, /context pending \/ 1.0M.*awaiting usage/u);
  assert.ok(!line.includes('0%'));
});

await test('footer renders two adjacent content rows with no blank spacer', () => {
  let disposed = false;
  const footer = new DockFooter({
    ...options,
    snapshot: () => demoSnapshot,
    dispose: () => {
      disposed = true;
    },
  });
  assert.equal(footer.render(140).length, 2);
  assert.ok(!('handleInput' in footer));
  footer.invalidate();
  assert.equal(footer.render(140).length, 2);
  assert.ok(footer.render(140)[1]?.trim());
  footer.dispose();
  assert.equal(disposed, true);
});
